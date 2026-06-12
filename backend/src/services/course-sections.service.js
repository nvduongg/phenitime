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
    buildRhythmOptionsFromConfig,
    resolveScheduleRhythm,
} = require('../utils/scheduleRhythm');

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

/** Online/async courses share one pool per course_id — pack many admin groups into fewer ELN sections. */
function shouldMergeGroupsAcrossCurricula(course) {
    const channel = resolveDeliveryChannel(course);

    if (channel === DELIVERY_CHANNELS.SPECIAL) {
        return false;
    }

    if (channel === DELIVERY_CHANNELS.ELEARNING
        || channel === DELIVERY_CHANNELS.HYBRID
        || channel === DELIVERY_CHANNELS.COURSERA) {
        return true;
    }

    return resolveCourseTemplateCode(course) === 'ONLINE';
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
 */
function allocateSections(studentGroups, targetCapacity, nameSuffixBuilder) {
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

    const sections = [];
    let sectionIndex = 1;

    while (queue.length > 0) {
        let currentFill = 0;
        const linkedGroups = new Set();

        while (currentFill < targetCapacity && queue.length > 0) {
            const group = queue[0];
            const spaceLeft = targetCapacity - currentFill;

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
            studentGroupIds: Array.from(linkedGroups),
        });
        sectionIndex += 1;
    }

    return sections;
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
    const profile = resolveCourseSectioningProfile(course);
    const rhythmOptions = buildRhythmOptionsFromConfig(schedulingConfig);
    const uniformParams = requires_scheduling
        ? (integratedSchedule || profile.combinedLtTh
            ? calculateIntegratedScheduleParams(
                course,
                rhythmOptions.maxWeeks,
                shiftDuration,
            )
            : resolveSectionScheduleParams(
                course,
                classType,
                shiftDuration,
                rhythmOptions.maxWeeks,
            ))
        : null;
    const schedulePlan = uniformParams
        ? resolveScheduleRhythm(uniformParams, rhythmOptions)
        : null;
    const scheduleParams = schedulePlan?.scheduleParams ?? uniformParams;
    const schedulingEvents = requires_scheduling
        ? buildSchedulingEventsFromParams(uniformParams, shiftDuration, rhythmOptions)
        : [];

    return allocatedSlots
        .map((slot) => buildSectionDraft({
            course,
            semesterId,
            scheduleSuffix,
            groupCode: slot.nameSuffix,
            classType,
            roomTypeReq,
            capacity: slot.capacity,
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

/** Coursera + PC lab: COUR01 (async) + COUR01.TH1… (scheduled). */
function generateCourseraHybridSections({
    course,
    semesterId,
    scheduleSuffix,
    studentGroups,
    schedulingConfig,
}) {
    const onlineTemplate = SECTIONING_TEMPLATES.ONLINE;
    const onlineCap = resolveOnlineSectionCapacity(schedulingConfig);
    const physicalTemplateCode = resolvePhysicalTemplateForSplit(course);
    const physicalTemplate = SECTIONING_TEMPLATES[physicalTemplateCode]
        || SECTIONING_TEMPLATES.LAB_COUPLED;
    const physicalCourse = sliceCourseCredits(course, { practiceOnly: true });
    const thCap = physicalTemplate.thCap || physicalTemplate.syncCap || 40;

    const onlineSlots = allocateSections(
        studentGroups,
        onlineCap,
        (index) => formatCourseraGroupCode(index),
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
        classType: resolveOnlineSectionClassType(DELIVERY_CHANNELS.COURSERA),
        roomTypeReq: onlineTemplate.room,
        shiftDuration: schedulingConfig.shift_duration,
        requires_scheduling: false,
    });

    const normalizedGroups = normalizeStudentGroupsForPacking(studentGroups);
    const physicalSections = [];

    for (const onlineSlot of onlineSlots) {
        const slotGroups = normalizedGroups.filter((group) =>
            onlineSlot.studentGroupIds.includes(group.group_id));

        if (!slotGroups.length) continue;

        const practiceSlots = allocateSections(
            slotGroups,
            thCap,
            (index) => formatCourseraPracticeGroupCode(onlineSlot.nameSuffix, index),
        );

        physicalSections.push(...stampAllocatedSections({
            course: physicalCourse,
            semesterId,
            scheduleSuffix,
            allocatedSlots: practiceSlots,
            classType: 'TH',
            roomTypeReq: resolvePracticeRoomTypeReq(course, physicalTemplate),
            shiftDuration: schedulingConfig.shift_duration,
            schedulingConfig,
            requires_scheduling: true,
        }));
    }

    return [...onlineSections, ...physicalSections];
}

/** HYBRID: ELN async track + physical lab/theory per template_code. */
function generateHybridSections(commonArgs) {
    const { course } = commonArgs;
    const onlineSections = generateAsyncOnlineTrack({
        ...commonArgs,
        groupFormatter: formatElnGroupCode,
        channel: DELIVERY_CHANNELS.HYBRID,
    });

    const physicalTemplateCode = resolvePhysicalTemplateForSplit(course);
    const physicalCourse = sliceCourseCredits(course, { practiceOnly: true });

    if (resolvePracticeCredits(physicalCourse) <= 0) {
        return onlineSections;
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
    const template = SECTIONING_TEMPLATES.STANDARD;
    const practiceSlotsPerTheoryGroup = Math.max(
        1,
        Math.ceil(template.ltCap / template.thCap),
    );
    const sections = [];

    if (resolveTheoryCredits(course) > 0) {
        sections.push(...stampAllocatedSections({
            course,
            semesterId,
            scheduleSuffix,
            allocatedSlots: allocateSections(
                studentGroups,
                template.ltCap,
                (index) => formatTheoryGroupCode(index),
            ),
            classType: 'LT',
            roomTypeReq: resolveTheoryRoomTypeReq(course, template),
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
                template.thCap,
                (index) => formatPracticeGroupCode(index, practiceSlotsPerTheoryGroup),
            ),
            classType: 'TH',
            roomTypeReq: resolvePracticeRoomTypeReq(course, template),
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
    const slots = allocateSections(
        studentGroups,
        template.syncCap,
        (index) => formatTheoryGroupCode(index),
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
            return generateAsyncOnlineTrack({
                ...commonArgs,
                groupFormatter: formatElnGroupCode,
                channel: DELIVERY_CHANNELS.ELEARNING,
            });

        case DELIVERY_CHANNELS.COURSERA:
            if (profile.hasPractice) {
                return generateCourseraHybridSections(commonArgs);
            }
            return generateAsyncOnlineTrack({
                ...commonArgs,
                groupFormatter: formatCourseraGroupCode,
                channel: DELIVERY_CHANNELS.COURSERA,
            });

        case DELIVERY_CHANNELS.HYBRID:
            return generateHybridSections(commonArgs);

        case DELIVERY_CHANNELS.SPECIAL:
            return [];

        case DELIVERY_CHANNELS.FACE:
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
    const {
        semester_id,
        default_student_count: defaultStudentCount = DEFAULT_AVERAGE_COHORT_SIZE,
    } = options;
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

    const schedulingConfig = await getSchedulingConfig(prisma);

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

    const allGroupIds = [
        ...new Set(activePlans.flatMap((plan) => plan.studentGroups.map((group) => group.group_id))),
    ];

    let removedCount = 0;
    if (allGroupIds.length > 0) {
        const removed = await prisma.courseSection.deleteMany({
            where: {
                semester_id,
                student_groups: {
                    some: { group_id: { in: allGroupIds } },
                },
            },
        });
        removedCount = removed.count;
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
            schedulingConfig,
        });
        generatedSections.push(...sections);
    }

    for (const { course, studentGroups } of faceToFaceTasks) {
        const sections = buildSectionsForCourse({
            course,
            semesterId: semester_id,
            scheduleSuffix,
            studentGroups,
            schedulingConfig,
        });
        generatedSections.push(...sections);
    }

    const uniqueSections = [...new Map(generatedSections.map((section) => [
        `${section.section_id}::${section.class_type}`,
        section,
    ])).values()];

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
