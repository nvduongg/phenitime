const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function datesOverlap(start1, end1, start2, end2) {
    if (!start1 || !end1 || !start2 || !end2) return true;
    const dStart1 = new Date(start1);
    const dEnd1 = new Date(end1);
    const dStart2 = new Date(start2);
    const dEnd2 = new Date(end2);
    return dStart1 <= dEnd2 && dStart2 <= dEnd1;
}

function periodsOverlap(start1, count1, start2, count2) {
    const end1 = start1 + count1 - 1;
    const end2 = start2 + count2 - 1;
    return start1 <= end2 && start2 <= end1;
}

async function debugConflicts() {
    const timetables = await prisma.timetable.findMany({
        include: {
            section: {
                include: {
                    lecturer: true,
                    student_groups: true,
                },
            },
            room: true,
        },
    });

    let sameWaveConflicts = 0;
    let crossWaveConflicts = 0;

    const conflicts = [];
    for (let i = 0; i < timetables.length; i++) {
        for (let j = i + 1; j < timetables.length; j++) {
            const t1 = timetables[i];
            const t2 = timetables[j];

            const lec1 = t1.section?.lecturer_id;
            const lec2 = t2.section?.lecturer_id;

            if (lec1 && lec2 && lec1 === lec2) {
                if (
                    t1.day_of_week === t2.day_of_week &&
                    periodsOverlap(t1.start_period, t1.period_count, t2.start_period, t2.period_count) &&
                    datesOverlap(t1.start_date, t1.end_date, t2.start_date, t2.end_date)
                ) {
                    const cohorts1 = (t1.section?.student_groups || []).map(g => g.cohort).join(',');
                    const cohorts2 = (t2.section?.student_groups || []).map(g => g.cohort).join(',');
                    const isSameWave = cohorts1 === cohorts2;

                    if (isSameWave) sameWaveConflicts++;
                    else crossWaveConflicts++;

                    conflicts.push({
                        isSameWave,
                        cohorts1,
                        cohorts2,
                        lecturer_id: lec1,
                        lecturer_name: t1.section?.lecturer?.lecturer_name,
                        t1_section: t1.section_id,
                        t1_dates: `${t1.start_date?.toISOString().slice(0,10)} -> ${t1.end_date?.toISOString().slice(0,10)}`,
                        t1_day_period: `T${t1.day_of_week} Tiết ${t1.start_period}`,
                        t2_section: t2.section_id,
                        t2_dates: `${t2.start_date?.toISOString().slice(0,10)} -> ${t2.end_date?.toISOString().slice(0,10)}`,
                        t2_day_period: `T${t2.day_of_week} Tiết ${t2.start_period}`,
                    });
                }
            }
        }
    }

    console.log(`Tổng xung đột GV: ${conflicts.length} (Cùng đợt: ${sameWaveConflicts}, Khác đợt/Liên đợt: ${crossWaveConflicts})`);
    conflicts.forEach((c, idx) => {
        console.log(`\n[${idx + 1}] [${c.isSameWave ? 'CÙNG ĐỢT' : 'LIÊN ĐỢT'}] GV ${c.lecturer_id} (${c.lecturer_name}):`);
        console.log(`    Lớp 1 (${c.cohorts1}): ${c.t1_section} | ${c.t1_day_period} | ${c.t1_dates}`);
        console.log(`    Lớp 2 (${c.cohorts2}): ${c.t2_section} | ${c.t2_day_period} | ${c.t2_dates}`);
    });
}

debugConflicts().catch(console.error).finally(() => prisma.$disconnect());
