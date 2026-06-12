const SCHEDULING_CONFIG_KEY = 'scheduling';

const DEFAULT_SCHEDULING_CONFIG = {
    default_lt_capacity: 80,
    default_th_capacity: 40,
    /** Max SV / lớp ONLINE trước khi tách thêm ELN02… (ghép tối đa vào 1 lớp nếu tổng ≤ giá trị này). */
    default_eln_capacity: 800,
    shift_duration: 3,
    max_teaching_weeks: 10,
    stretch_to_full_semester: true,
    min_shifts_for_stretch: 2,
    allowed_start_periods: [1, 4, 7, 10, 13],
    allowed_days: [2, 3, 4, 5, 6, 7],
    evening_start_periods: [13],
    max_lecturer_shifts_per_day: 2,
};

function normalizeIntegerArray(value, fallback) {
    if (!Array.isArray(value)) {
        return [...fallback];
    }

    const parsed = value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));

    return parsed.length > 0 ? parsed : [...fallback];
}

function normalizeSchedulingConfig(raw = {}) {
    const ltCapacity = Number(raw.default_lt_capacity);
    const thCapacity = Number(raw.default_th_capacity);
    const elnCapacity = Number(raw.default_eln_capacity);
    const shiftDuration = Number(raw.shift_duration);
    const maxLecturerShiftsPerDay = Number(raw.max_lecturer_shifts_per_day);
    const maxTeachingWeeks = Number(raw.max_teaching_weeks);

    return {
        default_lt_capacity: ltCapacity > 0 ? ltCapacity : DEFAULT_SCHEDULING_CONFIG.default_lt_capacity,
        default_th_capacity: thCapacity > 0 ? thCapacity : DEFAULT_SCHEDULING_CONFIG.default_th_capacity,
        default_eln_capacity: elnCapacity > 0 ? elnCapacity : DEFAULT_SCHEDULING_CONFIG.default_eln_capacity,
        shift_duration: shiftDuration > 0 ? shiftDuration : DEFAULT_SCHEDULING_CONFIG.shift_duration,
        max_teaching_weeks:
            maxTeachingWeeks > 0 ? maxTeachingWeeks : DEFAULT_SCHEDULING_CONFIG.max_teaching_weeks,
        stretch_to_full_semester: raw.stretch_to_full_semester !== false,
        min_shifts_for_stretch:
            Number(raw.min_shifts_for_stretch) > 0
                ? Number(raw.min_shifts_for_stretch)
                : DEFAULT_SCHEDULING_CONFIG.min_shifts_for_stretch,
        max_lecturer_shifts_per_day:
            maxLecturerShiftsPerDay > 0
                ? maxLecturerShiftsPerDay
                : DEFAULT_SCHEDULING_CONFIG.max_lecturer_shifts_per_day,
        allowed_start_periods: normalizeIntegerArray(
            raw.allowed_start_periods,
            DEFAULT_SCHEDULING_CONFIG.allowed_start_periods,
        ),
        allowed_days: normalizeIntegerArray(
            raw.allowed_days,
            DEFAULT_SCHEDULING_CONFIG.allowed_days,
        ).filter((day) => day >= 2 && day <= 7),
        evening_start_periods: normalizeIntegerArray(
            raw.evening_start_periods,
            DEFAULT_SCHEDULING_CONFIG.evening_start_periods,
        ),
    };
}

async function getSchedulingConfig(prisma) {
    const row = await prisma.systemConfig.findUnique({
        where: { key: SCHEDULING_CONFIG_KEY },
    });

    if (!row?.value || typeof row.value !== 'object') {
        return { ...DEFAULT_SCHEDULING_CONFIG };
    }

    return normalizeSchedulingConfig(row.value);
}

async function updateSchedulingConfig(prisma, payload = {}) {
    const current = await getSchedulingConfig(prisma);
    const merged = normalizeSchedulingConfig({ ...current, ...payload });

    await prisma.systemConfig.upsert({
        where: { key: SCHEDULING_CONFIG_KEY },
        create: {
            key: SCHEDULING_CONFIG_KEY,
            value: merged,
        },
        update: {
            value: merged,
        },
    });

    return merged;
}

function buildSolverConfig(dbConfig, requestConfig = {}) {
    const merged = normalizeSchedulingConfig({
        ...dbConfig,
        allowed_start_periods:
            requestConfig.allowed_start_periods
            || requestConfig.regular_starts
            || dbConfig.allowed_start_periods,
        evening_start_periods:
            requestConfig.evening_start_periods || dbConfig.evening_start_periods,
        allowed_days: requestConfig.allowed_days || dbConfig.allowed_days,
        shift_duration: requestConfig.shift_duration || dbConfig.shift_duration,
        max_lecturer_shifts_per_day:
            requestConfig.max_lecturer_shifts_per_day
            || dbConfig.max_lecturer_shifts_per_day,
    });

    return {
        ...merged,
        default_lt_capacity: merged.default_lt_capacity,
        default_th_capacity: merged.default_th_capacity,
        default_eln_capacity: merged.default_eln_capacity,
        shift_duration: merged.shift_duration,
        max_teaching_weeks: merged.max_teaching_weeks,
        stretch_to_full_semester: merged.stretch_to_full_semester,
        min_shifts_for_stretch: merged.min_shifts_for_stretch,
        max_lecturer_shifts_per_day: merged.max_lecturer_shifts_per_day,
        allowed_start_periods: merged.allowed_start_periods,
        regular_starts: merged.allowed_start_periods,
        evening_starts: merged.evening_start_periods,
        allowed_days: merged.allowed_days,
    };
}

module.exports = {
    SCHEDULING_CONFIG_KEY,
    DEFAULT_SCHEDULING_CONFIG,
    getSchedulingConfig,
    updateSchedulingConfig,
    buildSolverConfig,
    normalizeSchedulingConfig,
};
