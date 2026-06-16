const { DEFAULT_MAX_WEEKS, DEFAULT_SHIFT_DURATION } = require('./periodCalculator');

const RHYTHM_MODES = {
    UNIFORM: 'UNIFORM',
    PHASE_5_5: 'PHASE_5_5',
};

const DEFAULT_RHYTHM_OPTIONS = {
    maxWeeks: DEFAULT_MAX_WEEKS,
    shiftDuration: DEFAULT_SHIFT_DURATION,
    stretchEnabled: true,
    minShiftsForStretch: 2,
};

function resolveScheduleRhythm(params, options = {}) {
    const settings = { ...DEFAULT_RHYTHM_OPTIONS, ...options };
    if (!params) {
        return null;
    }

    const maxWeeks = Math.max(Number(settings.maxWeeks) || DEFAULT_MAX_WEEKS, 1);
    const numShifts = Math.floor(Number(params.numShifts) || 0);

    /** Nhịp học suy từ tổng tiết (TC×15 hoặc TC×30) và ca 3 tiết — không ép mẫu 5+5 tuần. */
    return {
        mode: RHYTHM_MODES.UNIFORM,
        totalPeriods: params.totalPeriods,
        stPerWeek: params.stPerWeek,
        durationWeeks: params.actualWeeks,
        maxWeeks,
        uniformActualWeeks: params.actualWeeks,
        phases: [{
            weekFrom: 1,
            weekTo: params.actualWeeks,
            shiftsPerWeek: numShifts,
            periodsPerWeek: params.stPerWeek,
        }],
        scheduleParams: { ...params },
    };
}

function buildSchedulingEventsFromPlan(plan, shiftDuration = DEFAULT_SHIFT_DURATION) {
    if (!plan?.phases?.length) {
        return [];
    }

    const blockSize = Math.max(Number(shiftDuration) || DEFAULT_SHIFT_DURATION, 1);
    const events = [];
    let partIndex = 1;

    for (const phase of plan.phases) {
        const periodsPerWeek = Math.floor(phase.periodsPerWeek || blockSize);
        const shiftCount = Math.max(
            Math.floor(phase.shiftsPerWeek || 0),
            periodsPerWeek > blockSize ? Math.ceil(periodsPerWeek / blockSize) : 0,
        );

        for (let shift = 0; shift < shiftCount; shift += 1) {
            events.push({
                event_part: partIndex,
                duration: blockSize,
                weekly_periods: periodsPerWeek,
                week_from: phase.weekFrom,
                week_to: phase.weekTo,
                rhythm_mode: plan.mode,
            });
            partIndex += 1;
        }
    }

    return events;
}

function buildSchedulingEventsFromParams(params, shiftDuration = DEFAULT_SHIFT_DURATION, rhythmOptions = {}) {
    const plan = resolveScheduleRhythm(params, rhythmOptions);
    return buildSchedulingEventsFromPlan(plan, shiftDuration);
}

function resolveSectionSchedulePlan(course, classType, rhythmOptions = {}) {
    const { resolveSectionScheduleParams } = require('./periodCalculator');
    const params = resolveSectionScheduleParams(
        course,
        classType,
        rhythmOptions.shiftDuration,
        rhythmOptions.maxWeeks,
    );
    const plan = resolveScheduleRhythm(params, rhythmOptions);
    return { params, plan };
}

function buildRhythmOptionsFromConfig(schedulingConfig = {}) {
    return {
        maxWeeks: schedulingConfig.max_teaching_weeks ?? DEFAULT_MAX_WEEKS,
        shiftDuration: schedulingConfig.shift_duration ?? DEFAULT_SHIFT_DURATION,
        stretchEnabled: schedulingConfig.stretch_to_full_semester !== false,
        minShiftsForStretch: schedulingConfig.min_shifts_for_stretch ?? 2,
    };
}

function getRhythmDisplayLabel(mode) {
    if (mode === RHYTHM_MODES.PHASE_5_5) {
        return '5 tuần 1 ca + 5 tuần 2 ca';
    }
    return null;
}

function resolvePhaseDateRange(semester, weekFrom, weekTo) {
    const fallbackStart = new Date('2026-04-06');
    const fallbackEnd = new Date('2026-05-10');
    const semesterStart = semester?.start_date ? new Date(semester.start_date) : fallbackStart;
    const semesterEnd = semester?.end_date ? new Date(semester.end_date) : fallbackEnd;
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    const from = Math.max(1, Number(weekFrom) || 1);
    const to = Math.max(from, Number(weekTo) || from);

    const phaseStart = new Date(semesterStart);
    phaseStart.setDate(phaseStart.getDate() + (from - 1) * 7);

    const phaseEnd = new Date(semesterStart);
    phaseEnd.setDate(phaseEnd.getDate() + to * 7 - 1);
    if (phaseEnd > semesterEnd) {
        phaseEnd.setTime(semesterEnd.getTime());
    }
    if (phaseStart > semesterEnd) {
        return { start_date: semesterStart, end_date: semesterEnd };
    }

    return { start_date: phaseStart, end_date: phaseEnd };
}

module.exports = {
    RHYTHM_MODES,
    resolveScheduleRhythm,
    buildSchedulingEventsFromPlan,
    buildSchedulingEventsFromParams,
    resolveSectionSchedulePlan,
    buildRhythmOptionsFromConfig,
    getRhythmDisplayLabel,
    resolvePhaseDateRange,
};
