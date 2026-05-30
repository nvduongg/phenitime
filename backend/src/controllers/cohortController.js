const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllCohorts = async (req, res) => {
    try {
        const cohorts = await prisma.cohort.findMany({
            orderBy: { start_year: 'desc' }
        });
        res.status(200).json({ status: 'success', data: cohorts });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createCohort = async (req, res) => {
    try {
        const { cohort_id, start_year, training_type } = req.body;
        const newCohort = await prisma.cohort.create({
            data: { cohort_id, start_year, training_type }
        });
        res.status(201).json({ status: 'success', data: newCohort });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ status: 'fail', message: 'Mã niên khóa đã tồn tại' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateCohort = async (req, res) => {
    try {
        const { id } = req.params;
        const { start_year, training_type } = req.body;
        const updatedCohort = await prisma.cohort.update({
            where: { cohort_id: id },
            data: { start_year, training_type }
        });
        res.status(200).json({ status: 'success', data: updatedCohort });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ status: 'fail', message: 'Không tìm thấy niên khóa' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteCohort = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.cohort.delete({
            where: { cohort_id: id }
        });
        res.status(200).json({ status: 'success', message: 'Xóa niên khóa thành công' });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ status: 'fail', message: 'Không tìm thấy niên khóa' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};