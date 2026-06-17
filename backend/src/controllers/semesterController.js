const { PrismaClient } = require('@prisma/client');
const { computeSemesterEndDate } = require('../utils/semesterDates');
const { getSchedulingConfig } = require('../services/system-config.service');

const prisma = new PrismaClient();

async function resolveAutoEndDate(startDate, latestWaveStartWeek = 1) {
    const config = await getSchedulingConfig(prisma);
    return computeSemesterEndDate(startDate, {
        teachingWeeks: config.max_teaching_weeks,
        latestWaveStartWeek,
    });
}
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

        if (!start_date) {
            return res.status(400).json({ status: 'fail', message: 'Thiếu ngày bắt đầu học kỳ' });
        }

        const resolvedEndDate = end_date
            ? new Date(end_date)
            : await resolveAutoEndDate(start_date, 1);

        if (is_active) {
            await prisma.semester.updateMany({ data: { is_active: false } });
        }

        const newSemester = await prisma.semester.create({
            data: { 
                semester_id, 
                semester_name, 
                academic_year, 
                start_date: new Date(start_date), 
                end_date: resolvedEndDate,
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

        if (start_date !== undefined) {
            data.start_date = new Date(start_date);
            const current = updatedSemester || await prisma.semester.findUnique({
                where: { semester_id: id },
                include: { waves: { select: { start_week: true } } },
            });
            const latestWaveStartWeek = current.waves?.length
                ? Math.max(...current.waves.map((wave) => wave.start_week))
                : 1;
            data.end_date = end_date
                ? new Date(end_date)
                : await resolveAutoEndDate(start_date, latestWaveStartWeek);
        } else if (end_date !== undefined) {
            data.end_date = new Date(end_date);
        }
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

        const semester = await prisma.semester.findUnique({
            where: { semester_id: id },
            include: {
                _count: { select: { sections: true } },
            },
        });

        if (!semester) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy học kỳ' });
        }

        if (semester.is_active) {
            return res.status(400).json({
                status: 'fail',
                message: 'Không thể xóa học kỳ đang hoạt động. Hãy tắt trạng thái hoạt động trước.',
            });
        }

        const sectionCount = semester._count.sections;

        await prisma.$transaction(async (tx) => {
            if (sectionCount > 0) {
                await tx.courseSection.deleteMany({
                    where: { semester_id: id },
                });
            }

            await tx.semester.delete({
                where: { semester_id: id },
            });
        });

        const message = sectionCount > 0
            ? `Đã xóa học kỳ và ${sectionCount} lớp học phần (kèm TKB liên quan)`
            : 'Xóa học kỳ thành công';

        res.status(200).json({ status: 'success', message });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy học kỳ' });
        }
        if (error.code === 'P2003') {
            return res.status(409).json({
                status: 'fail',
                message: 'Không thể xóa học kỳ vì còn dữ liệu liên quan chưa được gỡ.',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};
