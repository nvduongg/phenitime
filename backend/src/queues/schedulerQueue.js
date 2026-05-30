const { Queue, Worker } = require('bullmq');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const { getAiCoreApiUrl } = require('../config/aiCore');
const { buildSolvePayload } = require('../services/scheduler.service');
const { resolvePhaseDateRange } = require('../utils/scheduleRhythm');

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);

/** Queue: giữ retry mặc định. */
const queueRedisConnection = {
    host: redisHost,
    port: redisPort,
};

/**
 * Worker + job dài: bắt buộc maxRetriesPerRequest: null (theo BullMQ / ioredis).
 * Nếu không, gia hạn lock Redis hay fail khi solver chạy 10–30+ phút.
 */
const workerRedisConnection = {
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
};

const QUEUE_NAME = 'ai-scheduler';
const JOB_NAME = 'run-ai-scheduler';
const DEFAULT_START_DATE = new Date('2026-04-06');
const DEFAULT_END_DATE = new Date('2026-05-10');
/**
 * MILP ~400+ event có thể >10 phút. Axios mặc định 600s đã gây "timeout of 600000ms exceeded".
 * SOLVER_HTTP_TIMEOUT_MS=0 → không giới hạn (khuyến nghị local).
 */
const SOLVER_HTTP_TIMEOUT_MS = Number(process.env.SOLVER_HTTP_TIMEOUT_MS ?? 0);
const SOLVER_LOCK_DURATION_MS = Number(process.env.SOLVER_LOCK_DURATION_MS) || 3_600_000;
const SOLVER_LOCK_RENEW_MS = Number(process.env.SOLVER_LOCK_RENEW_MS) || 15_000;

const schedulerQueue = new Queue(QUEUE_NAME, {
    connection: queueRedisConnection,
});

function startLockHeartbeat(job) {
    const timer = setInterval(async () => {
        try {
            if (!job?.token) return;
            await job.extendLock(job.token, SOLVER_LOCK_DURATION_MS);
        } catch (error) {
            console.warn(
                `[schedulerQueue] Gia hạn lock job ${job?.id} (thử lại sau ${SOLVER_LOCK_RENEW_MS}ms):`,
                error.message,
            );
        }
    }, SOLVER_LOCK_RENEW_MS);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    return timer;
}

function buildEventMetaLookup(events = []) {
    const lookup = new Map();
    events.forEach((event) => {
        lookup.set(event.event_id, {
            week_from: event.week_from,
            week_to: event.week_to,
        });
    });
    return lookup;
}

async function persistTimetables(semesterId, rows, eventMetaLookup = new Map()) {
    const semester = await prisma.semester.findUnique({
        where: { semester_id: semesterId },
        select: { start_date: true, end_date: true },
    });

    return prisma.$transaction(async (tx) => {
        const deleted = await tx.timetable.deleteMany({
            where: {
                section: {
                    semester_id: semesterId,
                },
            },
        });

        let createdCount = 0;
        if (rows.length > 0) {
            const created = await tx.timetable.createMany({
                data: rows.map((row) => {
                    const meta = row.event_id
                        ? eventMetaLookup.get(row.event_id)
                        : null;
                    const weekFrom = row.week_from ?? meta?.week_from;
                    const weekTo = row.week_to ?? meta?.week_to;
                    const hasPhase = weekFrom && weekTo;
                    const phaseDates = hasPhase
                        ? resolvePhaseDateRange(semester, weekFrom, weekTo)
                        : null;

                    return {
                        section_id: row.section_id,
                        room_id: row.room_id,
                        day_of_week: row.day_of_week,
                        start_period: row.start_period,
                        period_count: row.period_count,
                        start_date: phaseDates?.start_date
                            || semester?.start_date
                            || DEFAULT_START_DATE,
                        end_date: phaseDates?.end_date
                            || semester?.end_date
                            || DEFAULT_END_DATE,
                    };
                }),
            });
            createdCount = created.count;
        }

        return {
            deletedCount: deleted.count,
            createdCount,
        };
    });
}

const schedulerWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
        const lockHeartbeat = startLockHeartbeat(job);

        try {
            const { semester_id: semesterId, config = {} } = job.data;

            const solvePayload = await buildSolvePayload(prisma, semesterId, config);
            console.log(
                `[schedulerQueue] Solver payload: ${solvePayload.rooms.length} rooms, `
                + `${solvePayload.events?.length || 0} events, semester=${semesterId}`,
            );

            const eventCount = solvePayload.events?.length || 0;
            const timeoutLabel = SOLVER_HTTP_TIMEOUT_MS > 0
                ? `${Math.round(SOLVER_HTTP_TIMEOUT_MS / 60_000)} phút`
                : 'không giới hạn';
            console.log(
                `[schedulerQueue] Gọi solver (${eventCount} events, timeout ${timeoutLabel})...`,
            );
            const solveStartedAt = Date.now();

            const response = await axios.post(
                getAiCoreApiUrl('/solve'),
                solvePayload,
                { timeout: SOLVER_HTTP_TIMEOUT_MS > 0 ? SOLVER_HTTP_TIMEOUT_MS : 0 },
            );

            console.log(
                `[schedulerQueue] Solver hoàn tất sau ${Math.round((Date.now() - solveStartedAt) / 1000)}s`,
            );

            const payload = response.data;

            if (payload.status === 'fail') {
                throw new Error(payload.message || 'AI solver returned failure');
            }

            const timetableRows = payload.data || payload.timetable || [];
            const unscheduledClasses = payload.unscheduled_classes || [];
            const eventMetaLookup = buildEventMetaLookup(solvePayload.events || []);
            const { deletedCount, createdCount } = await persistTimetables(
                semesterId,
                timetableRows,
                eventMetaLookup,
            );

            const unscheduledCount = unscheduledClasses.length;
            const baseMessage = `Đã xóa ${deletedCount} lịch cũ, lưu ${createdCount} lịch mới cho học kỳ ${semesterId}.`;
            const message =
                unscheduledCount > 0
                    ? `${baseMessage} ${unscheduledCount} buổi không thể xếp tự động.`
                    : baseMessage;

            return {
                status: 'success',
                message,
                total_events: payload.total_scheduled || timetableRows.length,
                total_scheduled: payload.total_scheduled || timetableRows.length,
                total_unscheduled: unscheduledCount,
                unscheduled_classes: unscheduledClasses,
                timetable_snapshot: timetableRows,
                phase1_scheduled: payload.phase1_scheduled ?? null,
                phase2_scheduled: payload.phase2_scheduled ?? null,
                phase3_scheduled: payload.phase3_scheduled ?? null,
                phase3_relocated: payload.phase3_relocated ?? null,
                deleted_count: deletedCount,
                created_count: createdCount,
                semester_id: semesterId,
            };
        } finally {
            clearInterval(lockHeartbeat);
        }
    },
    {
        connection: workerRedisConnection,
        concurrency: 1,
        lockDuration: SOLVER_LOCK_DURATION_MS,
        lockRenewTime: SOLVER_LOCK_RENEW_MS,
        stalledInterval: 120_000,
        maxStalledCount: 3,
    },
);

schedulerWorker.on('error', (error) => {
    console.error('[schedulerQueue] Worker error:', error.message);
});

schedulerWorker.on('completed', (job) => {
    console.log(`[schedulerQueue] Job ${job.id} completed`);
});

schedulerWorker.on('failed', (job, error) => {
    console.error(`[schedulerQueue] Job ${job?.id} failed:`, error.message);
});

module.exports = {
    schedulerQueue,
    schedulerWorker,
    JOB_NAME,
};
