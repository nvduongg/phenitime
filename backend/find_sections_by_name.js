const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findSections() {
    const sections = await prisma.courseSection.findMany({
        where: { semester_id: '2025_2026_3' },
        select: {
            section_id: true,
            student_groups: {
                select: {
                    group_id: true,
                    curriculum: { select: { cohort_id: true } },
                },
            },
        },
    });

    console.log(`In tất cả các lớp trong 2025_2026_3:`);
    sections.forEach((s) => {
        const cohorts = s.student_groups.map((g) => g.curriculum?.cohort_id).join(',');
        console.log(`- ID: ${s.section_id} | Cohorts: ${cohorts}`);
    });
}

findSections().catch(console.error).finally(() => prisma.$disconnect());
