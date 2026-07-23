const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

const AI_CORE_URL = process.env.AI_CORE_URL || 'http://core:8000';

async function testLecturerAssignment() {
    const semesterId = '2025_2026_3_1';

    const unassignedSections = await prisma.courseSection.findMany({
        where: {
            semester_id: semesterId,
            lecturer_id: null,
        },
        include: { course: true },
    });

    const assignedSections = await prisma.courseSection.findMany({
        where: {
            semester_id: semesterId,
            lecturer_id: { not: null },
        },
        include: { course: true },
    });

    const lecturers = await prisma.lecturer.findMany({
        include: { specialties: true },
    });

    console.log(`Tìm thấy: ${unassignedSections.length} LHP chưa phân công, ${assignedSections.length} LHP đã phân công, ${lecturers.length} GV.`);

    const loadByLecturer = {};
    assignedSections.forEach((section) => {
        const lid = section.lecturer_id;
        const w = (section.course?.theory_credits || 0) + (section.course?.practice_credits || 0) || 1;
        loadByLecturer[lid] = (loadByLecturer[lid] || 0) + w;
    });

    const aiPayload = {
        sections: unassignedSections.map((section) => ({
            section_id: section.section_id,
            course_id: section.course_id,
            weight: (section.course?.theory_credits || 0) + (section.course?.practice_credits || 0) || 1,
        })),
        lecturers: lecturers.map((lecturer) => ({
            lecturer_id: lecturer.lecturer_id,
            max_quota: lecturer.max_quota,
            current_load: loadByLecturer[lecturer.lecturer_id] || 0,
            course_ids: lecturer.specialties.map((item) => item.course_id),
        })),
    };

    console.log(`Mẫu GV max_quota:`, lecturers.slice(0, 5).map(l => ({ id: l.lecturer_id, max_quota: l.max_quota, load: loadByLecturer[l.lecturer_id] || 0 })));

    if (unassignedSections.length === 0) {
        console.log('Tất cả các lớp đã được phân công GV trong CSDL!');
        return;
    }

    try {
        const res = await axios.post(`${AI_CORE_URL}/api/v1/assign-lecturers`, aiPayload);
        console.log('Kết quả Thuật toán Phân công Giảng viên:', res.data);
    } catch (err) {
        console.error('Lỗi khi gọi phân công GV:', err.response?.data || err.message);
    }
}

testLecturerAssignment().catch(console.error).finally(() => prisma.$disconnect());
