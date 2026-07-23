const SCHEDULING_CONFIG_KEY = 'scheduling';

const DEFAULT_ROOM_TYPE_CAPACITIES = {
    LT: 80,
    STD: 80,
    PM: 40,
    PC: 45,
    TN: 40,
    SB: 40,
    XT: 40,
    BV: 40,
    MED: 20,
    DN: 40,
    ONLINE: 9999,
    TH: 40,
    LAB: 40,
};

const DEFAULT_SECTIONING_TEMPLATES = {
    STANDARD: {
        ltCap: 80,
        thCap: 40,
        ltRoom: 'STD',
        thRoom: 'TH',
    },
    LAB_COUPLED: {
        syncCap: 40,
        ltRoom: 'PC',
        thRoom: 'PC',
    },
    ONLINE: {
        cap: 800,
        room: 'ONLINE',
    },
    MEDICAL_CLINIC: {
        cap: 20,
        room: 'MED',
    },
    SPECIAL: {
        skipsAutoGenerate: true,
    },
};

const DEFAULT_SOLVER_POLICY = {
    solver_max_time_seconds: 120,
    solver_num_workers: 8,
    enable_relaxation_pass: true,
    relaxation_max_time_seconds: 90,
    soft_capacity_ratio: 0.9,
    relaxed_max_shifts_per_day: 3,
    enable_lns_pass: true,
    lns_max_iterations: 4,
    lns_max_neighborhood: 50,
    lns_max_time_seconds: 120,
    fixed_room_per_section: true,
    virtual_room_capacity: 9999,
    max_student_group_sessions_per_day: 3,
};

const DEFAULT_IMPORT_DEFAULTS = {
    course_credits: 3,
    course_theory_credits: 0,
    course_practice_credits: 0,
    course_class_type: 'LT',
    course_room_type: 'LT',
    course_template_code: 'STANDARD',
    lecturer_max_quota: 15,
    course_section_capacity: 40,
};

const DEFAULT_OFFLINE_SCHEDULE_DEFAULTS = {
    periods_per_session: 3,
    week_rhythm: 'WEEKLY',
    week_interval: 2,
};

const DEFAULT_WAVE_SUGGESTION = {
    name_prefix: 'Đợt',
    week_gap_ratio: 0.5,
    one_cohort_per_wave: true,
};

