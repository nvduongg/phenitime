const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect3Events() {
    const sectionIds = [
        'Hệ điều hành-2-3-25(N03)',
        'Lý thuyết xác suất thống kê-2-3-25(N04)',
        'Thiết kế web nâng cao-2-3-25(COUR02.TH3)',
    ];

    const sections = await prisma.courseSection.findMany({
        where: { section_id: { in: sectionIds } },
        include: {
            course: true,
            lecturer: true,
            student_groups: { include: { curriculum: true } },
        },
    });

    console.log('Chi tiết 3 lớp chưa xếp:');
    sections.forEach((sec) => {
        console.log({
            section_id: sec.section_id,
            course_id: sec.course_id,
            course_name: sec.course?.course_name,
            teaching_type: sec.teaching_type,
            class_type: sec.class_type,
            room_type_req: sec.room_type_req,
            capacity: sec.capacity,
            lecturer_id: sec.lecturer_id,
            lecturer_name: sec.lecturer?.lecturer_name,
            student_groups: sec.student_groups.map((g) => ({ id: g.group_id, cohort: g.curriculum?.cohort_id })),
        });
    });
}

inspect3Events().catch(console.error).finally(() => prisma.$disconnect());
