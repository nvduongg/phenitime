const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { loadMajorLookups } = require('../utils/majorResolver');
const {
    loadCurriculumLookup,
    resolveStudentGroupCurriculum,
} = require('../utils/studentGroupCurriculum');

const studentGroupInclude = {
    curriculum: {
        include: {
            major: true,
            cohort: true,
        },
    },
};

function formatCandidate(major) {
    return {
        major_id: major.major_id,
        major_code: major.major_code,
        major_name: major.major_name,
        label: `${major.major_code} — ${major.major_name}`,
    };
}

async function buildStudentGroupData(
    { group_id, major_id, cohort_id, student_count },
    curriculumLookup,
    majorLookups,
) {
    const resolved = await resolveStudentGroupCurriculum(prisma, {
        groupId: group_id,
        majorRef: major_id,
        internalMajorId: major_id,
        cohortId: cohort_id,
        curriculumLookup,
        majorLookups,
        autoCreateCurriculum: true,
    });

    if (resolved.ambiguous) {
        const error = new Error(resolved.error);
        error.statusCode = 409;
        error.data = {
            ambiguous: true,
            cohort_id: resolved.cohortId,
            candidates: resolved.candidates.map(formatCandidate),
        };
        throw error;
    }

    if (resolved.error) {
        const error = new Error(resolved.error);
        error.statusCode = 400;
        throw error;
    }

    return {
        group_id: resolved.groupId,
        group_name: resolved.groupId,
        curriculum_id: resolved.curriculumId,
        student_count: student_count ?? null,
        preview: {
            cohort_id: resolved.cohortId,
            major_id: resolved.majorId,
            curriculum_id: resolved.curriculumId,
            major: resolved.major,
            curriculum_created: resolved.curriculumCreated,
        },
    };
}

exports.previewStudentGroup = async (req, res) => {
    try {
        const { group_id, major_id, cohort_id } = req.query;

        if (!group_id) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng nhập mã lớp' });
        }

        const [curriculumLookup, majorLookups] = await Promise.all([
            loadCurriculumLookup(prisma),
            loadMajorLookups(prisma),
        ]);

        const resolved = await resolveStudentGroupCurriculum(prisma, {
            groupId: group_id,
            majorRef: major_id,
            internalMajorId: major_id,
            cohortId: cohort_id,
            curriculumLookup,
            majorLookups,
            autoCreateCurriculum: true,
        });

        if (resolved.ambiguous) {
            return res.status(200).json({
                status: 'success',
                data: {
                    group_id: String(group_id).trim(),
                    cohort_id: resolved.cohortId,
                    ambiguous: true,
                    candidates: resolved.candidates.map(formatCandidate),
                    message: resolved.error,
                },
            });
        }

        if (resolved.error) {
            return res.status(400).json({ status: 'fail', message: resolved.error });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                group_id: resolved.groupId,
                cohort_id: resolved.cohortId,
                major_id: resolved.majorId,
                curriculum_id: resolved.curriculumId,
                major: resolved.major,
                ambiguous: false,
                curriculum_created: resolved.curriculumCreated,
            },
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getAllStudentGroups = async (req, res) => {
    try {
        const groups = await prisma.studentGroup.findMany({
            include: studentGroupInclude,
            orderBy: { group_id: 'asc' },
        });
        res.status(200).json({ status: 'success', data: groups });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createStudentGroup = async (req, res) => {
    try {
        const { group_id, major_id, cohort_id, student_count } = req.body;

        if (!group_id) {
            return res.status(400).json({
                status: 'fail',
                message: 'Vui lòng nhập mã lớp',
            });
        }

        const [curriculumLookup, majorLookups] = await Promise.all([
            loadCurriculumLookup(prisma),
            loadMajorLookups(prisma),
        ]);

        const data = await buildStudentGroupData(
            { group_id, major_id, cohort_id, student_count },
            curriculumLookup,
            majorLookups,
        );

        const newGroup = await prisma.studentGroup.create({
            data: {
                group_id: data.group_id,
                group_name: data.group_name,
                curriculum_id: data.curriculum_id,
                student_count: data.student_count,
            },
            include: studentGroupInclude,
        });
        res.status(201).json({ status: 'success', data: newGroup });
    } catch (error) {
        if (error.statusCode === 409) {
            return res.status(409).json({
                status: 'fail',
                message: error.message,
                data: error.data,
            });
        }
        if (error.statusCode === 400) {
            return res.status(400).json({ status: 'fail', message: error.message });
        }
        if (error.code === 'P2002') {
            return res.status(400).json({ status: 'fail', message: 'Mã lớp đã tồn tại' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateStudentGroup = async (req, res) => {
    try {
        const { major_id, cohort_id, student_count } = req.body;
        const groupId = req.params.id;

        const current = await prisma.studentGroup.findUnique({
            where: { group_id: groupId },
            include: { curriculum: true },
        });

        if (!current) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy lớp sinh viên' });
        }

        const [curriculumLookup, majorLookups] = await Promise.all([
            loadCurriculumLookup(prisma),
            loadMajorLookups(prisma),
        ]);

        const data = await buildStudentGroupData(
            {
                group_id: groupId,
                major_id: major_id || current.curriculum?.major_id,
                cohort_id: cohort_id || current.curriculum?.cohort_id,
                student_count: student_count !== undefined ? student_count : current.student_count,
            },
            curriculumLookup,
            majorLookups,
        );

        const updatedGroup = await prisma.studentGroup.update({
            where: { group_id: groupId },
            data: {
                group_name: data.group_name,
                curriculum_id: data.curriculum_id,
                student_count: data.student_count,
            },
            include: studentGroupInclude,
        });
        res.status(200).json({ status: 'success', data: updatedGroup });
    } catch (error) {
        if (error.statusCode === 409) {
            return res.status(409).json({
                status: 'fail',
                message: error.message,
                data: error.data,
            });
        }
        if (error.statusCode === 400) {
            return res.status(400).json({ status: 'fail', message: error.message });
        }
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy lớp sinh viên' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteStudentGroup = async (req, res) => {
    try {
        await prisma.studentGroup.delete({ where: { group_id: req.params.id } });
        res.status(200).json({ status: 'success', message: 'Xóa thành công' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy lớp sinh viên' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};
