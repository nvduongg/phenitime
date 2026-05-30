const { PrismaClient } = require('@prisma/client');
const { ROOT_ORGANIZATION_UNIT } = require('../constants/rootOrganizationUnit');

const LEGACY_ROOT_UNIT_ID = 'PKU';

async function migrateLegacyRootUnitId(client) {
    if (LEGACY_ROOT_UNIT_ID === ROOT_ORGANIZATION_UNIT.unit_id) {
        return;
    }

    const legacyRoot = await client.organizationUnit.findUnique({
        where: { unit_id: LEGACY_ROOT_UNIT_ID },
    });

    if (!legacyRoot) {
        return;
    }

    const nextRoot = await client.organizationUnit.findUnique({
        where: { unit_id: ROOT_ORGANIZATION_UNIT.unit_id },
    });

    if (nextRoot) {
        await client.organizationUnit.delete({
            where: { unit_id: LEGACY_ROOT_UNIT_ID },
        });
        return;
    }

    await client.$transaction([
        client.organizationUnit.updateMany({
            where: { parent_id: LEGACY_ROOT_UNIT_ID },
            data: { parent_id: ROOT_ORGANIZATION_UNIT.unit_id },
        }),
        client.course.updateMany({
            where: { unit_id: LEGACY_ROOT_UNIT_ID },
            data: { unit_id: ROOT_ORGANIZATION_UNIT.unit_id },
        }),
        client.major.updateMany({
            where: { unit_id: LEGACY_ROOT_UNIT_ID },
            data: { unit_id: ROOT_ORGANIZATION_UNIT.unit_id },
        }),
        client.curriculum.updateMany({
            where: { unit_id: LEGACY_ROOT_UNIT_ID },
            data: { unit_id: ROOT_ORGANIZATION_UNIT.unit_id },
        }),
        client.lecturer.updateMany({
            where: { unit_id: LEGACY_ROOT_UNIT_ID },
            data: { unit_id: ROOT_ORGANIZATION_UNIT.unit_id },
        }),
        client.organizationUnit.update({
            where: { unit_id: LEGACY_ROOT_UNIT_ID },
            data: {
                unit_id: ROOT_ORGANIZATION_UNIT.unit_id,
                unit_name: ROOT_ORGANIZATION_UNIT.unit_name,
                unit_type: ROOT_ORGANIZATION_UNIT.unit_type,
                parent_id: ROOT_ORGANIZATION_UNIT.parent_id,
            },
        }),
    ]);
}

async function ensureRootOrganizationUnit(prisma) {
    const client = prisma || new PrismaClient();
    const shouldDisconnect = !prisma;

    try {
        await migrateLegacyRootUnitId(client);

        return await client.organizationUnit.upsert({
            where: { unit_id: ROOT_ORGANIZATION_UNIT.unit_id },
            update: {
                unit_name: ROOT_ORGANIZATION_UNIT.unit_name,
                unit_type: ROOT_ORGANIZATION_UNIT.unit_type,
                parent_id: ROOT_ORGANIZATION_UNIT.parent_id,
            },
            create: ROOT_ORGANIZATION_UNIT,
        });
    } finally {
        if (shouldDisconnect) {
            await client.$disconnect();
        }
    }
}

module.exports = {
    ensureRootOrganizationUnit,
};
