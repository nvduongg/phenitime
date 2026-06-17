const { inferProgramSemester } = require('../utils/programSemester');
const {
    parseSemesterScheduleSuffix,
    formatTheoryGroupCode,
    formatElnGroupCode,
    formatCourseraGroupCode,
    formatCourseraPracticeGroupCode,
    buildSectionId,
} = require('../utils/sectionIdBuilder');
const {
    requiresSchedulingForCourse,
    resolveOnlineClassType,
} = require('../utils/constants');
const {
    DELIVERY_CHANNELS,
    resolveDeliveryChannel,
    skipsAutoGenerateForChannel,
    resolvePhysicalTemplateForSplit,
    sliceCourseCredits,
    resolveOnlineSectionClassType,
} = require('../utils/deliveryChannels');
const {
    SECTIONING_TEMPLATES,
    resolveCourseTemplateCode,
    skipsAutoGenerateForTemplate,
    resolveStandardPracticeRoom,
    formatCoupledPracticeGroupCode,
    resolveCourseSectioningProfile,
} = require('../utils/sectioningTemplates');
const { getCapacityForRoomType, isPracticeRoomType } = require('../constants/roomTypes');
const {
    DEFAULT_SCHEDULING_CONFIG,
    getSchedulingConfig,
} = require('./system-config.service');
const {
    buildSchedulingEventsFromParams,
    resolvePracticeCredits,
    resolveSectionScheduleParams,
    resolveTheoryCredits,
    calculateIntegratedScheduleParams,
} = require('../utils/periodCalculator');
const {
    resolveCourseSchedulingEvents,
} = require('../utils/sectionSchedulingEvents');
const {
    hasManualOfflineSchedule,
    courseNeedsPhysicalOfflineSections,
} = require('../utils/offlineScheduleConfig');

const DEFAULT_AVERAGE_COHORT_SIZE = 100;

function normalizeStudentGroupsForPacking(studentGroups, defaultStudentCount = DEFAULT_AVERAGE_COHORT_SIZE) {
    if (!studentGroups?.length) {
        return [];
    }

    const hasAnyCount = studentGroups.some(
        (group) => (group.student_count ?? group.headcount ?? 0) > 0,
    );

    if (!hasAnyCount) {
        const perGroup = Math.max(1, Math.ceil(defaultStudentCount / studentGroups.length));
        return studentGroups.map((group) => ({
            group_id: group.group_id,
            group_name: group.group_name,
            headcount: perGroup,
        }));
    }

    return studentGroups
        .map((group) => ({
            group_id: group.group_id,
            group_name: group.group_name,
            headcount: group.headcount ?? group.student_count ?? 0,
        }))
        .filter((group) => group.headcount > 0);
}

function mergeStudentGroupRecords(groupLists) {
    const byId = new Map();
    for (const groups of groupLists) {
        for (const group of groups || []) {
            if (!group?.group_id) continue;
            if (!byId.has(group.group_id)) {
                byId.set(group.group_id, group);
            }
        }
    }
    return [...byId.values()];
}

function resolveOnlineSectionCapacity(schedulingConfig) {
    const configured = Number(schedulingConfig?.default_eln_capacity);
    if (Number.isFinite(configured) && configured > 0) {
        return configured;
    }
    return SECTIONING_TEMPLATES.ONLINE.cap;
}

function resolveLtSectionCapacity(schedulingConfig) {
    const configured = Number(schedulingConfig?.default_lt_capacity);
    if (Number.isFinite(configured) && configured > 0) {
        return configured;
    }
    return SECTIONING_TEMPLATES.STANDARD.ltCap;
}

function resolveThSectionCapacity(schedulingConfig) {
    const configured = Number(schedulingConfig?.default_th_capacity);
    if (Number.isFinite(configured) && configured > 0) {
        return configured;
    }
    return SECTIONING_TEMPLATES.STANDARD.thCap;
}

/** Trần cứng mỗi lớp TH/PM khi xếp TKB (phòng thực hành thường ≤ 50 chỗ). */
const DEFAULT_PRACTICE_SECTION_MAX_HEADCOUNT = 50;

function resolvePracticeSectionMaxHeadcount(schedulingConfig) {
    const configured = Number(schedulingConfig?.max_th_capacity);
    if (Number.isFinite(configured) && configured > 0) {
        return configured;
    }
    return DEFAULT_PRACTICE_SECTION_MAX_HEADCOUNT;
}

/** Trần tách lớp TH/PM: min(cấu hình, trần phòng an toàn). PC lab 40–45 chỗ → lập kế hoạch theo 40. */
function resolvePracticeSectionCapacity(schedulingConfig, roomTypeReq) {
    const configured = resolveThSectionCapacity(schedulingConfig);
    const normalized = String(roomTypeReq || '').trim().toUpperCase();

    if (['PC', 'PM', 'TH', 'LAB'].includes(normalized)) {
        const conservativePcCap = Math.min(
            getCapacityForRoomType('PM'),
            getCapacityForRoomType('PC'),
        );
        return Math.min(configured, conservativePcCap);
    }

    if (isPracticeRoomType(roomTypeReq)) {
        return Math.min(configured, getCapacityForRoomType(roomTypeReq));
    }

    return configured;
}

