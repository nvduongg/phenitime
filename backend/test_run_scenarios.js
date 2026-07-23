const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { buildSolvePayload } = require('./src/services/scheduler.service');
const { persistTimetables } = require('./src/queues/schedulerQueue');
const { resolvePhaseDateRange } = require('./src/utils/scheduleRhythm');

const prisma = new PrismaClient();
const AI_CORE_URL = process.env.AI_CORE_URL || 'http://core:8000';

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

async function saveResultsToDb(semesterId, timetableRows, events, scopedSectionIds, waveStartWeek) {
    const semester = await prisma.semester.findUnique({
        where: { semester_id: semesterId },
        select: { start_date: true, end_date: true },
    });

    const eventMetaLookup = buildEventMetaLookup(events);

    await prisma.$transaction(async (tx) => {
        await tx.timetable.deleteMany({
            where: { section_id: { in: scopedSectionIds } },
        });

        if (timetableRows.length > 0) {
            await tx.timetable.createMany({
                data: timetableRows.map((row) => {
                    const meta = row.event_id ? eventMetaLookup.get(row.event_id) : null;
                    const weekFrom = row.week_from ?? meta?.week_from ?? waveStartWeek;
                    const weekTo = row.week_to ?? meta?.week_to ?? (weekFrom + 9);
                    const phaseDates = resolvePhaseDateRange(semester, weekFrom, weekTo);

                    return {
                        section_id: row.section_id,
                        room_id: row.room_id,
                        day_of_week: row.day_of_week,
                        start_period: row.start_period,
                        period_count: row.period_count,
                        start_date: phaseDates?.startDate || semester.start_date,
                        end_date: phaseDates?.endDate || semester.end_date,
                    };
                }),
            });
        }
    });
}

async function checkConflicts(semesterId) {
    const timetables = await prisma.timetable.findMany({
        where: { section: { semester_id: semesterId } },
        include: {
            section: {
                include: {
                    student_groups: true,
                },
            },
        },
    });

    let roomConflicts = 0;
    let lecturerConflicts = 0;
    let studentGroupConflicts = 0;
    let abnormalTimeConflicts = 0;

    for (let i = 0; i < timetables.length; i++) {
        for (let j = i + 1; j < timetables.length; j++) {
            const t1 = timetables[i];
            const t2 = timetables[j];

            // Check day and period overlap
            const t1Start = t1.start_period;
            const t1End = t1.start_period + t1.period_count - 1;
            const t2Start = t2.start_period;
            const t2End = t2.start_period + t2.period_count - 1;

            const timeOverlap = t1.day_of_week === t2.day_of_week && (t1Start <= t2End && t2Start <= t1End);
            const dateOverlap = t1.start_date <= t2.end_date && t2.start_date <= t1.end_date;

            if (timeOverlap && dateOverlap) {
                // Room conflict
                if (t1.room_id && t2.room_id && t1.room_id === t2.room_id) {
                    roomConflicts++;
                }
                // Lecturer conflict
                if (t1.section.lecturer_id && t2.section.lecturer_id && t1.section.lecturer_id === t2.section.lecturer_id) {
                    lecturerConflicts++;
                }
                // Student group conflict
                const g1 = t1.section.student_groups.map(g => g.group_id);
                const g2 = t2.section.student_groups.map(g => g.group_id);
                const commonGroups = g1.filter(g => g2.includes(g));
                if (commonGroups.length > 0) {
                    studentGroupConflicts++;
                }
            }
        }

        // Abnormal time check
        const item = timetables[i];
        if (item.day_of_week < 2 || item.day_of_week > 7 || item.start_period < 1 || item.start_period > 15 || item.start_date > item.end_date) {
            abnormalTimeConflicts++;
        }
    }

    return {
        totalTimetables: timetables.length,
        roomConflicts,
        lecturerConflicts,
        studentGroupConflicts,
        abnormalTimeConflicts,
    };
}

