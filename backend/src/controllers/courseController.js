const { PrismaClient } = require('@prisma/client');
const { syncCourseCreditFields } = require('../utils/periodCalculator');
const { normalizeDeliveryChannelInput } = require('../utils/deliveryChannels');
const {
    syncCourseOfflineFields,
    validateOfflineSchedule,
} = require('../utils/offlineScheduleConfig');
const { getSchedulingConfig } = require('../services/system-config.service');
const prisma = new PrismaClient();

async function prepareCoursePayload(body = {}) {
    const schedulingConfig = await getSchedulingConfig(prisma);
    const importDefaults = schedulingConfig.import_defaults || {};
    const data = syncCourseCreditFields({ ...body });
    if (!data.class_type) {
        data.class_type = importDefaults.course_class_type;
    }
    if (!data.room_type && !data.default_room_type) {
        data.room_type = importDefaults.course_room_type;
        data.default_room_type = importDefaults.course_room_type;
    }
    if (!data.template_code) {
        data.template_code = importDefaults.course_template_code;
    }
    if (data.room_type && !data.default_room_type) {
        data.default_room_type = data.room_type;
    }
    if (data.default_room_type && !data.room_type) {
        data.room_type = data.default_room_type;
    }
    if (data.class_type) {
        data.class_type = normalizeDeliveryChannelInput(data.class_type);
    }
    return syncCourseOfflineFields(data, schedulingConfig.offline_schedule_defaults);
}

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
        const data = await prepareCoursePayload(req.body);
        const offlineError = validateOfflineSchedule(data);
        if (offlineError) {
            return res.status(400).json({ status: 'fail', message: offlineError });
        }

        const resolvedRoomType = data.default_room_type || data.room_type;
        const newCourse = await prisma.course.create({
            data: {
                ...data,
                room_type: resolvedRoomType,
                default_room_type: resolvedRoomType,
                template_code: data.template_code,
            },
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
        const data = await prepareCoursePayload(req.body);
        const offlineError = validateOfflineSchedule(data);
        if (offlineError) {
            return res.status(400).json({ status: 'fail', message: offlineError });
        }

        const updatedCourse = await prisma.course.update({
            where: { course_id: id },
            data,
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