/** Coursera: tách nhiều track COUR01 (~200–280 SV) như TKB thực, không gom hết vào một lớp. */
const DEFAULT_COUR_TRACK_CAPACITY = 240;

function resolveCourseraOnlineCapacity(schedulingConfig) {
    const configured = Number(schedulingConfig?.default_cour_capacity);
    if (Number.isFinite(configured) && configured > 0) {
        return configured;
    }
    return Math.min(
        resolveOnlineSectionCapacity(schedulingConfig),
        DEFAULT_COUR_TRACK_CAPACITY,
    );
}

function resolvePositiveCapacity(value, fallback) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return fallback;
}

/** Ghép config xếp lịch (ca học, tuần…) với trần sinh lớp từ request popup. */
function buildSectioningConfig(schedulingConfig, options = {}) {
    return {
        ...schedulingConfig,
        default_lt_capacity: resolvePositiveCapacity(
            options.default_lt_capacity,
            schedulingConfig.default_lt_capacity,
        ),
        default_th_capacity: resolvePositiveCapacity(
            options.default_th_capacity,
            schedulingConfig.default_th_capacity,
        ),
        default_eln_capacity: resolvePositiveCapacity(
            options.default_eln_capacity,
            schedulingConfig.default_eln_capacity,
        ),
        default_cour_capacity: resolvePositiveCapacity(
            options.default_cour_capacity,
            schedulingConfig.default_cour_capacity ?? DEFAULT_COUR_TRACK_CAPACITY,
        ),
    };
}

function resolveDefaultStudentCount(schedulingConfig) {
    const fromConfig = Number(schedulingConfig?.default_student_count);
    if (Number.isFinite(fromConfig) && fromConfig > 0) {
        return fromConfig;
    }
    return DEFAULT_AVERAGE_COHORT_SIZE;
}

/** Online/async courses share one pool per course_id — pack many admin groups into fewer ELN sections. */
function shouldMergeGroupsAcrossCurricula(course) {
    const channel = resolveDeliveryChannel(course);

    if (channel === DELIVERY_CHANNELS.SPECIAL) {
        return false;
    }

    if (channel === DELIVERY_CHANNELS.ELEARNING
        || channel === DELIVERY_CHANNELS.COURSERA) {
        return true;
    }

    return resolveCourseTemplateCode(course) === 'ONLINE';
}

function resolvePlanningEnrollmentCapacity(slot, requiresScheduling) {
    const targetCap = Number(slot?.capacity) || 0;
    const allocated = Number(slot?.allocatedHeadcount);

    if (!requiresScheduling) {
        if (Number.isFinite(allocated) && allocated > 0) {
            return allocated;
        }
        return targetCap;
    }

    /** Lớp lẻ / lớp gộp đuôi: hiển thị sĩ số thực; lớp đủ trần hiển thị trần — khớp TKB thực (40×N + lớp cuối lẻ). */
    if (Number.isFinite(allocated) && allocated > 0 && allocated !== targetCap) {
        return allocated;
    }

    return targetCap;
}

function buildSectionDraft({
    course,
    semesterId,
    scheduleSuffix,
    groupCode,
    classType,
    roomTypeReq,
    capacity,
    groupIds,
    schedulingEvents,
    scheduleParams,
    requires_scheduling = true,
}) {
    const sectionId = buildSectionId(course.course_name, scheduleSuffix, groupCode);
    if (!sectionId) return null;

    return {
        section_id: sectionId,
        course_id: course.course_id,
        semester_id: semesterId,
        class_type: classType,
        room_type_req: roomTypeReq,
        capacity,
        student_group_ids: groupIds,
        st_per_week: scheduleParams?.stPerWeek ?? null,
        duration_weeks: scheduleParams?.actualWeeks ?? null,
        weekly_periods: scheduleParams?.stPerWeek ?? null,
        scheduling_events: schedulingEvents,
        requires_scheduling,
    };
}

/**
 * Queue-based continuous rolling allocation (ghép gối đầu / split queue).
 * Lớp cuối nếu quá nhỏ (< 50% trần, tối thiểu 15 SV) được gộp vào lớp trước — tránh lớp 4–6 SV trong TKB dự kiến.
 */
function resolveMinSectionHeadcount(targetCapacity) {
    const cap = Number(targetCapacity) || 0;
    if (cap <= 0) return 15;
    return Math.max(15, Math.floor(cap * 0.5));
}

function mergeUndersizedTailSections(sections, targetCapacity, maxCapacity = targetCapacity) {
    if (sections.length < 2) {
        return sections;
    }

    const minSize = resolveMinSectionHeadcount(targetCapacity);
    const last = sections[sections.length - 1];
    if (last.allocatedHeadcount >= minSize) {
        return sections;
    }

    const previous = sections[sections.length - 2];
    if (previous.allocatedHeadcount + last.allocatedHeadcount > maxCapacity) {
        return sections;
    }

    previous.allocatedHeadcount += last.allocatedHeadcount;
    previous.studentGroupIds = [
        ...new Set([...previous.studentGroupIds, ...last.studentGroupIds]),
    ];
    sections.pop();
    return mergeUndersizedTailSections(sections, targetCapacity, maxCapacity);
}

