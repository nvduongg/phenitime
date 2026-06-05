const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('./password');
const { ROLES } = require('../constants/roles');

async function ensureSeedAdminUser(prisma) {
    const client = prisma || new PrismaClient();
    const shouldDisconnect = !prisma;

    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@phenikaa.edu.vn').trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || 'Phenitime@2026';
    const full_name = process.env.SEED_ADMIN_NAME || 'Ban Đào tạo (Đại học)';

    try {
        const existing = await client.user.findUnique({ where: { email } });
        if (existing) {
            return existing;
        }

        const password_hash = await hashPassword(password);
        const user = await client.user.create({
            data: {
                email,
                password_hash,
                full_name,
                role: ROLES.UNIVERSITY_TRAINING,
                scope_unit_id: null,
            },
        });

        console.log(`[auth] Seeded admin user: ${email}`);
        return user;
    } finally {
        if (shouldDisconnect) {
            await client.$disconnect();
        }
    }
}

module.exports = {
    ensureSeedAdminUser,
};
