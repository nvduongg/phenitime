const { PrismaClient } = require('@prisma/client');
const { buildWaveId } = require('../utils/timetableOccupancy');
const { computeSemesterEndDate } = require('../utils/semesterDates');
const { getSchedulingConfig } = require('../services/system-config.service');

const prisma = new PrismaClient();

function normalizeWavePayload(semesterId, wave = {}, index = 0) {
    const waveOrder = Math.max(Number(wave.wave_order) || index + 1, 1);
    const cohortIds = Array.isArray(wave.cohort_ids)
        ? [...new Set(wave.cohort_ids.map((id) => String(id).trim().toUpperCase()).filter(Boolean))]
        : [];

    return {
        wave_id: wave.wave_id || buildWaveId(semesterId, waveOrder),
        semester_id: semesterId,
        wave_order: waveOrder,
        wave_name: wave.wave_name ? String(wave.wave_name).trim() : `Đợt ${waveOrder}`,
        start_week: Math.max(Number(wave.start_week) || 1, 1),
        cohort_ids: cohortIds,
    };
}

exports.getSemesterWaves = async (req, res) => {
    try {
        const { semesterId } = req.params;
        const waves = await prisma.semesterWave.findMany({
            where: { semester_id: semesterId },
            orderBy: { wave_order: 'asc' },
        });
        res.status(200).json({ status: 'success', data: waves });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.replaceSemesterWaves = async (req, res) => {
    try {
        const { semesterId } = req.params;
        const incoming = Array.isArray(req.body?.waves) ? req.body.waves : [];

        const semester = await prisma.semester.findUnique({
            where: { semester_id: semesterId },
            select: { semester_id: true, start_date: true },
        });
        if (!semester) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy học kỳ' });
        }

        const normalized = incoming
            .map((wave, index) => normalizeWavePayload(semesterId, wave, index))
            .sort((left, right) => left.wave_order - right.wave_order);

        const saved = await prisma.$transaction(async (tx) => {
            await tx.semesterWave.deleteMany({ where: { semester_id: semesterId } });
            if (!normalized.length) {
                return [];
            }
            await tx.semesterWave.createMany({ data: normalized });
            return tx.semesterWave.findMany({
                where: { semester_id: semesterId },
                orderBy: { wave_order: 'asc' },
            });
        });

        const config = await getSchedulingConfig(prisma);
        const latestWaveStartWeek = normalized.length
            ? Math.max(...normalized.map((wave) => wave.start_week))
            : 1;
        const autoEndDate = computeSemesterEndDate(semester.start_date, {
            teachingWeeks: config.max_teaching_weeks,
            latestWaveStartWeek,
        });

        if (autoEndDate) {
            await prisma.semester.update({
                where: { semester_id: semesterId },
                data: { end_date: autoEndDate },
            });
        }

        res.status(200).json({ status: 'success', data: saved });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
