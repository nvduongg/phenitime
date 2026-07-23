const { DEFAULT_SCHEDULING_CONFIG } = require('./system-config.service');
const {
    requiresSchedulingForCourse,
    requiresSchedulingForSection,
    normalizeLearningType,
} = require('../utils/learningModes');
const {
    resolveSectionClassType,
    resolveSectionRoomTypeReq,
} = require('../utils/sectionClassType');
const { resolveSectionSchedulingEvents } = require('../utils/sectionSchedulingEvents');
const {
    resolveSchedulingWave,
    loadExistingOccupancy,
    applyWaveWeekOffset,
} = require('../utils/schedulerWaveContext');

const VIRTUAL_ROOM_ID_PATTERN = /^(ONLINE|MsTeam|ELN|MSTEAM)/i

function isVirtualSchedulingRoom(room) {
    const roomType = normalizeLearningType(room.room_type)
    if (roomType === 'ONLINE') {
        return true
    }

    const roomId = String(room.room_id || '').trim()
    if (VIRTUAL_ROOM_ID_PATTERN.test(roomId)) {
        return true
    }

    return /elearning|msteam|online/i.test(roomId)
}

function filterPhysicalSchedulingRooms(rooms) {
    return rooms.filter((room) => !isVirtualSchedulingRoom(room));
}

function shouldSkipSchedulingSection(section) {
    return !requiresSchedulingForSection(section);
}

function normalizeCohortIds(value) {
    if (!value) {
        return [];
    }
    const list = Array.isArray(value) ? value : [value];
    return [...new Set(list.map((id) => String(id).trim()).filter(Boolean))];
}

function filterSectionsByCohortIds(sections, cohortIds) {
    if (!cohortIds?.length) {
        return sections;
    }

    return sections.filter((section) =>
        (section.student_groups || []).some((group) =>
            cohortIds.includes(String(group.curriculum?.cohort_id || '')),
        ),
    );
}

function buildSchedulerEvents(
    sections,
    shiftDuration = DEFAULT_SCHEDULING_CONFIG.shift_duration,
    schedulingConfig = DEFAULT_SCHEDULING_CONFIG,
) {
    const blockSize = Number(shiftDuration) || DEFAULT_SCHEDULING_CONFIG.shift_duration;
    const events = [];

    for (const section of sections) {
        const course = section.course || {};
        const classType = resolveSectionClassType(section);
        const schedulingSection = { ...section, class_type: classType };

        if (shouldSkipSchedulingSection(schedulingSection)) {
            continue;
        }

        if (!requiresSchedulingForCourse(course)) {
            continue;
        }

        const {
            events: schedulingEvents,
            scheduleParams,
        } = resolveSectionSchedulingEvents(schedulingSection, schedulingConfig);

        if (!schedulingEvents.length) {
            continue;
        }

        const roomTypeReq = normalizeLearningType(
            resolveSectionRoomTypeReq(schedulingSection, classType),
        );
        const studentGroups = (section.student_groups || [])
            .map((group) => group.group_id)
            .filter(Boolean);

        for (const session of schedulingEvents) {
            const part = session.event_part;
            events.push({
                event_id: `${section.section_id}_Part${part}`,
                section_id: section.section_id,
                course_id: section.course_id,
                lecturer_id: section.lecturer_id || null,
                class_type: classType,
                duration: session.duration ?? blockSize,
                weekly_periods: session.weekly_periods ?? scheduleParams?.stPerWeek,
                event_part: part,
                week_from: session.week_from ?? null,
                week_to: session.week_to ?? null,
                rhythm_mode: session.rhythm_mode ?? null,
                capacity: section.capacity,
                student_groups: studentGroups,
                room_type_req: roomTypeReq,
            });
        }
    }

    return events;
}

async function getSolverPreflight(prisma, semesterId) {
    const [sectionCount, roomCount, rooms] = await Promise.all([
        prisma.courseSection.count({ where: { semester_id: semesterId } }),
        prisma.room.count(),
        prisma.room.findMany({
            select: {
                room_id: true,
                capacity: true,
                room_type: true,
            },
            orderBy: { room_id: 'asc' },
        }),
    ]);

    return {
        sectionCount,
        roomCount,
        rooms: rooms.map((room) => ({
            room_id: room.room_id,
            capacity: Number(room.capacity) || 0,
            room_type: String(room.room_type || '').trim().toUpperCase(),
        })),
        physicalRooms: filterPhysicalSchedulingRooms(rooms.map((room) => ({
            room_id: room.room_id,
            capacity: Number(room.capacity) || 0,
            room_type: String(room.room_type || '').trim().toUpperCase(),
        }))),
    };
}

