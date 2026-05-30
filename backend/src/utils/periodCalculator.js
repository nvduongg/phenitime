const DEFAULT_MAX_WEEKS = 10;
const DEFAULT_SHIFT_DURATION = 3;

function calculateScheduleParams(
    credits,
    type = 'LT',
    maxWeeks = DEFAULT_MAX_WEEKS,
    shiftDuration = DEFAULT_SHIFT_DURATION,
) {
    const normalizedCredits = Number(credits) || 0;
    if (normalizedCredits <= 0) {
        return null;
    }

    const blockSize = Math.max(Number(shiftDuration) || DEFAULT_SHIFT_DURATION, 1);
    const weeks = Math.max(Number(maxWeeks) || DEFAULT_MAX_WEEKS, 1);
    const scheduleType = String(type || 'LT').toUpperCase();

    const totalPeriods = scheduleType === 'LT'
        ? normalizedCredits * 15
        : normalizedCredits * 30;

    const minPeriodsPerWeek = totalPeriods / weeks;
    const stPerWeek = Math.ceil(minPeriodsPerWeek / blockSize) * blockSize;
    const actualWeeks = Math.ceil(totalPeriods / stPerWeek);
    const numShifts = stPerWeek / blockSize;

    return {
        totalPeriods,
        stPerWeek,
        actualWeeks,
        numShifts,
    };
}

function resolveTheoryCredits(course = {}) {
    const raw = course.theory_credits ?? course.tc_lt;
    return Number(raw) || 0;
}

function resolvePracticeCredits(course = {}) {
    const raw = course.practice_credits ?? course.tc_th;
    return Number(raw) || 0;
}

function resolveScheduleTypeForClass(classType) {
    const normalized = String(classType || 'LT').toUpperCase();
    if (['TH', 'PM', 'TN', 'SB', 'XT'].includes(normalized)) {
        return 'TH';
    }
    return 'LT';
}

function resolveCreditsForSchedule(course = {}, scheduleType = 'LT') {
    return scheduleType === 'TH'
        ? resolvePracticeCredits(course)
        : resolveTheoryCredits(course);
}

/** LAB_COUPLED integrated section: LT periods + TH periods in one weekly block. */
function calculateIntegratedScheduleParams(
    course = {},
    maxWeeks = DEFAULT_MAX_WEEKS,
    shiftDuration = DEFAULT_SHIFT_DURATION,
) {
    const theory = resolveTheoryCredits(course);
    const practice = resolvePracticeCredits(course);
    const totalPeriods = (theory * 15) + (practice * 30);

    if (totalPeriods <= 0) {
        return null;
    }

    const blockSize = Math.max(Number(shiftDuration) || DEFAULT_SHIFT_DURATION, 1);
    const weeks = Math.max(Number(maxWeeks) || DEFAULT_MAX_WEEKS, 1);
    const minPeriodsPerWeek = totalPeriods / weeks;
    const stPerWeek = Math.ceil(minPeriodsPerWeek / blockSize) * blockSize;
    const actualWeeks = Math.ceil(totalPeriods / stPerWeek);
    const numShifts = stPerWeek / blockSize;

    return {
        totalPeriods,
        stPerWeek,
        actualWeeks,
        numShifts,
    };
}

function buildSchedulingEventsFromParams(
    params,
    shiftDuration = DEFAULT_SHIFT_DURATION,
    rhythmOptions = {},
) {
    const { buildSchedulingEventsFromParams: buildFromRhythm } = require('./scheduleRhythm');
    return buildFromRhythm(params, shiftDuration, rhythmOptions);
}

function resolveSectionScheduleParams(course, classType, shiftDuration, maxWeeks = DEFAULT_MAX_WEEKS) {
    const scheduleType = resolveScheduleTypeForClass(classType);
    const credits = resolveCreditsForSchedule(course, scheduleType);
    return calculateScheduleParams(credits, scheduleType, maxWeeks, shiftDuration);
}

function syncCourseCreditFields(courseData = {}) {
    const theory = Number(courseData.theory_credits ?? courseData.tc_lt) || 0;
    const practice = Number(courseData.practice_credits ?? courseData.tc_th) || 0;

    return {
        ...courseData,
        theory_credits: theory,
        practice_credits: practice,
        tc_lt: Math.round(theory),
        tc_th: Math.round(practice),
    };
}

module.exports = {
    DEFAULT_MAX_WEEKS,
    DEFAULT_SHIFT_DURATION,
    calculateScheduleParams,
    resolveTheoryCredits,
    resolvePracticeCredits,
    resolveScheduleTypeForClass,
    resolveCreditsForSchedule,
    calculateIntegratedScheduleParams,
    buildSchedulingEventsFromParams,
    resolveSectionScheduleParams,
    syncCourseCreditFields,
};
