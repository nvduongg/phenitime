const { PrismaClient } = require('@prisma/client');
const { syncCourseCreditFields } = require('../utils/periodCalculator');
const { normalizeDeliveryChannelInput } = require('../utils/deliveryChannels');
const prisma = new PrismaClient();

exports.getAllCourses = async (req, res) => {
    try {
        const courses = await prisma.course.findMany({
            include: { unit: true } // Lấy kèm thông tin Khoa quản lý
        });
        res.status(200).json({ status: 'success', data: courses });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createCourse = async (req, res) => {
    try {
        const {
            course_id,
            course_name,
            credits,
            theory_credits,
            practice_credits,
            class_type,
            room_type,
            default_room_type,
            template_code,
            unit_id,
        } = req.body;
        const resolvedRoomType = default_room_type || room_type || 'LT';
        const resolvedChannel = normalizeDeliveryChannelInput(class_type || 'FACE');
        const newCourse = await prisma.course.create({
            data: syncCourseCreditFields({
                course_id,
                course_name,
                credits,
                theory_credits,
                practice_credits,
                class_type: resolvedChannel,
                room_type: resolvedRoomType,
                default_room_type: resolvedRoomType,
                template_code: template_code || 'STANDARD',
                unit_id,
            }),
        });
        res.status(201).json({ status: 'success', data: newCourse });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ status: 'fail', message: 'Mã học phần đã tồn tại' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// Update và Delete rút gọn
exports.updateCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        if (data.room_type && !data.default_room_type) {
            data.default_room_type = data.room_type;
        }
        if (data.default_room_type && !data.room_type) {
            data.room_type = data.default_room_type;
        }
        if (data.class_type) {
            data.class_type = normalizeDeliveryChannelInput(data.class_type);
        }
        const updatedCourse = await prisma.course.update({
            where: { course_id: id },
            data: syncCourseCreditFields(data),
        });
        res.status(200).json({ status: 'success', data: updatedCourse });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        await prisma.course.delete({ where: { course_id: req.params.id } });
        res.status(200).json({ status: 'success', message: 'Xóa thành công' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};