async function buildSolvePayload(prisma, semesterId, config = {}, options = {}) {
    const mergedConfig = {
        ...DEFAULT_SCHEDULING_CONFIG,
        ...config,
    };
    const cohortIdsFromOptions = normalizeCohortIds(options.cohort_ids);
    const wave = await resolveSchedulingWave(prisma, semesterId, {
        waveId: options.wave_id,
        cohortIds: cohortIdsFromOptions,
    });
    const cohortIds = normalizeCohortIds(
        wave?.cohort_ids?.length ? wave.cohort_ids : cohortIdsFromOptions,
    );
    const waveStartWeek = wave?.start_week || 1;
    const shiftDuration = Number(mergedConfig.shift_duration) || DEFAULT_SCHEDULING_CONFIG.shift_duration;
    const preflight = await getSolverPreflight(prisma, semesterId);

    if (preflight.sectionCount === 0) {
        throw new Error(
            `No course sections found for semester '${semesterId}'. Import or generate sections first.`,
        );
    }

    if (preflight.roomCount === 0) {
        throw new Error('Room master data is empty. Add rooms before running the AI scheduler.');
    }

    const allSections = await prisma.courseSection.findMany({
        where: { semester_id: semesterId },
        include: {
            course: true,
            student_groups: {
                include: { curriculum: true },
            },
        },
        orderBy: { section_id: 'asc' },
    });

    const sections = filterSectionsByCohortIds(allSections, cohortIds);

    if (sections.length === 0) {
        const cohortLabel = cohortIds.length > 0 ? cohortIds.join(', ') : 'selected cohorts';
        throw new Error(
            `No course sections found for semester '${semesterId}' and cohort(s) ${cohortLabel}.`,
        );
    }

    if (wave && waveStartWeek > 1) {
        console.log(
            `[scheduler.service] Wave ${wave.wave_name || wave.wave_order} `
            + `(start week ${waveStartWeek}) for cohort(s) ${cohortIds.join(', ')}.`,
        );
    }

    let events = buildSchedulerEvents(sections, shiftDuration, mergedConfig);
    events = applyWaveWeekOffset(events, waveStartWeek);

    if (events.length === 0) {
        throw new Error(
            `No schedulable events were generated for semester '${semesterId}'. `
            + 'Check course credits, class types, and section metadata.',
        );
    }

    const scopedSectionIds = sections.map((section) => section.section_id);
    const existingOccupancy = await loadExistingOccupancy(
        prisma,
        semesterId,
        scopedSectionIds,
    );

    const multiSessionSections = new Set(
        events.map((event) => event.section_id),
    ).size;
    const splitEventCount = events.filter((event) => event.event_part > 1).length;

    console.log(
        `[scheduler.service] Built ${events.length} scheduling events `
        + `from ${sections.length} sections (${splitEventCount} split parts, `
        + `${multiSessionSections} sections represented).`,
    );

    return {
        semester_id: semesterId,
        wave_id: wave?.wave_id || null,
        wave_order: wave?.wave_order || null,
        wave_start_week: waveStartWeek,
        cohort_ids: cohortIds,
        scoped_section_ids: scopedSectionIds,
        config: {
            shift_duration: shiftDuration,
            max_lecturer_shifts_per_day:
                mergedConfig.max_lecturer_shifts_per_day
                ?? DEFAULT_SCHEDULING_CONFIG.max_lecturer_shifts_per_day,
            allowed_start_periods: mergedConfig.allowed_start_periods || mergedConfig.regular_starts,
            regular_starts: mergedConfig.regular_starts,
            evening_starts: mergedConfig.evening_starts,
            allowed_days: mergedConfig.allowed_days,
            solver_max_time_seconds: mergedConfig.solver_max_time_seconds,
            solver_num_workers: mergedConfig.solver_num_workers,
            enable_relaxation_pass: mergedConfig.enable_relaxation_pass !== false,
            relaxation_max_time_seconds: mergedConfig.relaxation_max_time_seconds,
            soft_capacity_ratio: mergedConfig.soft_capacity_ratio,
            relaxed_max_shifts_per_day: mergedConfig.relaxed_max_shifts_per_day,
            enable_lns_pass: mergedConfig.enable_lns_pass !== false,
            lns_max_iterations: mergedConfig.lns_max_iterations,
            lns_max_neighborhood: mergedConfig.lns_max_neighborhood,
            lns_max_time_seconds: mergedConfig.lns_max_time_seconds,
            existing_occupancy: existingOccupancy,
            fixed_room_per_section: mergedConfig.fixed_room_per_section !== false,
            virtual_room_capacity: mergedConfig.virtual_room_capacity,
            max_student_group_sessions_per_day: mergedConfig.max_student_group_sessions_per_day ?? 3,
        },
        persist: false,
        rooms: preflight.physicalRooms.length > 0 ? preflight.physicalRooms : preflight.rooms,
        events,
    };
}

module.exports = {
    buildSolvePayload,
    buildSchedulerEvents,
    getSolverPreflight,
    normalizeCohortIds,
    filterSectionsByCohortIds,
};
