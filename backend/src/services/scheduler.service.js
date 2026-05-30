const { DEFAULT_SCHEDULING_CONFIG } = require('./system-config.service');
const {
    buildSchedulingEventsFromParams,
    resolveSectionScheduleParams,
    calculateIntegratedScheduleParams,
} = require('../utils/periodCalculator');
const { buildRhythmOptionsFromConfig } = require('../utils/scheduleRhythm');
const {
    requiresSchedulingForCourse,
    requiresSchedulingForSection,
    normalizeLearningType,
} = require('../utils/learningModes');
const {
    resolveSectionClassType,
    resolveSectionRoomTypeReq,
} = require('../utils/sectionClassType');
const { resolveCourseSectioningProfile } = require('../utils/sectioningTemplates');

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

function buildSchedulerEvents(
    sections,
    shiftDuration = DEFAULT_SCHEDULING_CONFIG.shift_duration,
    schedulingConfig = DEFAULT_SCHEDULING_CONFIG,
) {
    const blockSize = Number(shiftDuration) || DEFAULT_SCHEDULING_CONFIG.shift_duration;
    const rhythmOptions = buildRhythmOptionsFromConfig(schedulingConfig);
    const events = [];

    for (const section of sections) {
        const course = section.course || {};
        const classType = resolveSectionClassType(section);
        const schedulingSection = { ...section, class_type: classType };
        const profile = resolveCourseSectioningProfile(course);

        if (shouldSkipSchedulingSection(schedulingSection)) {
            continue;
        }

        if (!requiresSchedulingForCourse(course)) {
            continue;
        }

        const scheduleParams = profile.combinedLtTh
            ? calculateIntegratedScheduleParams(course, rhythmOptions.maxWeeks, blockSize)
            : resolveSectionScheduleParams(
                course,
                classType,
                blockSize,
                rhythmOptions.maxWeeks,
            );

        if (!scheduleParams?.numShifts) {
            continue;
        }

        const schedulingEvents = buildSchedulingEventsFromParams(
            scheduleParams,
            blockSize,
            rhythmOptions,
        );
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
                weekly_periods: session.weekly_periods ?? scheduleParams.stPerWeek,
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

async function buildSolvePayload(prisma, semesterId, config = {}) {
    const mergedConfig = {
        ...DEFAULT_SCHEDULING_CONFIG,
        ...config,
    };
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

    const sections = await prisma.courseSection.findMany({
        where: { semester_id: semesterId },
        include: {
            course: true,
            student_groups: true,
        },
        orderBy: { section_id: 'asc' },
    });

    const events = buildSchedulerEvents(sections, shiftDuration, mergedConfig);

    if (events.length === 0) {
        throw new Error(
            `No schedulable events were generated for semester '${semesterId}'. `
            + 'Check course credits, class types, and section metadata.',
        );
    }

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
        config: {
            shift_duration: shiftDuration,
            max_lecturer_shifts_per_day:
                config.max_lecturer_shifts_per_day
                ?? DEFAULT_SCHEDULING_CONFIG.max_lecturer_shifts_per_day,
            allowed_start_periods: config.allowed_start_periods || config.regular_starts,
            regular_starts: config.regular_starts,
            evening_starts: config.evening_starts,
            allowed_days: config.allowed_days || [2, 3, 4, 5, 6, 7],
            solver_max_time_seconds: Number(config.solver_max_time_seconds) || 60,
            enable_relaxation_pass: config.enable_relaxation_pass !== false,
            enable_lns_pass: config.enable_lns_pass !== false,
            lns_max_iterations: Number(config.lns_max_iterations) || 3,
            lns_max_neighborhood: Number(config.lns_max_neighborhood) || 40,
            lns_max_time_seconds: Number(config.lns_max_time_seconds) || 90,
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
};
