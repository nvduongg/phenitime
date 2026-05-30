const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateMajorId } = require('../utils/majorIdGenerator');

exports.getAllMajors = async (req, res) => {
    try {
        const majors = await prisma.major.findMany({
            include: { unit: true },
            orderBy: [{ major_code: 'asc' }, { major_name: 'asc' }],
        });
        res.status(200).json({ status: 'success', data: majors });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createMajor = async (req, res) => {
    try {
        const { major_code, major_name, unit_id } = req.body;

        if (!major_code || !major_name || !unit_id) {
            return res.status(400).json({
                status: 'fail',
                message: 'Vui lòng nhập đủ mã ngành, tên ngành và khoa quản lý',
            });
        }

        const normalizedCode = String(major_code).trim();
        const normalizedName = String(major_name).trim();
        const existingMajors = await prisma.major.findMany({ select: { major_id: true } });
        const major_id = generateMajorId(
            normalizedCode,
            normalizedName,
            new Set(existingMajors.map((major) => major.major_id)),
        );

        const newMajor = await prisma.major.create({
            data: {
                major_id,
                major_code: normalizedCode,
                major_name: normalizedName,
                unit_id,
            },
            include: { unit: true },
        });
        res.status(201).json({ status: 'success', data: newMajor });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ status: 'fail', message: 'Mã nội bộ ngành đã tồn tại' });
        }
        if (error.code === 'P2003') {
            return res.status(400).json({ status: 'fail', message: 'Mã khoa quản lý chưa tồn tại trong hệ thống' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateMajor = async (req, res) => {
    try {
        const { id } = req.params;
        const { major_code, major_name, unit_id } = req.body;
        const updatedMajor = await prisma.major.update({
            where: { major_id: id },
            data: {
                major_code: major_code !== undefined ? String(major_code).trim() : undefined,
                major_name,
                unit_id,
            },
            include: { unit: true },
        });
        res.status(200).json({ status: 'success', data: updatedMajor });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy ngành đào tạo' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteMajor = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.major.delete({ where: { major_id: id } });
        res.status(200).json({ status: 'success', message: 'Xóa ngành đào tạo thành công' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy ngành đào tạo' });
        }
        if (error.code === 'P2003') {
            return res.status(400).json({
                status: 'fail',
                message: 'Không thể xóa ngành đang được sử dụng bởi chương trình đào tạo',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};
