const {
    buildOccupancyBlocks,
    applyWaveWeekOffset,
} = require('./timetableOccupancy');

function normalizeCohortIdList(cohortIds = []) {
    return [...new Set(
        (Array.isArray(cohortIds) ? cohortIds : [cohortIds])
            .map((id) => String(id).trim())
            .filter(Boolean),
    )];
}

/** Suy đợt từ niên khóa khi UI chưa chọn wave_id (VD: chỉ lọc K18). */
function findWaveForCohorts(waves = [], cohortIds = []) {
    const normalized = normalizeCohortIdList(cohortIds);
    if (!waves.length || !normalized.length) {
        return null;
    }

    const exact = waves.find((wave) => {
        const waveCohorts = normalizeCohortIdList(wave.cohort_ids);
        return waveCohorts.length === normalized.length
            && normalized.every((id) => waveCohorts.includes(id));
    });
    if (exact) {
        return exact;
    }

    const subsetMatches = waves.filter((wave) => {
        const waveCohorts = normalizeCohortIdList(wave.cohort_ids);
        return normalized.every((id) => waveCohorts.includes(id));
    });

    if (subsetMatches.length === 1) {
        return subsetMatches[0];
    }

    return null;
}

async function resolveWaveContext(prisma, semesterId, waveId) {
    if (!waveId) {
        return null;
    }

    const wave = await prisma.semesterWave.findFirst({
        where: {
            semester_id: semesterId,
            OR: [
                { wave_id: String(waveId) },
                { wave_order: Number(waveId) || -1 },
            ],
        },
    });

    if (!wave) {
        throw new Error(`Không tìm thấy đợt '${waveId}' trong học kỳ '${semesterId}'.`);
    }

    return wave;
}

async function resolveSchedulingWave(prisma, semesterId, { waveId = null, cohortIds = [] } = {}) {
    if (waveId) {
        return resolveWaveContext(prisma, semesterId, waveId);
    }

    const normalized = normalizeCohortIdList(cohortIds);
    if (!normalized.length) {
        return null;
    }

    const waves = await prisma.semesterWave.findMany({
        where: { semester_id: semesterId },
        orderBy: { wave_order: 'asc' },
    });

    return findWaveForCohorts(waves, normalized);
}

async function loadExistingOccupancy(prisma, semesterId, excludeSectionIds = []) {
    const semester = await prisma.semester.findUnique({
        where: { semester_id: semesterId },
        select: { start_date: true, end_date: true },
    });

    if (!semester) {
        return [];
    }

    const timetables = await prisma.timetable.findMany({
        where: {
            section: { semester_id: semesterId },
            room_id: { not: null },
            ...(excludeSectionIds.length
                ? { section_id: { notIn: excludeSectionIds } }
                : {}),
        },
        select: {
            room_id: true,
            day_of_week: true,
            start_period: true,
            period_count: true,
            start_date: true,
            end_date: true,
        },
    });

    const blocks = buildOccupancyBlocks(timetables, semester);
    console.log(
        `[scheduler.service] Loaded ${blocks.length} existing occupancy block(s) `
        + `from prior wave timetables.`,
    );
    return blocks;
}

module.exports = {
    resolveWaveContext,
    resolveSchedulingWave,
    findWaveForCohorts,
    loadExistingOccupancy,
    applyWaveWeekOffset,
};
