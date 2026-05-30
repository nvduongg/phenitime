const { PrismaClient } = require('@prisma/client');
const { ensureRootOrganizationUnit } = require('../src/utils/ensureRootOrganizationUnit');

const prisma = new PrismaClient();

async function main() {
    const unit = await ensureRootOrganizationUnit(prisma);
    console.log(`Seeded root organization unit: ${unit.unit_name} (${unit.unit_id})`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
