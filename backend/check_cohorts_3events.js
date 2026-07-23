const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCohorts() {
    const sectionIds = [
        'Hệ điều hành-2-3-25(N03)',
        'Lý thuyết xác suất thống kê-2-3-25(N04)',
        'Thiết kế web nâng cao-2-3-25(COUR02.TH3)',
    ];

    const sections = await prisma.courseSection.findMany({
        where: { section_id: { in: sectionIds } },
        include: {
            student_groups: {
                include: { curriculum: true },
            },
        },
    });

    sections.forEach((s) => {
        console.log(`Lớp: ${s.section_id}`);
        s.student_groups.forEach((g) => {
            console.log(`    Nhóm SV: ${g.group_id} | Khoá (cohort_id): ${g.curriculum?.cohort_id}`);
        });
    });
}

checkCohorts().catch(console.error).finally(() => prisma.$disconnect());