const DEFAULT_SCHEDULING_CONFIG = {
    default_lt_capacity: 80,
    default_th_capacity: 40,
    /** Sĩ số mặc định / nhóm SV khi chưa khai báo student_count (sinh lớp tự động). */
    default_student_count: 100,
    /** Max SV / lớp ONLINE trước khi tách thêm ELN02… (ghép tối đa vào 1 lớp nếu tổng ≤ giá trị này). */
    default_eln_capacity: 800,
    /** Max SV / track Coursera (COUR01) trước khi tách COUR02… — khớp TKB thực (~200–280). */
    default_cour_capacity: 240,
    shift_duration: 3,
    max_teaching_weeks: 10,
    stretch_to_full_semester: true,
    min_shifts_for_stretch: 2,
    allowed_start_periods: [1, 4, 7, 10, 13],
    allowed_days: [2, 3, 4, 5, 6, 7],
    evening_start_periods: [13],
    max_lecturer_shifts_per_day: 2,
    room_type_capacities: DEFAULT_ROOM_TYPE_CAPACITIES,
    sectioning_templates: DEFAULT_SECTIONING_TEMPLATES,
    solver_policy: DEFAULT_SOLVER_POLICY,
    import_defaults: DEFAULT_IMPORT_DEFAULTS,
    offline_schedule_defaults: DEFAULT_OFFLINE_SCHEDULE_DEFAULTS,
    wave_suggestion: DEFAULT_WAVE_SUGGESTION,
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

function normalizePositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBoolean(value, fallback = true) {
    if (value === true || value === false) {
        return value;
    }
    return fallback;
}

function normalizeRoomTypeCapacities(value = {}, fallback = DEFAULT_ROOM_TYPE_CAPACITIES) {
    return Object.fromEntries(
        Object.entries(DEFAULT_ROOM_TYPE_CAPACITIES).map(([roomType, defaultCapacity]) => [
            roomType,
            normalizePositiveNumber(value?.[roomType], fallback?.[roomType] ?? defaultCapacity),
        ]),
    );
}

function normalizeRoomType(value, fallback = 'LT') {
    const raw = String(value || '').trim().toUpperCase();
    return raw || fallback;
}

function normalizeSectioningTemplates(value = {}, fallback = DEFAULT_SECTIONING_TEMPLATES) {
    const source = value && typeof value === 'object' ? value : {};
    const fallbackSource = fallback && typeof fallback === 'object' ? fallback : DEFAULT_SECTIONING_TEMPLATES;

    return Object.fromEntries(
        Object.entries(DEFAULT_SECTIONING_TEMPLATES).map(([templateCode, defaultTemplate]) => {
            const incoming = source[templateCode] && typeof source[templateCode] === 'object'
                ? source[templateCode]
                : {};
            const currentFallback = fallbackSource[templateCode] || defaultTemplate;
            const normalized = { ...defaultTemplate };

            for (const [key, defaultValue] of Object.entries(defaultTemplate)) {
                if (typeof defaultValue === 'number') {
                    normalized[key] = normalizePositiveNumber(
                        incoming[key],
                        currentFallback[key] ?? defaultValue,
                    );
                } else if (typeof defaultValue === 'boolean') {
                    normalized[key] = normalizeBoolean(
                        incoming[key],
                        currentFallback[key] ?? defaultValue,
                    );
                } else {
                    normalized[key] = normalizeRoomType(
                        incoming[key] ?? currentFallback[key],
                        defaultValue,
                    );
                }
            }

            return [templateCode, normalized];
        }),
    );
}

function normalizeSolverPolicy(value = {}, fallback = DEFAULT_SOLVER_POLICY) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        solver_max_time_seconds: normalizePositiveNumber(
            source.solver_max_time_seconds,
            fallback.solver_max_time_seconds,
        ),
        solver_num_workers: Math.max(
            1,
            Math.floor(normalizePositiveNumber(source.solver_num_workers, fallback.solver_num_workers)),
        ),
        enable_relaxation_pass: normalizeBoolean(
            source.enable_relaxation_pass,
            fallback.enable_relaxation_pass,
        ),
        relaxation_max_time_seconds: normalizePositiveNumber(
            source.relaxation_max_time_seconds,
            fallback.relaxation_max_time_seconds,
        ),
        soft_capacity_ratio: Math.min(
            1,
            Math.max(0.1, Number(source.soft_capacity_ratio) || fallback.soft_capacity_ratio),
        ),
        relaxed_max_shifts_per_day: Math.max(
            1,
            Math.floor(normalizePositiveNumber(
                source.relaxed_max_shifts_per_day,
                fallback.relaxed_max_shifts_per_day,
            )),
        ),
        enable_lns_pass: normalizeBoolean(source.enable_lns_pass, fallback.enable_lns_pass),
        lns_max_iterations: Math.max(
            1,
            Math.floor(normalizePositiveNumber(source.lns_max_iterations, fallback.lns_max_iterations)),
        ),
        lns_max_neighborhood: Math.max(
            1,
            Math.floor(normalizePositiveNumber(source.lns_max_neighborhood, fallback.lns_max_neighborhood)),
        ),
        lns_max_time_seconds: normalizePositiveNumber(
            source.lns_max_time_seconds,
            fallback.lns_max_time_seconds,
        ),
        fixed_room_per_section: normalizeBoolean(
            source.fixed_room_per_section,
            fallback.fixed_room_per_section,
        ),
        virtual_room_capacity: normalizePositiveNumber(
            source.virtual_room_capacity,
            fallback.virtual_room_capacity,
        ),
    };
}

function normalizeCode(value, fallback) {
    const text = String(value || '').trim().toUpperCase();
    return text || fallback;
}

function normalizeImportDefaults(value = {}, fallback = DEFAULT_IMPORT_DEFAULTS) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        course_credits: normalizePositiveNumber(source.course_credits, fallback.course_credits),
        course_theory_credits: Math.max(0, Number(source.course_theory_credits) || fallback.course_theory_credits),
        course_practice_credits: Math.max(0, Number(source.course_practice_credits) || fallback.course_practice_credits),
        course_class_type: normalizeCode(source.course_class_type, fallback.course_class_type),
        course_room_type: normalizeCode(source.course_room_type, fallback.course_room_type),
        course_template_code: normalizeCode(source.course_template_code, fallback.course_template_code),
        lecturer_max_quota: normalizePositiveNumber(source.lecturer_max_quota, fallback.lecturer_max_quota),
        course_section_capacity: normalizePositiveNumber(
            source.course_section_capacity,
            fallback.course_section_capacity,
        ),
    };
}

