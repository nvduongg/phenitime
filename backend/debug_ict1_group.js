const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Tìm toàn bộ các slot đã xếp của nhóm ICT1.24105.2
    const targetGroup = 'ICT1.24105.2';
    
    const sections = await prisma.courseSection.findMany({
        where: {
            student_groups: { some: { group_id: targetGroup } }
        },
        include: { timetables: true },
    });
    
    console.log(`=== Tất cả lớp có nhóm ${targetGroup} và lịch của họ ===\n`);
    
    const busySlots = new Set();
    for (const s of sections) {
        const hasSchedule = s.timetables.length > 0;
        if (hasSchedule) {
            for (const t of s.timetables) {
                busySlots.add(`D${t.day_of_week}P${t.start_period}`);
                console.log(`  [BUSY] ${s.section_id}: Day ${t.day_of_week}, Period ${t.start_period}`);
            }
        } else {
            console.log(`  [UNSCHEDULED] ${s.section_id}`);
        }
    }
    
    console.log(`\nTổng slot bận của nhóm ${targetGroup}: ${busySlots.size}`);
    
    const allSlots = [];
    for (const d of [2,3,4,5,6,7]) {
        for (const p of [1,4,7,10]) {
            allSlots.push(`D${d}P${p}`);
        }
    }
    
    const freeSlots = allSlots.filter(s => !busySlots.has(s));
    console.log(`Slots còn rảnh của nhóm ${targetGroup} (${freeSlots.length}): ${freeSlots.join(', ')}`);
    
    console.log('\n=== Kiểm tra xung đột HC6 (day-separation) ===');
    console.log('Môn Mạng máy tính (TH) cần 1 buổi/tuần riêng biệt ngày với các buổi COUR trong tuần:');
    const courSlots = sections
        .filter(s => s.section_id.includes('COUR') && s.timetables.length > 0)
        .flatMap(s => s.timetables.map(t => ({ section: s.section_id, day: t.day_of_week, period: t.start_period })));
    
    const courDays = [...new Set(courSlots.map(x => x.day))];
    console.log(`Các ngày đã có lớp Mạng máy tính COUR của nhóm này: ${courDays.map(d => `Thứ ${d}`).join(', ')}`);
    
    const freeSlotsForTH = freeSlots.filter(slot => {
        const day = parseInt(slot.replace('D','').split('P')[0]);
        return !courDays.includes(day);
    });
    console.log(`Slots rảnh không trùng ngày với COUR: ${freeSlotsForTH.join(', ')}`);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
