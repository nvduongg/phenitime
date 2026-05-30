function buildCurriculumId(majorId, cohortId) {
    return `${majorId}-${cohortId}`;
}

function buildCurriculumName(majorName, cohortId) {
    return `${majorName} - Niên khóa ${cohortId}`;
}

async function ensureCurriculum(prisma, { majorId, cohortId }) {
    const normalizedMajorId = String(majorId || '').trim();
    const normalizedCohortId = String(cohortId || '').trim().toUpperCase();
    const curriculumId = buildCurriculumId(normalizedMajorId, normalizedCohortId);

    const existing = await prisma.curriculum.findUnique({
        where: { curriculum_id: curriculumId },
        select: { curriculum_id: true },
    });
    if (existing) {
        return existing.curriculum_id;
    }

    const major = await prisma.major.findUnique({
        where: { major_id: normalizedMajorId },
        select: { major_id: true, major_name: true, unit_id: true },
    });
    if (!major) {
        const error = new Error(`Ngành '${normalizedMajorId}' chưa tồn tại trong hệ thống`);
        error.statusCode = 400;
        throw error;
    }

    const cohort = await prisma.cohort.findUnique({
        where: { cohort_id: normalizedCohortId },
        select: { cohort_id: true },
    });
    if (!cohort) {
        const error = new Error(
            `Niên khóa '${normalizedCohortId}' chưa tồn tại — vui lòng tạo niên khóa trước khi nhập lớp`,
        );
        error.statusCode = 400;
        throw error;
    }

    const created = await prisma.curriculum.create({
        data: {
            curriculum_id: curriculumId,
            curriculum_name: buildCurriculumName(major.major_name, normalizedCohortId),
            major_id: normalizedMajorId,
            total_credits: 0,
            cohort_id: normalizedCohortId,
            unit_id: major.unit_id,
        },
        select: { curriculum_id: true },
    });

    return created.curriculum_id;
}

module.exports = {
    buildCurriculumId,
    buildCurriculumName,
    ensureCurriculum,
};
