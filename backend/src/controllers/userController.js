const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../utils/password');
const { resolveScopeUnitIds } = require('../utils/scopeUnits');
const {
    buildAccountEmail,
    buildMotifPassword,
    buildDisplayName,
} = require('../utils/accountCredentials');
const { bufferFromCredentials } = require('../utils/exportAccountCredentials');
const {
    listProvisionTargets,
    filterUnitsForRole,
    isMemberSchoolUnderUniversity,
    isUniversityDirectFaculty,
} = require('../utils/organizationProvisioning');
const {
    ROLES,
    SCHOOL_SCOPED_ROLES,
    SCHOOL_LEVEL_UNIT_TYPES,
    FACULTY_LEVEL_UNIT_TYPES,
    ROLE_LABELS,
} = require('../constants/roles');

const prisma = new PrismaClient();

const PROVISIONABLE_ROLES = new Set([ROLES.SCHOOL_OFFICE, ROLES.FACULTY_OFFICE]);

function toPublicUser(user) {
    return {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        role_label: ROLE_LABELS[user.role] || user.role,
        scope_unit_id: user.scope_unit_id,
        scope_unit: user.scope_unit || null,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
    };
}

async function validateScopeUnit(role, scopeUnitId) {
    if (role === ROLES.UNIVERSITY_TRAINING) {
        throw new Error('Tài khoản Ban Đào tạo (Đại học) chỉ được khởi tạo hệ thống, không tạo qua giao diện');
    }

    if (!scopeUnitId) {
        throw new Error('Vui lòng chọn đơn vị phạm vi cho tài khoản');
    }

    const unit = await prisma.organizationUnit.findUnique({
        where: { unit_id: scopeUnitId },
    });

    if (!unit) {
        throw new Error('Đơn vị phạm vi không tồn tại');
    }

    if (role === ROLES.SCHOOL_OFFICE) {
        if (!isMemberSchoolUnderUniversity(unit)) {
            throw new Error(
                'Văn phòng trường chỉ gắn Trường/Viện trực thuộc Đại học Phenikaa (con trực tiếp của PKA)',
            );
        }
        return scopeUnitId;
    }

    if (role === ROLES.FACULTY_OFFICE) {
        if (!isUniversityDirectFaculty(unit)) {
            throw new Error(
                'Văn phòng khoa chỉ cho Khoa/Bộ môn trực thuộc Đại học Phenikaa — không chọn Khoa thuộc Trường thành viên',
            );
        }
        return scopeUnitId;
    }

    throw new Error('Vai trò không hợp lệ');
}

async function enrichScopeSummary(user) {
    const base = toPublicUser(user);
    if (!user.scope_unit_id) {
        return { ...base, scope_summary: 'Ban Đào tạo — toàn Đại học' };
    }

    const descendantIds = await resolveScopeUnitIds(prisma, user.scope_unit_id);
    const childCount = Math.max(0, (descendantIds?.length || 1) - 1);
    const type = String(user.scope_unit?.unit_type || '').toUpperCase();

    if (SCHOOL_LEVEL_UNIT_TYPES.has(type) && childCount > 0) {
        return {
            ...base,
            scope_summary: `${user.scope_unit.unit_name} (+${childCount} đơn vị con)`,
        };
    }

    return {
        ...base,
        scope_summary: user.scope_unit?.unit_name || user.scope_unit_id,
    };
}

async function createProvisionedUser({ unit, role, email, full_name, password }) {
    const password_hash = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            email,
            password_hash,
            full_name,
            role,
            scope_unit_id: unit.unit_id,
        },
        include: { scope_unit: true },
    });
    const enriched = await enrichScopeSummary(user);
    return {
        ...enriched,
        password,
        unit_type: unit.unit_type,
    };
}

