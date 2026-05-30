const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const lecturerInclude = {
    unit: true,
    specialties: {
        include: { course: true },
    },
};

async function syncSpecialties(lecturerId, courseIds = []) {
    const uniqueCourseIds = [...new Set((courseIds || []).filter(Boolean))];

    await prisma.lecturerCourseSpecialty.deleteMany({
        where: { lecturer_id: lecturerId },
    });

    if (uniqueCourseIds.length === 0) return;

    await prisma.lecturerCourseSpecialty.createMany({
        data: uniqueCourseIds.map((course_id) => ({
            lecturer_id: lecturerId,
            course_id,
        })),
        skipDuplicates: true,
    });
}

exports.getAllLecturers = async (req, res) => {
    try {
        const lecturers = await prisma.lecturer.findMany({
            include: lecturerInclude,
            orderBy: { lecturer_name: 'asc' },
        });
        res.status(200).json({ status: 'success', data: lecturers });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createLecturer = async (req, res) => {
    try {
        const {
            lecturer_id,
            lecturer_name,
            unit_id,
            max_quota,
            course_ids,
        } = req.body;

        const newLecturer = await prisma.lecturer.create({
            data: {
                lecturer_id,
                lecturer_name,
                unit_id,
                max_quota: max_quota ?? 15,
            },
        });

        await syncSpecialties(lecturer_id, course_ids);

        const lecturer = await prisma.lecturer.findUnique({
            where: { lecturer_id },
            include: lecturerInclude,
        });

        res.status(201).json({ status: 'success', data: lecturer });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ status: 'fail', message: 'Mã giảng viên đã tồn tại' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateLecturer = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            lecturer_name,
            unit_id,
            max_quota,
            course_ids,
        } = req.body;

        await prisma.lecturer.update({
            where: { lecturer_id: id },
            data: {
                lecturer_name,
                unit_id,
                max_quota,
            },
        });

        if (course_ids !== undefined) {
            await syncSpecialties(id, course_ids);
        }

        const lecturer = await prisma.lecturer.findUnique({
            where: { lecturer_id: id },
            include: lecturerInclude,
        });

        res.status(200).json({ status: 'success', data: lecturer });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy giảng viên' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteLecturer = async (req, res) => {
    try {
        await prisma.lecturer.delete({ where: { lecturer_id: req.params.id } });
        res.status(200).json({ status: 'success', message: 'Xóa thành công' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