async function run() {
    const semesterId = '2025_2026_3';

    console.log('=============== 1. CHẠY KỊCH BẢN TOÀN HỌC KỲ ===============');
    const payloadFull = await buildSolvePayload(prisma, semesterId, {}, {});
    console.log(`Full payload: ${payloadFull.events.length} sự kiện, ${payloadFull.scoped_section_ids.length} LHP, occupancy: ${payloadFull.config.existing_occupancy.length}`);
    const t0 = Date.now();
    const resFull = await axios.post(`${AI_CORE_URL}/api/v1/solve`, payloadFull);
    const t1 = Date.now();
    console.log('Kết quả Toàn học kỳ:', {
        total_events: resFull.data.total_events,
        total_scheduled: resFull.data.total_scheduled,
        total_unscheduled: resFull.data.total_unscheduled,
        phase1: resFull.data.phase1_scheduled,
        phase2: resFull.data.phase2_scheduled,
        phase3: resFull.data.phase3_scheduled,
        phase3_relocated: resFull.data.phase3_relocated,
        rate: ((resFull.data.total_scheduled / resFull.data.total_events) * 100).toFixed(2) + '%',
        time_sec: ((t1 - t0) / 1000).toFixed(2),
    });

    console.log('\n=============== 2. CHẠY TUẦN TỰ 3 ĐỢT (WAVE 1 -> 2 -> 3) ===============');
    // Clear timetables for semester first to test sequential waves clean run
    await prisma.timetable.deleteMany({
        where: { section: { semester_id: semesterId } },
    });

    // Wave 1
    console.log('\n--- CHẠY ĐỢT 1 ---');
    const payloadW1 = await buildSolvePayload(prisma, semesterId, {}, { wave_id: '2025_2026_3_1' });
    console.log(`W1 payload: ${payloadW1.events.length} sự kiện, ${payloadW1.scoped_section_ids.length} LHP, occupancy: ${payloadW1.config.existing_occupancy.length}`);
    const tw1_0 = Date.now();
    const resW1 = await axios.post(`${AI_CORE_URL}/api/v1/solve`, payloadW1);
    const tw1_1 = Date.now();
    console.log('Kết quả Đợt 1:', {
        total_events: resW1.data.total_events,
        total_scheduled: resW1.data.total_scheduled,
        total_unscheduled: resW1.data.total_unscheduled,
        phase1: resW1.data.phase1_scheduled,
        phase2: resW1.data.phase2_scheduled,
        phase3: resW1.data.phase3_scheduled,
        phase3_relocated: resW1.data.phase3_relocated,
        rate: ((resW1.data.total_scheduled / resW1.data.total_events) * 100).toFixed(2) + '%',
        time_sec: ((tw1_1 - tw1_0) / 1000).toFixed(2),
    });
    await saveResultsToDb(semesterId, resW1.data.timetable, payloadW1.events, payloadW1.scoped_section_ids, payloadW1.wave_start_week);

    // Wave 2
    console.log('\n--- CHẠY ĐỢT 2 ---');
    const payloadW2 = await buildSolvePayload(prisma, semesterId, {}, { wave_id: '2025_2026_3_2' });
    console.log(`W2 payload: ${payloadW2.events.length} sự kiện, ${payloadW2.scoped_section_ids.length} LHP, occupancy: ${payloadW2.config.existing_occupancy.length}`);
    const tw2_0 = Date.now();
    const resW2 = await axios.post(`${AI_CORE_URL}/api/v1/solve`, payloadW2);
    const tw2_1 = Date.now();
    console.log('Kết quả Đợt 2:', {
        total_events: resW2.data.total_events,
        total_scheduled: resW2.data.total_scheduled,
        total_unscheduled: resW2.data.total_unscheduled,
        phase1: resW2.data.phase1_scheduled,
        phase2: resW2.data.phase2_scheduled,
        phase3: resW2.data.phase3_scheduled,
        phase3_relocated: resW2.data.phase3_relocated,
        rate: ((resW2.data.total_scheduled / resW2.data.total_events) * 100).toFixed(2) + '%',
        time_sec: ((tw2_1 - tw2_0) / 1000).toFixed(2),
    });
    await saveResultsToDb(semesterId, resW2.data.timetable, payloadW2.events, payloadW2.scoped_section_ids, payloadW2.wave_start_week);

    // Wave 3
    console.log('\n--- CHẠY ĐỢT 3 ---');
    const payloadW3 = await buildSolvePayload(prisma, semesterId, {}, { wave_id: '2025_2026_3_3' });
    console.log(`W3 payload: ${payloadW3.events.length} sự kiện, ${payloadW3.scoped_section_ids.length} LHP, occupancy: ${payloadW3.config.existing_occupancy.length}`);
    const tw3_0 = Date.now();
    const resW3 = await axios.post(`${AI_CORE_URL}/api/v1/solve`, payloadW3);
    const tw3_1 = Date.now();
    console.log('Kết quả Đợt 3:', {
        total_events: resW3.data.total_events,
        total_scheduled: resW3.data.total_scheduled,
        total_unscheduled: resW3.data.total_unscheduled,
        phase1: resW3.data.phase1_scheduled,
        phase2: resW3.data.phase2_scheduled,
        phase3: resW3.data.phase3_scheduled,
        phase3_relocated: resW3.data.phase3_relocated,
        rate: ((resW3.data.total_scheduled / resW3.data.total_events) * 100).toFixed(2) + '%',
        time_sec: ((tw3_1 - tw3_0) / 1000).toFixed(2),
    });
    await saveResultsToDb(semesterId, resW3.data.timetable, payloadW3.events, payloadW3.scoped_section_ids, payloadW3.wave_start_week);

    console.log('\n=============== 3. THỐNG KÊ TỔNG THỂ CSDL VÀ KIỂM TRA XUNG ĐỘT ===============');
    const conflictStats = await checkConflicts(semesterId);
    console.log('Thống kê CSDL & Xung đột:', conflictStats);

    // Breakdown persisted records by Cohort, Room Type, Day of Week, Start Period
    const persistedTimetables = await prisma.timetable.findMany({
        where: { section: { semester_id: semesterId } },
        include: {
            section: {
                include: {
                    student_groups: { include: { curriculum: true } },
                },
            },
            room: true,
        },
    });

    const cohortCounts = {};
    const roomTypeCounts = {};
    const dayCounts = {};
    const periodCounts = {};

    persistedTimetables.forEach((t) => {
        // Cohorts
        const cohorts = new Set();
        t.section.student_groups.forEach((g) => {
            if (g.curriculum?.cohort_id) cohorts.add(g.curriculum.cohort_id);
        });
        cohorts.forEach((c) => {
            cohortCounts[c] = (cohortCounts[c] || 0) + 1;
        });

        // Room Type
        const rt = t.room?.room_type || 'NONE';
        roomTypeCounts[rt] = (roomTypeCounts[rt] || 0) + 1;

        // Day
        const d = t.day_of_week;
        dayCounts[d] = (dayCounts[d] || 0) + 1;

        // Period
        const p = t.start_period;
        periodCounts[p] = (periodCounts[p] || 0) + 1;
    });

    console.log('Phân bố niên khóa:', cohortCounts);
    console.log('Phân bố loại phòng:', roomTypeCounts);
    console.log('Phân bố thứ trong tuần:', dayCounts);
    console.log('Phân bố tiết bắt đầu:', periodCounts);
}

run().catch(console.error).finally(() => prisma.$disconnect());