function distributeEvenly(totalHeadcount, sectionCount) {
    const base = Math.floor(totalHeadcount / sectionCount);
    let remainder = totalHeadcount % sectionCount;
    const sizes = [];

    for (let index = 0; index < sectionCount; index += 1) {
        sizes.push(base + (remainder > 0 ? 1 : 0));
        if (remainder > 0) {
            remainder -= 1;
        }
    }

    return sizes;
}

/**
 * Chia sĩ số cân bằng giữa các lớp: không vượt maxCapacity, ưu tiên gần targetCapacity.
 * VD 413 SV, target 40, max 50 → 10 lớp (41–42 SV), không tạo lớp TH cuối 53 SV.
 */
function computeBalancedSectionSizes(totalHeadcount, options = {}) {
    const targetCapacity = Math.max(1, Number(options.targetCapacity) || 40);
    const maxCapacity = Math.max(
        targetCapacity,
        Number(options.maxCapacity) || targetCapacity,
    );
    const minHeadcount = resolveMinSectionHeadcount(targetCapacity);

    if (totalHeadcount <= 0) {
        return [];
    }

    if (totalHeadcount <= maxCapacity) {
        return [totalHeadcount];
    }

    const minCount = Math.max(1, Math.ceil(totalHeadcount / maxCapacity));
    const maxCount = Math.max(1, Math.floor(totalHeadcount / minHeadcount));
    let best = null;

    for (let count = minCount; count <= maxCount; count += 1) {
        const sizes = distributeEvenly(totalHeadcount, count);
        const maxSize = Math.max(...sizes);
        const minSize = Math.min(...sizes);

        if (maxSize > maxCapacity || minSize < minHeadcount) {
            continue;
        }

        const variance = maxSize - minSize;
        const targetDeviation = sizes.reduce(
            (sum, size) => sum + Math.abs(size - targetCapacity),
            0,
        );
        const score = variance * 1000 + targetDeviation;

        if (!best || score < best.score) {
            best = { sizes, score };
        }
    }

    if (best) {
        return best.sizes;
    }

    return distributeEvenly(totalHeadcount, minCount);
}

function buildPracticeAllocationOptions(schedulingConfig) {
    return {
        maxCapacity: resolvePracticeSectionMaxHeadcount(schedulingConfig),
    };
}

function allocateSections(studentGroups, targetCapacity, nameSuffixBuilder, options = {}) {
    if (!studentGroups.length || targetCapacity <= 0) {
        return [];
    }

    const queue = studentGroups
        .map((group) => ({
            id: group.group_id,
            name: group.group_name,
            headcount: group.headcount,
            remaining: group.headcount,
        }))
        .filter((group) => group.remaining > 0);

    const maxCapacity = Number(options.maxCapacity) || targetCapacity;
    const totalHeadcount = queue.reduce((sum, group) => sum + group.remaining, 0);
    const sectionSizes = computeBalancedSectionSizes(totalHeadcount, {
        targetCapacity,
        maxCapacity,
    });

    const sections = [];
    let sectionIndex = 1;

    for (const sectionSize of sectionSizes) {
        let currentFill = 0;
        const linkedGroups = new Set();

        while (currentFill < sectionSize && queue.length > 0) {
            const group = queue[0];
            const spaceLeft = sectionSize - currentFill;

            if (group.remaining <= spaceLeft) {
                currentFill += group.remaining;
                linkedGroups.add(group.id);
                queue.shift();
            } else {
                currentFill += spaceLeft;
                linkedGroups.add(group.id);
                group.remaining -= spaceLeft;
            }
        }

        sections.push({
            nameSuffix: nameSuffixBuilder(sectionIndex),
            capacity: targetCapacity,
            /** Sĩ số thực tế sau ghép gối đầu (≤ maxCapacity/trần phòng). */
            allocatedHeadcount: currentFill,
            studentGroupIds: Array.from(linkedGroups),
        });
        sectionIndex += 1;
    }

    return mergeUndersizedTailSections(sections, targetCapacity, maxCapacity);
}

/** Gắn sĩ số đúng với track online/COUR01 (không lấy cả pool 553 SV cho mỗi COUR01). */
function buildStudentGroupsForSlot(studentGroups, slot) {
    const linked = studentGroups.filter((group) =>
        slot.studentGroupIds.includes(group.group_id));

    if (!linked.length) {
        return [];
    }

    if (linked.length === 1) {
        return [{
            ...linked[0],
            headcount: slot.allocatedHeadcount,
        }];
    }

    const totalLinked = linked.reduce((sum, group) => sum + (group.headcount || 0), 0);
    let remaining = slot.allocatedHeadcount;

    return linked.map((group) => {
        const share = totalLinked > 0
            ? Math.round((group.headcount / totalLinked) * slot.allocatedHeadcount)
            : 0;
        const headcount = Math.min(group.headcount, share, remaining);
        remaining -= headcount;
        return { ...group, headcount };
    }).filter((group) => group.headcount > 0);
}

