const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

const { getAiCoreApiUrl } = require('../config/aiCore');

const { autoGenerateCourseSections } = require('../services/course-sections.service');

function getSectionWeight(section) {
    const raw = section.class_type === 'TH'
        ? section.course?.practice_credits
        : section.course?.theory_credits;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.round(parsed * 100) / 100;
}

function buildLecturerLoads(sections) {
    const loads = {};
    for (const section of sections) {
        if (!section.lecturer_id) continue;
        const nextLoad = (loads[section.lecturer_id] || 0) + getSectionWeight(section);
        loads[section.lecturer_id] = Math.round(nextLoad * 100) / 100;
    }
    return loads;
}

function formatAiCoreError(error) {
    const data = error?.response?.data;
    if (typeof data?.message === 'string' && data.message.trim()) {
        return data.message;
    }

    const detail = data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
        return detail;
    }

    if (Array.isArray(detail)) {
        return detail
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item?.msg) {
                    const location = Array.isArray(item.loc) ? item.loc.join('.') : '';
                    return location ? `${location}: ${item.msg}` : item.msg;
                }
                return JSON.stringify(item);
            })
            .join('; ');
    }

    return 'Không thể kết nối tới AI Core Engine. Vui lòng kiểm tra FastAPI server.';
}

async function assertSemesterExists(semester_id) {
    const semester = await prisma.semester.findUnique({ where: { semester_id } });
    if (!semester) {
        const error = new Error(
            `Mã học kỳ '${semester_id}' chưa tồn tại. Vui lòng tạo học kỳ trong Quản lý danh mục trước.`
        );
        error.statusCode = 400;
        throw error;
    }
    return semester;
}

function handlePrismaError(error, res) {
    if (error.code === 'P2002') {
        return res.status(400).json({ status: 'fail', message: 'Mã lớp học phần đã tồn tại' });
    }
    if (error.code === 'P2003') {
        return res.status(400).json({
            status: 'fail',
            message: 'Lỗi ràng buộc dữ liệu: Mã học kỳ, môn học hoặc giảng viên chưa tồn tại trong hệ thống.',
        });
    }
    if (error.statusCode === 400) {
        return res.status(400).json({ status: 'fail', message: error.message });
    }
    if (error.statusCode === 404) {
        return res.status(404).json({ status: 'fail', message: error.message });
    }
    return res.status(500).json({ status: 'error', message: error.message });
}

