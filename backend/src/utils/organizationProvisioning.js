const { ROOT_ORGANIZATION_UNIT } = require('../constants/rootOrganizationUnit');
const {
    ROLES,
    SCHOOL_LEVEL_UNIT_TYPES,
    FACULTY_LEVEL_UNIT_TYPES,
} = require('../constants/roles');

const ROOT_UNIT_ID = ROOT_ORGANIZATION_UNIT.unit_id;

function normalizeType(unit) {
    return String(unit?.unit_type || '').toUpperCase();
}

/** Trường/Viện thành viên — con trực tiếp của Đại học Phenikaa (PKA). */
function isMemberSchoolUnderUniversity(unit) {
    if (!unit || unit.parent_id !== ROOT_UNIT_ID) {
        return false;
    }
    return SCHOOL_LEVEL_UNIT_TYPES.has(normalizeType(unit));
}

/** Khoa/Bộ môn trực thuộc Đại học (không thuộc Trường thành viên). */
function isUniversityDirectFaculty(unit) {
    if (!unit || unit.parent_id !== ROOT_UNIT_ID) {
        return false;
    }
    return FACULTY_LEVEL_UNIT_TYPES.has(normalizeType(unit));
}

/**
 * Khoa nằm dưới Trường thành viên — không cấp tài khoản VP khoa (VP trường đã quản lý).
 */
function isFacultyUnderMemberSchool(unit, unitById) {
    const type = normalizeType(unit);
    if (!FACULTY_LEVEL_UNIT_TYPES.has(type)) {
        return false;
    }
    let current = unit;
    while (current?.parent_id) {
        const parent = unitById.get(current.parent_id);
        if (!parent) break;
        if (isMemberSchoolUnderUniversity(parent)) {
            return true;
        }
        current = parent;
    }
    return false;
}

function resolveProvisionTarget(unit, unitById, options = {}) {
    const { includeSchools = true, includeFaculties = true } = options;

    if (includeSchools && isMemberSchoolUnderUniversity(unit)) {
        return { unit, role: ROLES.SCHOOL_OFFICE, reason: 'Trường thành viên (trực thuộc Đại học)' };
    }

    if (includeFaculties && isUniversityDirectFaculty(unit)) {
        return { unit, role: ROLES.FACULTY_OFFICE, reason: 'Khoa trực thuộc Đại học' };
    }

    if (FACULTY_LEVEL_UNIT_TYPES.has(normalizeType(unit)) && isFacultyUnderMemberSchool(unit, unitById)) {
        return {
            skipped: true,
            reason: 'Khoa thuộc Trường thành viên — do Văn phòng trường quản lý, không tạo VP khoa',
        };
    }

    return null;
}

function listProvisionTargets(units, options = {}) {
    const unitById = new Map(units.map((u) => [u.unit_id, u]));
    const targets = [];
    const excluded = [];

    for (const unit of units) {
        const resolved = resolveProvisionTarget(unit, unitById, options);
        if (!resolved) continue;
        if (resolved.skipped) {
            excluded.push({ unit_id: unit.unit_id, unit_name: unit.unit_name, ...resolved });
            continue;
        }
        targets.push(resolved);
    }

    return { targets, excluded };
}

function filterUnitsForRole(units, role) {
    const unitById = new Map(units.map((u) => [u.unit_id, u]));
    return units.filter((unit) => {
        const t = resolveProvisionTarget(unit, unitById, {
            includeSchools: role === ROLES.SCHOOL_OFFICE,
            includeFaculties: role === ROLES.FACULTY_OFFICE,
        });
        return t && !t.skipped;
    });
}

module.exports = {
    ROOT_UNIT_ID,
    isMemberSchoolUnderUniversity,
    isUniversityDirectFaculty,
    isFacultyUnderMemberSchool,
    listProvisionTargets,
    filterUnitsForRole,
};
