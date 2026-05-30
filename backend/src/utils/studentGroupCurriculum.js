const { ensureCurriculum } = require('./curriculumFactory');
const { resolveMajorRef, loadMajorLookups } = require('./majorResolver');

function parseGroupIdParts(groupId) {
    const trimmed = String(groupId || '').trim();

    const dashWithSeq = trimmed.match(/^([Kk]\d+)-(.+?)_(\d+)$/);
    if (dashWithSeq) {
        return {
            cohortId: dashWithSeq[1].toUpperCase(),
            majorToken: dashWithSeq[2],
        };
    }

    const dashNoSeq = trimmed.match(/^([Kk]\d+)-(.+)$/);
    if (dashNoSeq) {
        return {
            cohortId: dashNoSeq[1].toUpperCase(),
            majorToken: dashNoSeq[2],
        };
    }

    const parts = trimmed.split('_').filter(Boolean);
    if (parts.length >= 2 && /^K\d+$/i.test(parts[0])) {
        return {
            cohortId: parts[0].toUpperCase(),
            majorToken: parts[1],
        };
    }

    return { cohortId: null, majorToken: null };
}

function parseCohortFromGroupId(groupId) {
    return parseGroupIdParts(groupId).cohortId;
}

function buildCurriculumLookup(curricula) {
    return new Map(
        curricula.map((curriculum) => [
            `${curriculum.major_id}:${curriculum.cohort_id}`,
            curriculum.curriculum_id,
        ]),
    );
}

function resolveMajorFromParams({ groupId, majorRef, internalMajorId, majorLookups }) {
    return resolveMajorRef({
        majorRef,
        internalMajorId,
        groupId,
        majorLookups,
    });
}

async function resolveStudentGroupCurriculum(
    prisma,
    {
        groupId,
        majorRef,
        internalMajorId,
        cohortId,
        curriculumLookup,
        majorLookups,
        autoCreateCurriculum = true,
    },
) {
    const normalizedGroupId = String(groupId || '').trim();

    if (!normalizedGroupId) {
        return { error: 'Thiếu mã lớp' };
    }

    const majorResolved = resolveMajorFromParams({
        groupId: normalizedGroupId,
        majorRef,
        internalMajorId,
        majorLookups,
    });

    if (majorResolved.error && !majorResolved.ambiguous) {
        return { error: majorResolved.error };
    }

    const resolvedCohortId = (String(cohortId || '').trim() || parseCohortFromGroupId(normalizedGroupId) || '')
        .toUpperCase();

    if (majorResolved.ambiguous) {
        return {
            ambiguous: true,
            candidates: majorResolved.candidates,
            error: majorResolved.error,
            cohortId: resolvedCohortId || null,
            groupId: normalizedGroupId,
        };
    }

    if (!resolvedCohortId) {
        return {
            error: 'Thiếu niên khóa. Nhập cột Niên khóa hoặc dùng mã lớp dạng K16-CNTT_1',
        };
    }

    const lookupKey = `${majorResolved.majorId}:${resolvedCohortId}`;
    let curriculumId = curriculumLookup.get(lookupKey);
    let curriculumCreated = false;

    if (!curriculumId && autoCreateCurriculum) {
        try {
            curriculumId = await ensureCurriculum(prisma, {
                majorId: majorResolved.majorId,
                cohortId: resolvedCohortId,
            });
            curriculumLookup.set(lookupKey, curriculumId);
            curriculumCreated = true;
        } catch (error) {
            return { error: error.message };
        }
    }

    if (!curriculumId) {
        return {
            error: `Chưa có CTĐT cho ngành '${majorResolved.majorId}' và niên khóa '${resolvedCohortId}'`,
        };
    }

    const major = majorLookups.byId.get(majorResolved.majorId);

    return {
        curriculumId,
        cohortId: resolvedCohortId,
        groupId: normalizedGroupId,
        majorId: majorResolved.majorId,
        major,
        source: majorResolved.source,
        curriculumCreated,
    };
}

async function loadCurriculumLookup(prisma) {
    const curricula = await prisma.curriculum.findMany({
        select: { curriculum_id: true, major_id: true, cohort_id: true },
    });
    return buildCurriculumLookup(curricula);
}

module.exports = {
    parseCohortFromGroupId,
    parseGroupIdParts,
    buildCurriculumLookup,
    resolveStudentGroupCurriculum,
    loadCurriculumLookup,
};
