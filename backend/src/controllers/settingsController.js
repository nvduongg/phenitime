const { PrismaClient } = require('@prisma/client');
const {
    getSchedulingConfig,
    updateSchedulingConfig,
} = require('../services/system-config.service');

const prisma = new PrismaClient();

exports.getSchedulingSettings = async (_req, res) => {
    try {
        const config = await getSchedulingConfig(prisma);
        res.status(200).json({ status: 'success', data: config });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateSchedulingSettings = async (req, res) => {
    try {
        const {
            default_lt_capacity,
            default_th_capacity,
            shift_duration,
            allowed_start_periods,
            allowed_days,
            evening_start_periods,
        } = req.body;

        const config = await updateSchedulingConfig(prisma, {
            default_lt_capacity,
            default_th_capacity,
            shift_duration,
            allowed_start_periods,
            allowed_days,
            evening_start_periods,
        });

        res.status(200).json({
            status: 'success',
            message: 'Đã cập nhật cấu hình hệ thống',
            data: config,
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
