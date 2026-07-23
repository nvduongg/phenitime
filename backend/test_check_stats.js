const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConflictsAndStats(semesterId) {
    const timetables = await prisma.timetable.findMany({
        where: { section: { semester_id: semesterId } },
        include: {
            section: {
                include: {
                    student_groups: {
                        include: { curriculum: true }
                    },
                },
            },
            room: true,
        },
    });

    let roomConflicts = 0;
    let lecturerConflicts = 0;
    let studentGroupConflicts = 0;
    let abnormalTimeConflicts = 0;

    for (let i = 0; i < timetables.length; i++) {
        const t1 = timetables[i];

        // Abnormal time check
        if (t1.day_of_week < 2 || t1.day_of_week > 7 || t1.start_period < 1 || t1.start_period > 15 || t1.start_date > t1.end_date) {
            abnormalTimeConflicts++;
        }

        for (let j = i + 1; j < timetables.length; j++) {
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
    }

    const cohortCounts = {};
    const roomTypeCounts = {};
    const dayCounts = {};
    const periodCounts = {};

    timetables.forEach((t) => {
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
        const d = `Thứ ${t.day_of_week}`;
        dayCounts[d] = (dayCounts[d] || 0) + 1;

        // Period
        const p = `Tiết ${t.start_period}`;
        periodCounts[p] = (periodCounts[p] || 0) + 1;
    });

    console.log('Tổng số bản ghi TKB:', timetables.length);
    console.log('Xung đột:', {
        roomConflicts,
        lecturerConflicts,
        studentGroupConflicts,
        abnormalTimeConflicts,
    });
    console.log('Phân bố niên khóa:', cohortCounts);
    console.log('Phân bố loại phòng:', roomTypeCounts);
    console.log('Phân bố thứ trong tuần:', dayCounts);
    console.log('Phân bố tiết bắt đầu:', periodCounts);
}

checkConflictsAndStats('2025_2026_3_1')
    .catch(console.error)
    .finally(() => prisma.$disconnect());
