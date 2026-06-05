const { PrismaClient } = require('@prisma/client');
const { ensureRootOrganizationUnit } = require('../src/utils/ensureRootOrganizationUnit');
const { ensureSeedAdminUser } = require('../src/utils/ensureSeedAdminUser');

const prisma = new PrismaClient();

async function main() {
    const unit = await ensureRootOrganizationUnit(prisma);
    console.log(`Seeded root organization unit: ${unit.unit_name} (${unit.unit_id})`);
    const admin = await ensureSeedAdminUser(prisma);
    console.log(`Seeded admin user: ${admin.email}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