exports.listUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            include: { scope_unit: true },
            orderBy: [{ role: 'asc' }, { full_name: 'asc' }],
        });

        const data = await Promise.all(users.map((u) => enrichScopeSummary(u)));

        return res.status(200).json({ status: 'success', data });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.bulkGenerateAccounts = async (req, res) => {
    try {
        const skipExisting = req.body?.skip_existing !== false;
        const includeSchools = req.body?.include_schools !== false;
        const includeFaculties = req.body?.include_faculties !== false;

        const units = await prisma.organizationUnit.findMany({
            orderBy: [{ unit_type: 'asc' }, { unit_name: 'asc' }],
        });

        const { targets, excluded: excludedByPolicy } = listProvisionTargets(units, {
            includeSchools,
            includeFaculties,
        });

        const created = [];
        const skipped = excludedByPolicy.map((row) => ({
            unit_id: row.unit_id,
            unit_name: row.unit_name,
            reason: row.reason,
        }));

        for (const { unit, role } of targets) {
            const email = buildAccountEmail(unit, role);
            const existing = await prisma.user.findUnique({ where: { email } });

            if (existing) {
                if (skipExisting) {
                    skipped.push({
                        email,
                        unit_id: unit.unit_id,
                        unit_name: unit.unit_name,
                        role,
                        reason: 'Đã có tài khoản',
                    });
                    continue;
                }
                const password = buildMotifPassword(unit, role);
                await prisma.user.update({
                    where: { user_id: existing.user_id },
                    data: { password_hash: await hashPassword(password) },
                });
                created.push({
                    email,
                    password,
                    full_name: existing.full_name,
                    role,
                    role_label: ROLE_LABELS[role],
                    scope_unit_id: unit.unit_id,
                    unit_name: unit.unit_name,
                    unit_type: unit.unit_type,
                    updated: true,
                });
                continue;
            }

            const password = buildMotifPassword(unit, role);
            const full_name = buildDisplayName(unit, role);
            const row = await createProvisionedUser({
                unit,
                role,
                email,
                full_name,
                password,
            });
            created.push({
                email: row.email,
                password,
                full_name: row.full_name,
                role: row.role,
                role_label: row.role_label,
                scope_unit_id: row.scope_unit_id,
                unit_name: unit.unit_name,
                unit_type: unit.unit_type,
                updated: false,
            });
        }

        return res.status(200).json({
            status: 'success',
            data: { created, skipped, excluded_by_policy: excludedByPolicy },
            message: `Đã sinh/cập nhật ${created.length} tài khoản (gốc Đại học Phenikaa — không tạo VP khoa thuộc Trường thành viên).`,
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.exportAccountCredentials = async (req, res) => {
    try {
        const created = req.body?.created || [];
        const excluded = req.body?.excluded || req.body?.excluded_by_policy || [];

        if (!created.length) {
            return res.status(400).json({ status: 'error', message: 'Không có dữ liệu tài khoản để xuất' });
        }

        const buffer = bufferFromCredentials(created, { excluded });
        const filename = `phenitime-tai-khoan-${new Date().toISOString().slice(0, 10)}.xlsx`;

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.previewBulkAccounts = async (req, res) => {
    try {
        const includeSchools = req.query.include_schools !== 'false';
        const includeFaculties = req.query.include_faculties !== 'false';

        const units = await prisma.organizationUnit.findMany({
            orderBy: [{ unit_type: 'asc' }, { unit_name: 'asc' }],
        });

        const { targets, excluded } = listProvisionTargets(units, {
            includeSchools,
            includeFaculties,
        });

        const preview = targets.map(({ unit, role, reason }) => ({
            unit_id: unit.unit_id,
            unit_name: unit.unit_name,
            unit_type: unit.unit_type,
            role,
            role_label: ROLE_LABELS[role],
            email: buildAccountEmail(unit, role),
            password: buildMotifPassword(unit, role),
            full_name: buildDisplayName(unit, role),
            provision_note: reason,
        }));

        return res.status(200).json({
            status: 'success',
            data: {
                preview,
                excluded,
                summary: {
                    will_create: preview.length,
                    excluded_count: excluded.length,
                    root: 'PKA — Đại học Phenikaa',
                },
            },
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const role = req.body?.role;
        let scope_unit_id = req.body?.scope_unit_id || null;

        if (!PROVISIONABLE_ROLES.has(role)) {
            return res.status(400).json({
                status: 'error',
                message: 'Chỉ tạo tài khoản Văn phòng trường hoặc Văn phòng khoa. Ban Đào tạo (Đại học) do hệ thống quản lý.',
            });
        }

        scope_unit_id = await validateScopeUnit(role, scope_unit_id);
        const unit = await prisma.organizationUnit.findUnique({
            where: { unit_id: scope_unit_id },
        });

        const email = String(req.body?.email || buildAccountEmail(unit, role)).trim().toLowerCase();
        const full_name = String(req.body?.full_name || buildDisplayName(unit, role)).trim();
        const useMotif = req.body?.use_motif_password !== false;
        let password = req.body?.password || (useMotif ? buildMotifPassword(unit, role) : '');

        if (!password || password.length < 6) {
            return res.status(400).json({ status: 'error', message: 'Mật khẩu không hợp lệ' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ status: 'error', message: 'Email đã được sử dụng' });
        }

        const row = await createProvisionedUser({
            unit,
            role,
            email,
            full_name,
            password,
        });

        return res.status(201).json({
            status: 'success',
            data: row,
            credentials: { email, password, full_name },
            message: 'Đã tạo tài khoản. Sao chép thông tin đăng nhập để cấp cho đơn vị.',
        });
    } catch (error) {
        const status =
            error.message.includes('Vui lòng') ||
            error.message.includes('Phạm vi') ||
            error.message.includes('Chỉ tạo') ||
            error.message.includes('Ban Đào tạo')
                ? 400
                : 500;
        return res.status(status).json({ status: 'error', message: error.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const full_name = req.body?.full_name !== undefined ? String(req.body.full_name).trim() : undefined;
        const role = req.body?.role;
        let scope_unit_id = req.body?.scope_unit_id;
        const is_active = req.body?.is_active;

        const existing = await prisma.user.findUnique({
            where: { user_id: id },
            include: { scope_unit: true },
        });
        if (!existing) {
            return res.status(404).json({ status: 'error', message: 'Không tìm thấy người dùng' });
        }

        if (existing.role === ROLES.UNIVERSITY_TRAINING) {
            if (is_active !== undefined && is_active !== true) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Không thể khóa tài khoản Ban Đào tạo (Đại học)',
                });
            }
            if (role !== undefined && role !== ROLES.UNIVERSITY_TRAINING) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Không thể đổi vai trò tài khoản Ban Đào tạo (Đại học)',
                });
            }
        }

        const data = {};

        if (full_name !== undefined) data.full_name = full_name;

        if (existing.role !== ROLES.UNIVERSITY_TRAINING && is_active !== undefined) {
            data.is_active = Boolean(is_active);
        }

        if (role !== undefined && existing.role !== ROLES.UNIVERSITY_TRAINING) {
            if (!PROVISIONABLE_ROLES.has(role)) {
                return res.status(400).json({ status: 'error', message: 'Vai trò không hợp lệ' });
            }
            data.role = role;
            if (scope_unit_id !== undefined) {
                data.scope_unit_id = await validateScopeUnit(role, scope_unit_id);
            }
        } else if (
            scope_unit_id !== undefined &&
            existing.role !== ROLES.UNIVERSITY_TRAINING
        ) {
            data.scope_unit_id = await validateScopeUnit(existing.role, scope_unit_id);
        }

        const user = await prisma.user.update({
            where: { user_id: id },
            data,
            include: { scope_unit: true },
        });

        return res.status(200).json({
            status: 'success',
            data: await enrichScopeSummary(user),
        });
    } catch (error) {
        const status = error.message.includes('Không thể') || error.message.includes('Vui lòng') ? 400 : 500;
        return res.status(status).json({ status: 'error', message: error.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.user_id) {
            return res.status(400).json({ status: 'error', message: 'Không thể xóa tài khoản đang đăng nhập' });
        }

        const existing = await prisma.user.findUnique({ where: { user_id: id } });
        if (existing?.role === ROLES.UNIVERSITY_TRAINING) {
            return res.status(400).json({
                status: 'error',
                message: 'Không thể xóa tài khoản Ban Đào tạo (Đại học)',
            });
        }

        await prisma.user.delete({ where: { user_id: id } });
        return res.status(200).json({ status: 'success', message: 'Đã xóa tài khoản' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ status: 'error', message: 'Không tìm thấy người dùng' });
        }
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.user.findUnique({
            where: { user_id: id },
            include: { scope_unit: true },
        });
        if (!existing) {
            return res.status(404).json({ status: 'error', message: 'Không tìm thấy người dùng' });
        }

        if (existing.role === ROLES.UNIVERSITY_TRAINING) {
            return res.status(400).json({
                status: 'error',
                message: 'Đặt lại mật khẩu Ban Đào tạo qua biến môi trường SEED_ADMIN_PASSWORD / quản trị server',
            });
        }

        if (!existing.scope_unit) {
            return res.status(400).json({ status: 'error', message: 'Tài khoản không gắn đơn vị' });
        }

        const password = buildMotifPassword(existing.scope_unit, existing.role);
        await prisma.user.update({
            where: { user_id: id },
            data: { password_hash: await hashPassword(password) },
        });

        return res.status(200).json({
            status: 'success',
            data: { user_id: id, email: existing.email, full_name: existing.full_name },
            credentials: { email: existing.email, password },
            message: 'Mật khẩu đã đặt lại theo motíp đơn vị (vd. vptcntt@123).',
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.listScopeUnitOptions = async (req, res) => {
    try {
        const role = req.query.role;
        const units = await prisma.organizationUnit.findMany({
            orderBy: [{ unit_type: 'asc' }, { unit_name: 'asc' }],
        });

        const filtered = role ? filterUnitsForRole(units, role) : units;

        return res.status(200).json({ status: 'success', data: filtered });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