function formatPracticeGroupCode(index, practiceSlotsPerTheoryGroup) {
    const theoryIndex = Math.ceil(index / practiceSlotsPerTheoryGroup);
    const practiceIndex = ((index - 1) % practiceSlotsPerTheoryGroup) + 1;
    return `${formatTheoryGroupCode(theoryIndex)}.TH${practiceIndex}`;
}

function resolveCombinedCredits(course) {
    const theory = resolveTheoryCredits(course);
    const practice = resolvePracticeCredits(course);
    if (theory > 0 && practice > 0) {
        return theory + practice;
    }
    return theory || practice || Number(course.credits) || 0;
}

function resolveTheoryRoomTypeReq(_course, template = SECTIONING_TEMPLATES.STANDARD) {
    return template.ltRoom;
}

function resolvePracticeRoomTypeReq(course, template = SECTIONING_TEMPLATES.STANDARD) {
    return resolveStandardPracticeRoom(course, template);
}

function stampAllocatedSections({
    course,
    semesterId,
    scheduleSuffix,
    allocatedSlots,
    classType,
    roomTypeReq,
    shiftDuration,
    schedulingConfig = DEFAULT_SCHEDULING_CONFIG,
    requires_scheduling = true,
    integratedSchedule = false,
}) {
    const {
        events: schedulingEvents,
        scheduleParams,
    } = requires_scheduling
        ? resolveCourseSchedulingEvents(course, classType, schedulingConfig)
        : { events: [], scheduleParams: null };

    return allocatedSlots
        .map((slot) => buildSectionDraft({
            course,
            semesterId,
            scheduleSuffix,
            groupCode: slot.nameSuffix,
            classType,
            roomTypeReq,
            /** TKB dự kiến: trần chuẩn (40/45…); lớp lẻ cuối hiển thị đủ SV còn lại. */
            capacity: resolvePlanningEnrollmentCapacity(slot, requires_scheduling),
            groupIds: slot.studentGroupIds,
            scheduleParams,
            schedulingEvents,
            requires_scheduling,
        }))
        .filter(Boolean);
}

/** Async online track — ghép tối đa nhóm SV vào ít lớp ELN; tách khi vượt default_eln_capacity. */
function generateAsyncOnlineTrack({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig,
    groupFormatter = formatElnGroupCode,
    channel = resolveDeliveryChannel(course),
}) {
    const template = SECTIONING_TEMPLATES.ONLINE;
    const onlineCap = resolveOnlineSectionCapacity(schedulingConfig);
    let onlineCourse = sliceCourseCredits(course, { theoryOnly: true });

    if (resolveTheoryCredits(onlineCourse) <= 0) {
        onlineCourse = {
            ...course,
            practice_credits: 0,
            credits: Number(course.credits) || resolvePracticeCredits(course),
        };
    }

    const slots = allocateSections(
        studentGroups,
        onlineCap,
        groupFormatter,
    );

    return stampAllocatedSections({
        course: onlineCourse,
        semesterId,
        scheduleSuffix,
        allocatedSlots: slots,
        classType: resolveOnlineSectionClassType(channel),
        roomTypeReq: template.room,
        shiftDuration: schedulingConfig.shift_duration,
        requires_scheduling: false,
    });
}

/** Online async + buổi gặp mặt: ELN/COUR + nhóm .TH (theo cấu hình offline). */
function generateSplitOnlineOfflineSections({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig,
    groupFormatter,
    onlineCap,
    channel,
}) {
    const onlineTemplate = SECTIONING_TEMPLATES.ONLINE;
    const physicalTemplateCode = resolvePhysicalTemplateForSplit(course);
    const physicalTemplate = SECTIONING_TEMPLATES[physicalTemplateCode]
        || SECTIONING_TEMPLATES.LAB_COUPLED;
    const physicalCourse = resolvePracticeCredits(course) > 0
        ? sliceCourseCredits(course, { practiceOnly: true })
        : course;
    const practiceRoom = resolvePracticeRoomTypeReq(course, physicalTemplate);
    const thCap = physicalTemplateCode === 'MEDICAL_CLINIC'
        ? physicalTemplate.cap
        : resolvePracticeSectionCapacity(schedulingConfig, practiceRoom);

    const onlineSlots = allocateSections(
        studentGroups,
        onlineCap,
        groupFormatter,
    );

    const onlineCourse = sliceCourseCredits(course, { theoryOnly: true });
    const onlineSections = stampAllocatedSections({
        course: onlineCourse.theory_credits > 0 ? onlineCourse : {
            ...course,
            practice_credits: 0,
            credits: Number(course.credits) || resolvePracticeCredits(course),
        },
        semesterId,
        scheduleSuffix,
        allocatedSlots: onlineSlots,
        classType: resolveOnlineSectionClassType(channel),
        roomTypeReq: onlineTemplate.room,
        shiftDuration: schedulingConfig.shift_duration,
        requires_scheduling: false,
    });

    const normalizedGroups = normalizeStudentGroupsForPacking(studentGroups);
    const physicalSections = [];

    for (const onlineSlot of onlineSlots) {
        const slotGroups = buildStudentGroupsForSlot(normalizedGroups, onlineSlot);

        if (!slotGroups.length) continue;

        const practiceSlots = allocateSections(
            slotGroups,
            thCap,
            (index) => formatCourseraPracticeGroupCode(onlineSlot.nameSuffix, index),
            buildPracticeAllocationOptions(schedulingConfig),
        );

        physicalSections.push(...stampAllocatedSections({
            course: physicalCourse,
            semesterId,
            scheduleSuffix,
            allocatedSlots: practiceSlots,
            classType: 'TH',
            roomTypeReq: practiceRoom,
            shiftDuration: schedulingConfig.shift_duration,
            schedulingConfig,
            requires_scheduling: true,
        }));
    }

    return [...onlineSections, ...physicalSections];
}

