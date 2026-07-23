const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Get student groups for the 3 failing sections
    const failingSections = [
        'Mạng máy tính-2-3-25(COUR01.TH3)',
        'Mạng máy tính-2-3-25(COUR02.TH3)',
        'Khoa học dữ liệu và trí tuệ nhân tạo-2-3-25(N03)',
    ];

    for (const sectionId of failingSections) {
        const section = await prisma.courseSection.findUnique({
            where: { section_id: sectionId },
            include: {
                student_groups: true,
            },
        });

        if (!section) {
            console.log(`Section not found: ${sectionId}`);
            continue;
        }

        console.log(`\n=== ${sectionId} ===`);
        console.log(`Lecturer: ${section.lecturer_id}, Capacity: ${section.capacity}, Type: ${section.class_type}`);
        console.log(`Student groups (${section.student_groups.length}):`);
        section.student_groups.forEach(sg => {
            console.log(`  - ${sg.group_id}: ${sg.group_name} (headcount: ${sg.student_count ?? sg.headcount ?? '?'})`);
        });

        // 2. Check timetable for lecturer - see their current booked slots
        if (section.lecturer_id) {
            const lecturerSections = await prisma.courseSection.findMany({
                where: { lecturer_id: section.lecturer_id, semester_id: '2025_2026_3' },
                include: { timetables: true },
            });
            
            console.log(`\nLecturer ${section.lecturer_id} schedule:`);
            const busySlots = [];
            for (const ls of lecturerSections) {
                for (const t of ls.timetables) {
                    console.log(`  ${ls.section_id}: Day ${t.day_of_week}, Period ${t.start_period} (${t.room_id})`);
                    busySlots.push({ day: t.day_of_week, period: t.start_period });
                }
            }
            
            // Show free slots
            const allDays = [2,3,4,5,6,7];
            const allPeriods = [1,4,7,10];
            console.log(`\nFree slots for ${section.lecturer_id}:`);
            for (const d of allDays) {
                for (const p of allPeriods) {
                    const busy = busySlots.some(s => s.day === d && s.period === p);
                    if (!busy) console.log(`  Day ${d}, Period ${p}: FREE`);
                }
            }
        }

        // 3. Check PM room occupancy for each free slot of the lecturer
        console.log('\nPM room availability summary:');
        const pmRooms = await prisma.room.findMany({
            where: { room_type: { in: ['PM', 'PC', 'TH', 'LAB'] } },
            include: { timetables: true },
        });
        for (const room of pmRooms) {
            const freeSlots = [];
            const allDays = [2,3,4,5,6,7];
            const allPeriods = [1,4,7,10];
            for (const d of allDays) {
                for (const p of allPeriods) {
                    const busy = room.timetables.some(t => t.day_of_week === d && t.start_period === p);
                    if (!busy) freeSlots.push(`D${d}P${p}`);
                }
            }
            console.log(`  ${room.room_id} (cap=${room.capacity}): ${freeSlots.length} free: ${freeSlots.slice(0,6).join(', ')}...`);
        }
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
