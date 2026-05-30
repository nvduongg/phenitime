const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllRooms = async (req, res) => {
    try {
        const rooms = await prisma.room.findMany();
        res.status(200).json({ status: 'success', data: rooms });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createRoom = async (req, res) => {
    try {
        const { room_id, capacity, room_type } = req.body;
        const newRoom = await prisma.room.create({
            data: { room_id, capacity, room_type }
        });
        res.status(201).json({ status: 'success', data: newRoom });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ status: 'fail', message: 'Mã phòng đã tồn tại' });
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateRoom = async (req, res) => {
    try {
        const updatedRoom = await prisma.room.update({
            where: { room_id: req.params.id },
            data: req.body
        });
        res.status(200).json({ status: 'success', data: updatedRoom });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteRoom = async (req, res) => {
    try {
        await prisma.room.delete({ where: { room_id: req.params.id } });
        res.status(200).json({ status: 'success', message: 'Xóa thành công' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};