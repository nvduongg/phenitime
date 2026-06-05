const { PrismaClient } = require('@prisma/client');
const { verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { resolveScopeUnitIds } = require('../utils/scopeUnits');
const { ROLE_LABELS } = require('../constants/roles');

const prisma = new PrismaClient();

function toPublicUser(user, scopeUnitIds) {
    return {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        role_label: ROLE_LABELS[user.role] || user.role,
        scope_unit_id: user.scope_unit_id,
        scope_unit: user.scope_unit
            ? {
                  unit_id: user.scope_unit.unit_id,
                  unit_name: user.scope_unit.unit_name,
                  unit_type: user.scope_unit.unit_type,
              }
            : null,
        scope_unit_ids: scopeUnitIds,
        is_active: user.is_active,
    };
}

exports.login = async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = req.body?.password || '';

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Vui lòng nhập email và mật khẩu' });
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { scope_unit: true },
        });

        if (!user || !user.is_active) {
            return res.status(401).json({ status: 'error', message: 'Email hoặc mật khẩu không đúng' });
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ status: 'error', message: 'Email hoặc mật khẩu không đúng' });
        }

        const scopeUnitIds = await resolveScopeUnitIds(prisma, user.scope_unit_id);
        const token = signToken({ sub: user.user_id, role: user.role });

        return res.status(200).json({
            status: 'success',
            data: {
                token,
                user: toPublicUser(user, scopeUnitIds),
            },
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { user_id: req.user.user_id },
            include: { scope_unit: true },
        });

        if (!user) {
            return res.status(404).json({ status: 'error', message: 'Không tìm thấy người dùng' });
        }

        return res.status(200).json({
            status: 'success',
            data: toPublicUser(user, req.scopeUnitIds),
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