function normalizeOfflineScheduleDefaults(value = {}, fallback = DEFAULT_OFFLINE_SCHEDULE_DEFAULTS) {
    const source = value && typeof value === 'object' ? value : {};
    const rhythm = normalizeCode(source.week_rhythm, fallback.week_rhythm);
    return {
        periods_per_session: normalizePositiveNumber(
            source.periods_per_session,
            fallback.periods_per_session,
        ),
        week_rhythm: ['WEEKLY', 'BIWEEKLY', 'EVERY_N', 'CUSTOM'].includes(rhythm)
            ? rhythm
            : fallback.week_rhythm,
        week_interval: Math.max(
            2,
            Math.floor(normalizePositiveNumber(source.week_interval, fallback.week_interval)),
        ),
    };
}

function normalizeWaveSuggestion(value = {}, fallback = DEFAULT_WAVE_SUGGESTION) {
    const source = value && typeof value === 'object' ? value : {};
    const ratio = Number(source.week_gap_ratio);
    return {
        name_prefix: String(source.name_prefix || fallback.name_prefix || 'Đợt').trim() || 'Đợt',
        week_gap_ratio: Number.isFinite(ratio) && ratio > 0
            ? Math.min(ratio, 2)
            : fallback.week_gap_ratio,
        one_cohort_per_wave: normalizeBoolean(
            source.one_cohort_per_wave,
            fallback.one_cohort_per_wave,
        ),
    };
}

function normalizeSchedulingConfig(raw = {}) {
    const base = {
        ...DEFAULT_SCHEDULING_CONFIG,
        ...(raw && typeof raw === 'object' ? raw : {}),
    };
    const ltCapacity = Number(raw.default_lt_capacity);
    const thCapacity = Number(raw.default_th_capacity);
    const defaultStudentCount = Number(raw.default_student_count);
    const elnCapacity = Number(raw.default_eln_capacity);
    const courCapacity = Number(raw.default_cour_capacity);
    const shiftDuration = Number(raw.shift_duration);
    const maxLecturerShiftsPerDay = Number(raw.max_lecturer_shifts_per_day);
    const maxTeachingWeeks = Number(raw.max_teaching_weeks);

    return {
        default_lt_capacity: ltCapacity > 0 ? ltCapacity : DEFAULT_SCHEDULING_CONFIG.default_lt_capacity,
        default_th_capacity: thCapacity > 0 ? thCapacity : DEFAULT_SCHEDULING_CONFIG.default_th_capacity,
        default_student_count: defaultStudentCount > 0
            ? defaultStudentCount
            : DEFAULT_SCHEDULING_CONFIG.default_student_count,
        default_eln_capacity: elnCapacity > 0 ? elnCapacity : DEFAULT_SCHEDULING_CONFIG.default_eln_capacity,
        default_cour_capacity: courCapacity > 0 ? courCapacity : DEFAULT_SCHEDULING_CONFIG.default_cour_capacity,
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
        room_type_capacities: normalizeRoomTypeCapacities(
            raw.room_type_capacities,
            base.room_type_capacities,
        ),
        sectioning_templates: normalizeSectioningTemplates(
            raw.sectioning_templates,
            base.sectioning_templates,
        ),
        solver_policy: normalizeSolverPolicy(raw.solver_policy, base.solver_policy),
        import_defaults: normalizeImportDefaults(raw.import_defaults, base.import_defaults),
        offline_schedule_defaults: normalizeOfflineScheduleDefaults(
            raw.offline_schedule_defaults,
            base.offline_schedule_defaults,
        ),
        wave_suggestion: normalizeWaveSuggestion(raw.wave_suggestion, base.wave_suggestion),
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
        default_cour_capacity: merged.default_cour_capacity,
        shift_duration: merged.shift_duration,
        max_teaching_weeks: merged.max_teaching_weeks,
        stretch_to_full_semester: merged.stretch_to_full_semester,
        min_shifts_for_stretch: merged.min_shifts_for_stretch,
        max_lecturer_shifts_per_day: merged.max_lecturer_shifts_per_day,
        allowed_start_periods: merged.allowed_start_periods,
        regular_starts: merged.allowed_start_periods,
        evening_starts: merged.evening_start_periods,
        allowed_days: merged.allowed_days,
        room_type_capacities: merged.room_type_capacities,
        sectioning_templates: merged.sectioning_templates,
        ...merged.solver_policy,
    };
}

module.exports = {
    SCHEDULING_CONFIG_KEY,
    DEFAULT_SCHEDULING_CONFIG,
    DEFAULT_ROOM_TYPE_CAPACITIES,
    DEFAULT_SECTIONING_TEMPLATES,
    DEFAULT_SOLVER_POLICY,
    DEFAULT_IMPORT_DEFAULTS,
    DEFAULT_OFFLINE_SCHEDULE_DEFAULTS,
    DEFAULT_WAVE_SUGGESTION,
    getSchedulingConfig,
    updateSchedulingConfig,
    buildSolverConfig,
    normalizeSchedulingConfig,
};
