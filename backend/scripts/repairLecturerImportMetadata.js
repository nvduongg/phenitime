const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { parseLecturerImportTsvFromPath } = require('../src/utils/lecturerImportRows');

const prisma = new PrismaClient();

async function syncSpecialties(tx, lecturerId, courseIds = []) {
    await tx.lecturerCourseSpecialty.deleteMany({
        where: { lecturer_id: lecturerId },
    });

    if (!courseIds.length) return;

    await tx.lecturerCourseSpecialty.createMany({
        data: courseIds.map((course_id) => ({
            lecturer_id: lecturerId,
            course_id,
        })),
        skipDuplicates: true,
    });
}

async function main() {
    const sourcePath = path.resolve(__dirname, '../data/lecturers-import.tsv');
    const rows = parseLecturerImportTsvFromPath(sourcePath);
    if (!rows.length) {
        throw new Error(`No rows parsed from ${sourcePath}`);
    }

    let updated = 0;
    let missing = 0;

    await prisma.$transaction(async (tx) => {
        for (const row of rows) {
            try {
                await tx.lecturer.update({
                    where: { lecturer_id: row.lecturer_id },
                    data: {
                        lecturer_name: row.lecturer_name,
                        unit_id: row.unit_id,
                        max_quota: row.max_quota,
                    },
                });
                await syncSpecialties(tx, row.lecturer_id, row.course_ids);
                updated += 1;
            } catch {
                missing += 1;
            }
        }
    });

    console.log(`Updated ${updated} lecturers, ${missing} not found in database.`);
    await prisma.$disconnect();
}

main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