/** Coursera + PC lab: COUR01 (async) + COUR01.TH1… (scheduled). */
function generateCourseraHybridSections(commonArgs) {
    return generateSplitOnlineOfflineSections({
        ...commonArgs,
        groupFormatter: (index) => formatCourseraGroupCode(index),
        onlineCap: resolveCourseraOnlineCapacity(commonArgs.schedulingConfig),
        channel: DELIVERY_CHANNELS.COURSERA,
    });
}

/** E-learning + buổi gặp mặt: ELN01 + ELN01.TH1… */
function generateElearningHybridSections(commonArgs) {
    return generateSplitOnlineOfflineSections({
        ...commonArgs,
        groupFormatter: (index) => formatElnGroupCode(index),
        onlineCap: resolveOnlineSectionCapacity(commonArgs.schedulingConfig),
        channel: DELIVERY_CHANNELS.ELEARNING,
    });
}

/** @deprecated Dùng generateCourseraHybridSections — HYBRID đã gộp vào COURSERA. */
function generateHybridSections(commonArgs) {
    const { course } = commonArgs;
    const onlineSections = generateAsyncOnlineTrack({
        ...commonArgs,
        groupFormatter: formatElnGroupCode,
        channel: DELIVERY_CHANNELS.COURSERA,
    });

    const physicalTemplateCode = resolvePhysicalTemplateForSplit(course);
    const physicalCourse = resolvePracticeCredits(course) > 0
        ? sliceCourseCredits(course, { practiceOnly: true })
        : course;

    if (resolvePracticeCredits(physicalCourse) <= 0 && !hasManualOfflineSchedule(course)) {
        return onlineSections;
    }

    if (resolvePracticeCredits(physicalCourse) <= 0 && hasManualOfflineSchedule(course)) {
        const practiceRoom = resolvePracticeRoomTypeReq(course, SECTIONING_TEMPLATES.LAB_COUPLED);
        const thCap = resolvePracticeSectionCapacity(
            commonArgs.schedulingConfig,
            practiceRoom,
        );
        const physicalSections = stampAllocatedSections({
            course,
            semesterId: commonArgs.semesterId,
            scheduleSuffix: commonArgs.scheduleSuffix,
            allocatedSlots: allocateSections(
                commonArgs.studentGroups,
                thCap,
                (index) => formatTheoryGroupCode(index),
                buildPracticeAllocationOptions(commonArgs.schedulingConfig),
            ),
            classType: 'TH',
            roomTypeReq: practiceRoom,
            shiftDuration: commonArgs.schedulingConfig.shift_duration,
            schedulingConfig: commonArgs.schedulingConfig,
            requires_scheduling: true,
        });
        return [...onlineSections, ...physicalSections];
    }

    const physicalSections = generatePhysicalSectionsByTemplate({
        ...commonArgs,
        course: physicalCourse,
        templateCode: physicalTemplateCode,
    });

    return [...onlineSections, ...physicalSections];
}

function generatePhysicalSectionsByTemplate({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig,
    templateCode,
}) {
    const commonArgs = {
        course,
        semesterId,
        scheduleSuffix,
        studentGroups,
        schedulingConfig,
    };

    switch (templateCode) {
        case 'LAB_COUPLED':
            return generateLabCoupledSections(commonArgs);
        case 'MEDICAL_CLINIC':
            return generateMedicalClinicSections(commonArgs);
        case 'STANDARD':
            return generateStandardSections(commonArgs);
        default:
            return generateLabCoupledSections(commonArgs);
    }
}

/** Template ONLINE: merge queue @ cap → virtual room. @deprecated use generateAsyncOnlineTrack */
function generateOnlineSections(args) {
    return generateAsyncOnlineTrack({
        ...args,
        groupFormatter: formatElnGroupCode,
        channel: resolveDeliveryChannel(args.course),
    });
}

