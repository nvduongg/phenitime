const { PrismaClient } = require('@prisma/client');
const { schedulerQueue, JOB_NAME } = require('../queues/schedulerQueue');
const { buildSolverConfig, getSchedulingConfig } = require('../services/system-config.service');

const prisma = new PrismaClient();

exports.getAllTimetables = async (req, res) => {
    try {
        const timetables = await prisma.timetable.findMany({
            include: {
                section: {
                    include: {
                        course: { include: { unit: true } },
                        lecturer: true,
                        student_groups: {
                            include: { curriculum: true },
                        },
                    },
                },
                room: true,
            },
        });
        res.status(200).json({ status: 'success', data: timetables });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createTimetable = async (req, res) => {
    try {
        const { section_id, room_id, day_of_week, start_period, period_count, start_date, end_date } = req.body;
        const newTimetable = await prisma.timetable.create({
            data: { 
                section_id, room_id, day_of_week, start_period, period_count,
                start_date: new Date(start_date),
                end_date: new Date(end_date)
            },
            include: {
                section: {
                    include: {
                        course: { include: { unit: true } },
                        lecturer: true,
                        student_groups: {
                            include: { curriculum: true },
                        },
                    },
                },
                room: true,
            },
        });
        res.status(201).json({ status: 'success', data: newTimetable });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateTimetable = async (req, res) => {
    try {
        const { section_id, room_id, day_of_week, start_period, period_count, start_date, end_date } = req.body;
        const data = {};
        if (section_id !== undefined) data.section_id = section_id;
        if (room_id !== undefined) data.room_id = room_id;
        if (day_of_week !== undefined) data.day_of_week = day_of_week;
        if (start_period !== undefined) data.start_period = start_period;
        if (period_count !== undefined) data.period_count = period_count;
        if (start_date !== undefined) data.start_date = new Date(start_date);
        if (end_date !== undefined) data.end_date = new Date(end_date);

        const updatedTimetable = await prisma.timetable.update({
            where: { schedule_id: parseInt(req.params.id) },
            data
        });
        res.status(200).json({ status: 'success', data: updatedTimetable });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.deleteTimetable = async (req, res) => {
    try {
        await prisma.timetable.delete({ where: { schedule_id: parseInt(req.params.id) } });
        res.status(200).json({ status: 'success', message: 'Xóa thành công' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.triggerAiScheduler = async (req, res) => {
    try {
        const { semester_id, config: requestConfig = {}, cohort_ids = [], wave_id = null } = req.body;

        if (!semester_id) {
            return res.status(400).json({
                status: 'error',
                message: 'semester_id is required',
            });
        }

        const dbConfig = await getSchedulingConfig(prisma);
        const config = buildSolverConfig(dbConfig, requestConfig);
        const normalizedCohortIds = Array.isArray(cohort_ids)
            ? [...new Set(cohort_ids.map((id) => String(id).trim()).filter(Boolean))]
            : [];

        const job = await schedulerQueue.add(
            JOB_NAME,
            { semester_id, config, cohort_ids: normalizedCohortIds, wave_id: wave_id || null },
            {
                removeOnComplete: 100,
                removeOnFail: 50,
            },
        );

        res.status(202).json({
            status: 'processing',
            jobId: job.id,
            message: 'AI scheduler job queued',
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getSchedulerJobStatus = async (req, res) => {
    try {
        const job = await schedulerQueue.getJob(req.params.jobId);

        if (!job) {
            return res.status(404).json({
                status: 'error',
                message: 'Job not found',
            });
        }

        const state = await job.getState();
        const response = {
            status: 'success',
            jobId: job.id,
            state,
        };

        if (state === 'completed') {
            response.result = job.returnvalue;
        }

        if (state === 'failed') {
            response.error = job.failedReason || 'AI scheduler job failed';
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};