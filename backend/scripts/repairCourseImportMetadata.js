const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { resolveCourseTemplateCode } = require('../src/utils/sectioningTemplates');
const { normalizeDeliveryChannelInput } = require('../src/utils/deliveryChannels');
const { parseCourseImportMatrixFromPath } = require('../src/utils/courseImportRows');

const prisma = new PrismaClient();

function normalizeClassType(value) {
    return normalizeDeliveryChannelInput(value);
}

function normalizeRoomType(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return 'LT';
    return raw.toUpperCase();
}

async function main() {
    const sourcePath = path.resolve(__dirname, '../data/courses-import.csv');
    const rows = parseCourseImportMatrixFromPath(sourcePath);
    if (!rows.length) {
        throw new Error(`No rows parsed from ${sourcePath}`);
    }

    let updated = 0;
    let missing = 0;

    for (const row of rows) {
        const classType = normalizeClassType(row.class_type);
        const roomType = normalizeRoomType(row.room_type);
        const templateCode = resolveCourseTemplateCode({ template_code: row.template_code });

        try {
            await prisma.course.update({
                where: { course_id: row.course_id },
                data: {
                    class_type: classType,
                    room_type: roomType,
                    default_room_type: roomType,
                    template_code: templateCode,
                },
            });
            updated += 1;
        } catch {
            missing += 1;
        }
    }

    console.log(`Updated ${updated} courses, ${missing} not found in database.`);
    await prisma.$disconnect();
}

main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
