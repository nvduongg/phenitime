const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../utils/jwt');
const { resolveScopeUnitIds } = require('../utils/scopeUnits');
const { isRouteAllowed } = require('../config/permissions');

const prisma = new PrismaClient();

const PUBLIC_PATHS = new Set(['/api/health', '/api/v1/auth/login']);

function getBearerToken(req) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }
    return null;
}

async function authenticate(req, res, next) {
    const fullPath = req.originalUrl.split('?')[0];
    if (PUBLIC_PATHS.has(fullPath)) {
        return next();
    }

    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập' });
    }

    try {
        const decoded = verifyToken(token);
        const user = await prisma.user.findUnique({
            where: { user_id: decoded.sub },
            include: { scope_unit: true },
        });

        if (!user || !user.is_active) {
            return res.status(401).json({ status: 'error', message: 'Tài khoản không hợp lệ hoặc đã bị khóa' });
        }

        const scopeUnitIds = await resolveScopeUnitIds(prisma, user.scope_unit_id);

        req.user = {
            user_id: user.user_id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            scope_unit_id: user.scope_unit_id,
            scope_unit: user.scope_unit,
        };
        req.scopeUnitIds = scopeUnitIds;

        return next();
    } catch (error) {
        return res.status(401).json({ status: 'error', message: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
    }
}

function authorize(req, res, next) {
    const fullPath = req.originalUrl.split('?')[0];
    if (PUBLIC_PATHS.has(fullPath)) {
        return next();
    }

    if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Yêu cầu đăng nhập' });
    }

    const apiPath = fullPath.replace(/^\/api\/v1/, '') || '/';
    if (!isRouteAllowed(req.user.role, req.method, apiPath)) {
        return res.status(403).json({ status: 'error', message: 'Bạn không có quyền thực hiện thao tác này' });
    }

    return next();
}

function requireRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ status: 'error', message: 'Bạn không có quyền thực hiện thao tác này' });
        }
        return next();
    };
}

module.exports = {
    authenticate,
    authorize,
    requireRoles,
};