/** Template STANDARD: LT merge @ ltCap, TH split @ thCap. */
function generateStandardSections({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig,
}) {
    const ltCap = resolveLtSectionCapacity(schedulingConfig);
    const practiceRoom = resolvePracticeRoomTypeReq(course, SECTIONING_TEMPLATES.STANDARD);
    const thCap = resolvePracticeSectionCapacity(schedulingConfig, practiceRoom);
    const practiceSlotsPerTheoryGroup = Math.max(
        1,
        Math.ceil(ltCap / thCap),
    );
    const sections = [];

    if (resolveTheoryCredits(course) > 0) {
        sections.push(...stampAllocatedSections({
            course,
            semesterId,
            scheduleSuffix,
            allocatedSlots: allocateSections(
                studentGroups,
                ltCap,
                (index) => formatTheoryGroupCode(index),
            ),
            classType: 'LT',
            roomTypeReq: resolveTheoryRoomTypeReq(course, SECTIONING_TEMPLATES.STANDARD),
            shiftDuration: schedulingConfig.shift_duration,
            schedulingConfig,
        }));
    }

    if (resolvePracticeCredits(course) > 0) {
        sections.push(...stampAllocatedSections({
            course,
            semesterId,
            scheduleSuffix,
            allocatedSlots: allocateSections(
                studentGroups,
                thCap,
                (index) => formatPracticeGroupCode(index, practiceSlotsPerTheoryGroup),
                buildPracticeAllocationOptions(schedulingConfig),
            ),
            classType: 'TH',
            roomTypeReq: resolvePracticeRoomTypeReq(course, SECTIONING_TEMPLATES.STANDARD),
            shiftDuration: schedulingConfig.shift_duration,
            schedulingConfig,
        }));
    }

    return sections;
}

/** Template LAB_COUPLED: integrated LT+TH in one section @ syncCap (real TKB: N01 only). */
function generateLabCoupledSections({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig,
}) {
    const template = SECTIONING_TEMPLATES.LAB_COUPLED;
    const defaultRoom = resolvePracticeRoomTypeReq(course, template);
    const syncCap = resolvePracticeSectionCapacity(schedulingConfig, defaultRoom);
    const slots = allocateSections(
        studentGroups,
        syncCap,
        (index) => formatTheoryGroupCode(index),
        buildPracticeAllocationOptions(schedulingConfig),
    );

    if (resolveTheoryCredits(course) <= 0 && resolvePracticeCredits(course) <= 0) {
        return [];
    }

    return stampAllocatedSections({
        course,
        semesterId,
        scheduleSuffix,
        allocatedSlots: slots,
        classType: 'LT',
        roomTypeReq: defaultRoom,
        shiftDuration: schedulingConfig.shift_duration,
        schedulingConfig,
        integratedSchedule: true,
    });
}

/** Template MEDICAL_CLINIC: split @ cap for LT and TH with MED room. */
function generateMedicalClinicSections({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig,
}) {
    const template = SECTIONING_TEMPLATES.MEDICAL_CLINIC;
    const sections = [];

    if (resolveTheoryCredits(course) > 0) {
        sections.push(...stampAllocatedSections({
            course,
            semesterId,
            scheduleSuffix,
            allocatedSlots: allocateSections(
                studentGroups,
                template.cap,
                (index) => formatTheoryGroupCode(index),
            ),
            classType: 'LT',
            roomTypeReq: template.room,
            shiftDuration: schedulingConfig.shift_duration,
            schedulingConfig,
        }));
    }

    if (resolvePracticeCredits(course) > 0) {
        sections.push(...stampAllocatedSections({
            course,
            semesterId,
            scheduleSuffix,
            allocatedSlots: allocateSections(
                studentGroups,
                template.cap,
                (index) => formatCoupledPracticeGroupCode(formatTheoryGroupCode(index)),
            ),
            classType: 'TH',
            roomTypeReq: template.room,
            shiftDuration: schedulingConfig.shift_duration,
            schedulingConfig,
        }));
    }

    return sections;
}

/**
 * Delivery-channel router, then template-driven generation for face-to-face courses.
 */
