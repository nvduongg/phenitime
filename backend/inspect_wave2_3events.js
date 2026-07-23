const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildSolvePayload } = require('./src/services/scheduler.service');

async function inspectWave2() {
    const semesterId = '2025_2026_3';
    const payload = await buildSolvePayload(prisma, semesterId, {}, { wave_id: '2025_2026_3_2' });

    console.log(`Danh sách ${payload.events.length} sự kiện trong đợt 2:`);
    payload.events.forEach((ev, idx) => {
        console.log(`[${idx+1}] ID: ${ev.event_id} | Section: ${ev.section_id} | ClassType: ${ev.class_type} | RoomReq: ${ev.room_type_req} | Cap: ${ev.capacity} | Lec: ${ev.lecturer_id} | Groups: ${ev.student_groups.join(',')}`);
    });
}

inspectWave2().catch(console.error).finally(() => prisma.$disconnect());