exports.getAllCourseSections = async (req, res) => {
    try {
        const sections = await prisma.courseSection.findMany({
            include: {
                course: { include: { unit: true } },
                lecturer: true,
                student_groups: true,
                semester: {
                    select: { start_date: true, end_date: true },
                },
                timetables: {
                    select: { start_date: true, end_date: true },
                },
            },
        });
        res.status(200).json({ status: 'success', data: sections });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createCourseSection = async (req, res) => {
    try {
        const { section_id, course_id, semester_id, lecturer_id, class_type, capacity, student_group_ids } = req.body;
        await assertSemesterExists(semester_id);

        const newSection = await prisma.courseSection.create({
            data: { 
                section_id, course_id, semester_id, lecturer_id, class_type, capacity,
                student_groups: { connect: student_group_ids ? student_group_ids.map(id => ({ group_id: id })) : [] }
            },
            include: { student_groups: true }
        });
        res.status(201).json({ status: 'success', data: newSection });
    } catch (error) {
        return handlePrismaError(error, res);
    }
};

exports.updateCourseSection = async (req, res) => {
    try {
        const {
            section_id,
            student_group_ids,
            student_groups,
            course,
            lecturer,
            semester,
            timetables,
            ...scalarFields
        } = req.body;

        const data = { ...scalarFields };

        if (student_group_ids !== undefined) {
            data.student_groups = {
                set: (student_group_ids || []).map((id) => ({ group_id: id })),
            };
        }

        const updatedSection = await prisma.courseSection.update({
            where: { section_id: req.params.id },
            data,
            include: { course: true, lecturer: true, student_groups: true },
        });
        res.status(200).json({ status: 'success', data: updatedSection });
    } catch (error) {
        return handlePrismaError(error, res);
    }
};

exports.deleteCourseSection = async (req, res) => {
    try {
        await prisma.courseSection.delete({ where: { section_id: req.params.id } });
        res.status(200).json({ status: 'success', message: 'Xóa thành công' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.autoGenerateSections = async (req, res) => {
    try {
        const { semester_id } = req.body;

        if (!semester_id) {
            return res.status(400).json({
                status: 'fail',
                message: 'Vui lòng cung cấp mã học kỳ (semester_id)',
            });
        }

        const result = await autoGenerateCourseSections(prisma, req.body);

        return res.status(result.createdCount > 0 ? 201 : 200).json({
            status: 'success',
            message: result.message,
            data: result.sections,
            created_count: result.createdCount,
            removed_count: result.removedCount,
            curricula_processed: result.curriculaProcessed,
        });
    } catch (error) {
        return handlePrismaError(error, res);
    }
};

exports.autoAssignLecturers = async (req, res) => {
    try {
        const { semester_id } = req.body;

        if (!semester_id) {
            return res.status(400).json({
                status: 'fail',
                message: 'Vui lòng cung cấp mã học kỳ (semester_id)',
            });
        }

        const unassignedSections = await prisma.courseSection.findMany({
            where: {
                semester_id,
                lecturer_id: null,
            },
            include: { course: true },
        });

        if (unassignedSections.length === 0) {
            return res.status(200).json({
                status: 'success',
                message: 'Tất cả lớp học phần trong học kỳ này đã được phân công giảng viên',
                data: [],
            });
        }

        const assignedSections = await prisma.courseSection.findMany({
            where: {
                semester_id,
                lecturer_id: { not: null },
            },
            include: { course: true },
        });

        const lecturers = await prisma.lecturer.findMany({
            include: { specialties: true },
        });
        if (lecturers.length === 0) {
            return res.status(400).json({
                status: 'fail',
                message: 'Không có giảng viên trong hệ thống để phân công',
            });
        }

        const loadByLecturer = buildLecturerLoads(assignedSections);

        const aiPayload = {
            sections: unassignedSections.map((section) => ({
                section_id: section.section_id,
                course_id: section.course_id,
                weight: getSectionWeight(section),
            })),
            lecturers: lecturers.map((lecturer) => ({
                lecturer_id: lecturer.lecturer_id,
                max_quota: lecturer.max_quota ?? 15,
                current_load: loadByLecturer[lecturer.lecturer_id] || 0,
                course_ids: lecturer.specialties.map((item) => item.course_id),
            })),
        };

        let aiResponse;
        try {
            aiResponse = await axios.post(getAiCoreApiUrl('/assign-lecturers'), aiPayload, {
                timeout: 60000,
            });
        } catch (error) {
            return res.status(error.response?.status || 502).json({
                status: 'fail',
                message: formatAiCoreError(error),
            });
        }

        const aiResult = aiResponse.data;
        if (aiResult.status === 'fail') {
            return res.status(400).json(aiResult);
        }

        const assignments = aiResult.assignments || [];
        if (assignments.length === 0) {
            return res.status(400).json({
                status: 'fail',
                message: 'AI không trả về phân công nào. Vui lòng kiểm tra dữ liệu đầu vào.',
            });
        }

        await prisma.$transaction(
            assignments.map((assignment) =>
                prisma.courseSection.update({
                    where: { section_id: assignment.section_id },
                    data: { lecturer_id: assignment.lecturer_id },
                }),
            ),
        );

        const updatedAssignedSections = await prisma.courseSection.findMany({
            where: {
                semester_id,
                lecturer_id: { not: null },
            },
            include: { course: true },
        });
        const updatedLoads = buildLecturerLoads(updatedAssignedSections);

        await prisma.$transaction(
            lecturers.map((lecturer) =>
                prisma.lecturer.update({
                    where: { lecturer_id: lecturer.lecturer_id },
                    data: { current_load: updatedLoads[lecturer.lecturer_id] || 0 },
                }),
            ),
        );

        res.status(200).json({
            status: 'success',
            message: aiResult.message || `Phân công AI thành công ${assignments.length} lớp học phần`,
            data: assignments,
            total_assigned: assignments.length,
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};