function buildSectionsForCourse({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig = DEFAULT_SCHEDULING_CONFIG,
}) {
    const groups = normalizeStudentGroupsForPacking(studentGroups);

    if (groups.length === 0) {
        return [];
    }

    const channel = resolveDeliveryChannel(course);
    const profile = resolveCourseSectioningProfile(course);
    const commonArgs = {
        course,
        semesterId,
        scheduleSuffix,
        studentGroups: groups,
        schedulingConfig,
    };

    if (!profile.hasTheory && !profile.hasPractice) {
        return [];
    }

    switch (channel) {
        case DELIVERY_CHANNELS.ELEARNING:
            if (courseNeedsPhysicalOfflineSections(course)) {
                return generateElearningHybridSections(commonArgs);
            }
            return generateAsyncOnlineTrack({
                ...commonArgs,
                groupFormatter: formatElnGroupCode,
                channel: DELIVERY_CHANNELS.ELEARNING,
            });

        case DELIVERY_CHANNELS.COURSERA:
            if (courseNeedsPhysicalOfflineSections(course)) {
                return generateCourseraHybridSections(commonArgs);
            }
            return generateAsyncOnlineTrack({
                ...commonArgs,
                groupFormatter: formatCourseraGroupCode,
                channel: DELIVERY_CHANNELS.COURSERA,
            });

        case DELIVERY_CHANNELS.SPECIAL:
            return [];

        case DELIVERY_CHANNELS.OFFLINE:
        default:
            break;
    }

    const templateCode = resolveCourseTemplateCode(course);

    switch (templateCode) {
        case 'LAB_COUPLED':
            return generateLabCoupledSections(commonArgs);

        case 'ONLINE':
            return generateAsyncOnlineTrack({
                ...commonArgs,
                groupFormatter: formatElnGroupCode,
                channel: DELIVERY_CHANNELS.ELEARNING,
            });

        case 'MEDICAL_CLINIC':
            return generateMedicalClinicSections(commonArgs);

        case 'SPECIAL':
            return [];

        case 'STANDARD':
        default:
            return generateStandardSections(commonArgs);
    }
}

async function ensureStudentGroupsForCurriculum(prisma, curriculum, defaultStudentCount) {
    if (curriculum.studentGroups?.length > 0) {
        return curriculum.studentGroups;
    }

    const majorToken = String(curriculum.major?.major_code || curriculum.major_id || 'GEN')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 12);
    const groupId = `${curriculum.cohort_id}_${majorToken}_01`;

    const existing = await prisma.studentGroup.findUnique({
        where: { group_id: groupId },
    });
    if (existing) return [existing];

    const created = await prisma.studentGroup.create({
        data: {
            group_id: groupId,
            group_name: curriculum.curriculum_name || groupId,
            curriculum_id: curriculum.curriculum_id,
            student_count: defaultStudentCount,
        },
    });

    return [created];
}

function normalizeCohortIds(options = {}) {
    const { cohort_ids, cohort_id } = options;
    const raw = cohort_ids ?? (cohort_id != null && String(cohort_id).trim() !== '' ? [cohort_id] : []);
    const list = Array.isArray(raw) ? raw : [raw];
    return [...new Set(list.map((id) => String(id).trim()).filter(Boolean))];
}

