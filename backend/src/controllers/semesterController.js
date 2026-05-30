const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setActiveSemester(semesterId, isActive) {
    if (isActive) {
        await prisma.$transaction([
            prisma.semester.updateMany({ data: { is_active: false } }),
            prisma.semester.update({
                where: { semester_id: semesterId },
                data: { is_active: true },
            }),
        ]);
        return prisma.semester.findUnique({ where: { semester_id: semesterId } });
    }

    return prisma.semester.update({
        where: { semester_id: semesterId },
        data: { is_active: false },
    });
}

exports.getAllSemesters = async (req, res) => {
    try {
        const semesters = await prisma.semester.findMany({
            orderBy: { start_date: 'desc' }
        });
        res.status(200).json({ status: 'success', data: semesters });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createSemester = async (req, res) => {
    try {
        const { semester_id, semester_name, academic_year, start_date, end_date, is_active } = req.body;

        if (is_active) {
            await prisma.semester.updateMany({ data: { is_active: false } });
        }

        const newSemester = await prisma.semester.create({
            data: { 
                semester_id, 
                semester_name, 
                academic_year, 
                start_date: new Date(start_date), 
                end_date: new Date(end_date),
                is_active: Boolean(is_active),
            }
        });
        res.status(201).json({ status: 'success', data: newSemester });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ status: 'fail', message: 'Mã học kỳ đã tồn tại' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateSemester = async (req, res) => {
    try {
        const { id } = req.params;
        const { semester_name, academic_year, start_date, end_date, is_active } = req.body;

        let updatedSemester;

        if (is_active !== undefined) {
            updatedSemester = await setActiveSemester(id, Boolean(is_active));
        } else {
            updatedSemester = await prisma.semester.findUnique({ where: { semester_id: id } });
        }

        const data = {};
        if (semester_name !== undefined) data.semester_name = semester_name;
        if (academic_year !== undefined) data.academic_year = academic_year;
        if (start_date !== undefined) data.start_date = new Date(start_date);
        if (end_date !== undefined) data.end_date = new Date(end_date);

        if (Object.keys(data).length > 0) {
            updatedSemester = await prisma.semester.update({
                where: { semester_id: id },
                data,
            });
        }

        res.status(200).json({ status: 'success', data: updatedSemester });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ status: 'fail', message: 'Không tìm thấy học kỳ' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteSemester = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.semester.delete({
            where: { semester_id: id }
        });
        res.status(200).json({ status: 'success', message: 'Xóa học kỳ thành công' });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ status: 'fail', message: 'Không tìm thấy học kỳ' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};
