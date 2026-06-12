/**
 * Reconcile major_id values:
 * - unique major_code -> major_id = major_code
 * - duplicate major_code -> major_id = major_code.01, .02, ...
 *
 * Usage: node backend/scripts/migrateMajorIdsToNumericSuffix.js [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');
const { renameMajorId } = require('../src/utils/majorIdRenamer');

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

function buildMajorIdMapping(majors) {
    const grouped = new Map();

    majors.forEach((major) => {
        const code = String(major.major_code || '').trim();
        if (!grouped.has(code)) {
            grouped.set(code, []);
        }
        grouped.get(code).push(major);
    });

    const mapping = new Map();

    for (const [code, items] of grouped) {
        const sorted = [...items].sort((a, b) => a.major_id.localeCompare(b.major_id));

        if (sorted.length === 1) {
            const [only] = sorted;
            if (only.major_id !== code) {
                mapping.set(only.major_id, code);
            }
            continue;
        }

        sorted.forEach((major, index) => {
            const newId = `${code}.${String(index + 1).padStart(2, '0')}`;
            if (major.major_id !== newId) {
                mapping.set(major.major_id, newId);
            }
        });
    }

    return mapping;
}

async function migrateMajorIds() {
    const majors = await prisma.major.findMany({
        select: { major_id: true, major_code: true, major_name: true },
        orderBy: [{ major_code: 'asc' }, { major_id: 'asc' }],
    });

    const mapping = buildMajorIdMapping(majors);

    if (mapping.size === 0) {
        console.log('Mã nội bộ đã đúng chuẩn.');
        return;
    }

    console.log(`Sẽ chuyển ${mapping.size} mã nội bộ:`);
    for (const [oldId, newId] of mapping) {
        const major = majors.find((item) => item.major_id === oldId);
        console.log(`  ${oldId} -> ${newId} (${major?.major_name || ''})`);
    }

    if (dryRun) {
        console.log('\nDry run — không ghi DB.');
        return;
    }

    await prisma.$transaction(async (tx) => {
        for (const [oldId, newId] of mapping) {
            await renameMajorId(tx, oldId, newId);
        }
    });

    console.log('\nMigration hoàn tất.');
}

migrateMajorIds()
    .catch((error) => {
        console.error('Migration thất bại:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
