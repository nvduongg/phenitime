const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. Lấy toàn bộ đơn vị tổ chức (kèm theo các đơn vị con)
exports.getAllUnits = async (req, res) => {
    try {
        const units = await prisma.organizationUnit.findMany({
            orderBy: [
                { unit_type: 'asc' },
                { unit_name: 'asc' }
            ],
            include: {
                children: true // Lấy luôn danh sách các đơn vị trực thuộc
            }
        });
        res.status(200).json({ status: 'success', data: units });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 2. Lấy chi tiết một đơn vị tổ chức
exports.getUnitById = async (req, res) => {
    try {
        const { id } = req.params;
        const unit = await prisma.organizationUnit.findUnique({
            where: { unit_id: id },
            include: {
                children: true,
                parent: true // Xem đơn vị này thuộc quản lý của ai
            }
        });
        
        if (!unit) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy đơn vị tổ chức này' });
        }
        res.status(200).json({ status: 'success', data: unit });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 3. Thêm mới một đơn vị tổ chức
exports.createUnit = async (req, res) => {
    try {
        const { unit_id, unit_name, unit_type, parent_id } = req.body;
        
        const newUnit = await prisma.organizationUnit.create({
            data: {
                unit_id,
                unit_name,
                unit_type,
                parent_id: parent_id || null
            }
        });
        
        res.status(201).json({ status: 'success', data: newUnit });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ status: 'fail', message: 'Mã đơn vị đã tồn tại trên hệ thống' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 4. Cập nhật thông tin đơn vị
exports.updateUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const { unit_name, unit_type, parent_id } = req.body;

        const updatedUnit = await prisma.organizationUnit.update({
            where: { unit_id: id },
            data: {
                unit_name,
                unit_type,
                parent_id: parent_id || null
            }
        });

        res.status(200).json({ status: 'success', data: updatedUnit });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy đơn vị để cập nhật' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 5. Xóa một đơn vị tổ chức
exports.deleteUnit = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.organizationUnit.delete({
            where: { unit_id: id }
        });
        
        res.status(200).json({ status: 'success', message: 'Xóa đơn vị thành công' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy đơn vị để xóa' });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};