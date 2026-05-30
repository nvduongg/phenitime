const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { recalculateCurriculumCredits } = require('../utils/curriculumCredits');
const {
    buildCurriculumId,
    buildCurriculumName,
} = require('../utils/curriculumFactory');

const curriculumInclude = {
    major: { include: { unit: true } },
    cohort: true,
    unit: true,
    roadmaps: {
        include: { course: true },
        orderBy: { recommended_semester: 'asc' },
    },
};

async function loadMajor(majorId) {
    return prisma.major.findUnique({
        where: { major_id: majorId },
        include: { unit: true },
    });
}

exports.getAllCurricula = async (req, res) => {
    try {
        const curricula = await prisma.curriculum.findMany({
            include: curriculumInclude,
        });
        res.status(200).json({ status: 'success', data: curricula });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createCurriculum = async (req, res) => {
    try {
        const { major_id, cohort_id } = req.body;

        if (!major_id || !cohort_id) {
            return res.status(400).json({
                status: 'fail',
                message: 'Vui lòng chọn ngành đào tạo và niên khóa',
            });
        }

        const major = await loadMajor(major_id);
        if (!major) {
            return res.status(400).json({ status: 'fail', message: 'Mã ngành đào tạo chưa tồn tại' });
        }

        const cohort = await prisma.cohort.findUnique({ where: { cohort_id } });
        if (!cohort) {
            return res.status(400).json({ status: 'fail', message: 'Mã niên khóa chưa tồn tại' });
        }

        const curriculum_id = buildCurriculumId(major_id, cohort_id);
        const existing = await prisma.curriculum.findUnique({ where: { curriculum_id } });
        if (existing) {
            return res.status(400).json({
                status: 'fail',
                message: `Chương trình đào tạo ${curriculum_id} đã tồn tại`,
            });
        }

        const newCurr = await prisma.curriculum.create({
            data: {
                curriculum_id,
                curriculum_name: buildCurriculumName(major.major_name, cohort_id),
                major_id,
                total_credits: 0,
                cohort_id,
                unit_id: major.unit_id,
            },
            include: curriculumInclude,
        });
        res.status(201).json({ status: 'success', data: newCurr });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ status: 'fail', message: 'Chương trình đào tạo đã tồn tại' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateCurriculum = async (req, res) => {
    try {
        const { major_id } = req.body;
        const current = await prisma.curriculum.findUnique({
            where: { curriculum_id: req.params.id },
        });

        if (!current) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy chương trình đào tạo' });
        }

        if (!major_id || major_id === current.major_id) {
            const unchanged = await prisma.curriculum.findUnique({
                where: { curriculum_id: req.params.id },
                include: curriculumInclude,
            });
            return res.status(200).json({ status: 'success', data: unchanged });
        }

        const major = await loadMajor(major_id);
        if (!major) {
            return res.status(400).json({ status: 'fail', message: 'Mã ngành đào tạo chưa tồn tại' });
        }

        const updatedCurr = await prisma.curriculum.update({
            where: { curriculum_id: req.params.id },
            data: {
                major_id,
                curriculum_name: buildCurriculumName(major.major_name, current.cohort_id),
                unit_id: major.unit_id,
            },
            include: curriculumInclude,
        });
        res.status(200).json({ status: 'success', data: updatedCurr });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteCurriculum = async (req, res) => {
    try {
        await prisma.curriculum.delete({ where: { curriculum_id: req.params.id } });
        res.status(200).json({ status: 'success', message: 'Xóa thành công' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createRoadmap = async (req, res) => {
    try {
        const { curriculum_id, course_id, recommended_semester, course_type } = req.body;
        const newRoadmap = await prisma.roadmap.create({
            data: {
                curriculum_id,
                course_id,
                recommended_semester: parseInt(recommended_semester, 10),
                course_type,
            },
        });

        await recalculateCurriculumCredits(prisma, curriculum_id);

        res.status(201).json({ status: 'success', data: newRoadmap });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ status: 'fail', message: 'Môn học này đã có sẵn trong lộ trình' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};
