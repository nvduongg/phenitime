const { ROLES } = require('../constants/roles');

const EMAIL_DOMAIN = process.env.ACCOUNT_EMAIL_DOMAIN || 'phenikaa-uni.edu.vn';
const PASSWORD_SUFFIX = process.env.ACCOUNT_PASSWORD_SUFFIX || '@123';

function normalizeUnitKey(unitId) {
    return String(unitId || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function rolePrefix(role, forPassword = false) {
    if (role === ROLES.SCHOOL_OFFICE) {
        return forPassword ? 'vpt' : 'vp';
    }
    if (role === ROLES.FACULTY_OFFICE) {
        return forPassword ? 'vk' : 'vk';
    }
    return 'u';
}

function resolveRoleForUnit(unit) {
    const type = String(unit.unit_type || '').toUpperCase();
    const { ROLE_FOR_UNIT_TYPE } = require('../constants/roles');
    return ROLE_FOR_UNIT_TYPE[type] || null;
}

function buildAccountEmail(unit, role) {
    const key = normalizeUnitKey(unit.unit_id);
    const prefix = rolePrefix(role, false);
    return `${prefix}.${key}@${EMAIL_DOMAIN}`;
}

/** Motíp: vptcntt@123, vkfcs@123 — tiền tố vai trò + mã đơn vị + @123 */
function buildMotifPassword(unit, role) {
    const key = normalizeUnitKey(unit.unit_id);
    const prefix = rolePrefix(role, true);
    return `${prefix}${key}${PASSWORD_SUFFIX}`;
}

function buildDisplayName(unit, role) {
    if (role === ROLES.SCHOOL_OFFICE) {
        return `Văn phòng ${unit.unit_name}`;
    }
    if (role === ROLES.FACULTY_OFFICE) {
        return `Văn phòng ${unit.unit_name}`;
    }
    return unit.unit_name;
}

module.exports = {
    buildAccountEmail,
    buildMotifPassword,
    buildDisplayName,
    resolveRoleForUnit,
    normalizeUnitKey,
};