async function autoGenerateCourseSections(prisma, options = {}) {
    const { semester_id } = options;

    const schedulingConfig = await getSchedulingConfig(prisma);
    const sectioningConfig = buildSectioningConfig(schedulingConfig, options);
    const defaultStudentCount = resolveDefaultStudentCount(schedulingConfig);
    const cohortIds = normalizeCohortIds(options);

    if (!semester_id) {
        const error = new Error('Vui lòng cung cấp mã học kỳ (semester_id)');
        error.statusCode = 400;
        throw error;
    }

    if (cohortIds.length === 0) {
        const error = new Error('Vui lòng chọn ít nhất một niên khóa áp dụng');
        error.statusCode = 400;
        throw error;
    }

    const semester = await prisma.semester.findUnique({ where: { semester_id } });
    if (!semester) {
        const error = new Error(
            `Mã học kỳ '${semester_id}' chưa tồn tại. Vui lòng tạo học kỳ trước khi sinh lớp.`,
        );
        error.statusCode = 400;
        throw error;
    }

    const scheduleSuffix = parseSemesterScheduleSuffix(semester);
    if (!scheduleSuffix) {
        const error = new Error(
            `Không suy ra được mã lịch (đợt-hk-năm) từ học kỳ ${semester_id}. `
            + 'Vui lòng đặt mã học kỳ dạng 2025_2026_3_1 (năm_năm_họcKỳ_đợt) và nhập năm học.',
        );
        error.statusCode = 400;
        throw error;
    }

    const curriculumWhere = { cohort_id: { in: cohortIds } };
    const curricula = await prisma.curriculum.findMany({
        where: curriculumWhere,
        include: {
            cohort: true,
            major: true,
            studentGroups: true,
        },
    });

    if (curricula.length === 0) {
        const error = new Error(
            `Không tìm thấy CTĐT cho niên khóa: ${cohortIds.join(', ')}`,
        );
        error.statusCode = 404;
        throw error;
    }

    const activePlans = [];

    for (const curriculum of curricula) {
        const recommendedSemester = inferProgramSemester(
            curriculum.cohort.start_year,
            semester.start_date,
        );
        if (!recommendedSemester) continue;

        const roadmaps = await prisma.roadmap.findMany({
            where: {
                curriculum_id: curriculum.curriculum_id,
                recommended_semester: recommendedSemester,
            },
            include: { course: true },
        });

        if (roadmaps.length === 0) continue;

        const studentGroups = await ensureStudentGroupsForCurriculum(
            prisma,
            curriculum,
            defaultStudentCount,
        );

        activePlans.push({
            curriculum,
            roadmaps,
            studentGroups,
            recommendedSemester,
        });
    }

    if (activePlans.length === 0) {
        return {
            createdCount: 0,
            removedCount: 0,
            skippedCourseCount: 0,
            sections: [],
            curriculaProcessed: 0,
            message: 'Không có lớp nào cần sinh tự động cho học kỳ này.',
        };
    }

    let removedCount = 0;
    if (cohortIds.length > 0) {
        const removedByCohort = await prisma.courseSection.deleteMany({
            where: {
                semester_id,
                student_groups: {
                    some: {
                        curriculum: {
                            cohort_id: { in: cohortIds },
                        },
                    },
                },
            },
        });
        removedCount += removedByCohort.count;
    }

    const generatedSections = [];
    let skippedCourseCount = 0;

    const mergedOnlineCourses = new Map();
    const faceToFaceTasks = [];

    for (const plan of activePlans) {
        for (const roadmap of plan.roadmaps) {
            const course = roadmap.course;

            if (skipsAutoGenerateForTemplate(course.template_code)
                || skipsAutoGenerateForChannel(resolveDeliveryChannel(course))) {
                skippedCourseCount += 1;
                continue;
            }

            if (shouldMergeGroupsAcrossCurricula(course)) {
                const existing = mergedOnlineCourses.get(course.course_id);
                if (existing) {
                    existing.groupLists.push(plan.studentGroups);
                } else {
                    mergedOnlineCourses.set(course.course_id, {
                        course,
                        groupLists: [plan.studentGroups],
                    });
                }
                continue;
            }

            faceToFaceTasks.push({
                course,
                studentGroups: plan.studentGroups,
            });
        }
    }

    for (const { course, groupLists } of mergedOnlineCourses.values()) {
        const sections = buildSectionsForCourse({
            course,
            semesterId: semester_id,
            scheduleSuffix,
            studentGroups: mergeStudentGroupRecords(groupLists),
            schedulingConfig: sectioningConfig,
        });
        generatedSections.push(...sections);
    }

    for (const { course, studentGroups } of faceToFaceTasks) {
        const sections = buildSectionsForCourse({
            course,
            semesterId: semester_id,
            scheduleSuffix,
            studentGroups,
            schedulingConfig: sectioningConfig,
        });
        generatedSections.push(...sections);
    }

    const uniqueSections = [...new Map(generatedSections.map((section) => [
        `${section.section_id}::${section.class_type}`,
        section,
    ])).values()];

    const draftSectionIds = uniqueSections.map((section) => section.section_id).filter(Boolean);
    if (draftSectionIds.length > 0) {
        const replaced = await prisma.courseSection.deleteMany({
            where: { section_id: { in: draftSectionIds } },
        });
        removedCount += replaced.count;
    }

    const dedupedCount = generatedSections.length - uniqueSections.length;
    if (dedupedCount > 0) {
        console.warn(
            `[course-sections] Removed ${dedupedCount} duplicate section drafts `
            + '(same section_id + class_type).',
        );
    }

    const savedSections = [];
    for (const section of uniqueSections) {
        const {
            scheduling_events: _schedulingEvents,
            weekly_periods: _weeklyPeriods,
            student_group_ids: studentGroupIds,
            requires_scheduling: _requiresScheduling,
            ...persistedFields
        } = section;

        const created = await prisma.courseSection.create({
            data: {
                ...persistedFields,
                student_groups: {
                    connect: studentGroupIds.map((groupId) => ({ group_id: groupId })),
                },
            },
            include: { student_groups: true, course: true },
        });
        savedSections.push({
            ...created,
            weekly_periods: section.weekly_periods,
            st_per_week: section.st_per_week,
            duration_weeks: section.duration_weeks,
            scheduling_events: section.scheduling_events,
        });
    }

    const createdCount = savedSections.length;
    const removalNote = removedCount > 0 ? ` (đã xóa ${removedCount} lớp cũ)` : '';
    const skipNote = skippedCourseCount > 0
        ? ` — bỏ qua ${skippedCourseCount} học phần SPECIAL (ĐA/TT/KL, import lớp thủ công)`
        : '';

    return {
        createdCount,
        removedCount,
        skippedCourseCount,
        sections: savedSections,
        curriculaProcessed: activePlans.length,
        message: createdCount > 0
            ? `Đã sinh thành công ${createdCount} lớp học phần!${removalNote}${skipNote}`
            : `Không có lớp mới cần sinh${removalNote}${skipNote}.`,
    };
}

module.exports = {
    autoGenerateCourseSections,
    normalizeCohortIds,
    allocateSections,
    computeBalancedSectionSizes,
    buildSectionsForCourse,
    generateOnlineSections,
    generateAsyncOnlineTrack,
    generateCourseraHybridSections,
    generateHybridSections,
    generateStandardSections,
    generateLabCoupledSections,
    generateMedicalClinicSections,
    buildSchedulingEventsFromParams,
    resolveCombinedCredits,
    resolveSectionScheduleParams,
    DEFAULT_AVERAGE_COHORT_SIZE,
    DEFAULT_SCHEDULING_CONFIG,
};
