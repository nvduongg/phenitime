const { PrismaClient } = require('@prisma/client');
const { SCHOOL_SCOPED_ROLES } = require('../constants/roles');
const {
    REQUEST_STATUS,
    SECTION_LIST_INCLUDE,
    requiresExternalAssignmentRequest,
    resolveTargetScopeUnitId,
    isTargetInReceiverScope,
    isSectionInOperationalScope,
    validateLecturerAssignable,
    loadPendingRequestsBySectionId,
} = require('../utils/assignmentScope');

const prisma = new PrismaClient();

const requestInclude = {
    section: {
        include: {
            course: { include: { unit: true } },
            lecturer: true,
            student_groups: { include: { curriculum: { include: { major: true } } } },
        },
    },
    requester: { select: { user_id: true, full_name: true, email: true } },
    requester_unit: { select: { unit_id: true, unit_name: true } },
    target_unit: { select: { unit_id: true, unit_name: true } },
    fulfiller: { select: { user_id: true, full_name: true, email: true } },
};

function toPublicRequest(row) {
    return {
        request_id: row.request_id,
        section_id: row.section_id,
        semester_id: row.semester_id,
        status: row.status,
        message: row.message,
        response_note: row.response_note,
        created_at: row.created_at,
        updated_at: row.updated_at,
        fulfilled_at: row.fulfilled_at,
        requester: row.requester,
        requester_unit: row.requester_unit,
        target_unit: row.target_unit,
        fulfiller: row.fulfiller,
        section: row.section,
    };
}

function assertOfficeUser(req, res) {
    if (!req.user?.scope_unit_id || !SCHOOL_SCOPED_ROLES.has(req.user.role)) {
        res.status(403).json({
            status: 'error',
            message: 'Chỉ Văn phòng trường/khoa mới sử dụng yêu cầu phân công',
        });
        return false;
    }
    return true;
}

exports.listAssignmentRequests = async (req, res) => {
    try {
        if (!assertOfficeUser(req, res)) return;

        const box = String(req.query.box || 'incoming').toLowerCase();
        const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
        const semesterId = req.query.semester_id ? String(req.query.semester_id) : undefined;

        const where = {};
        if (status) {
            where.status = status;
        }
        if (semesterId) {
            where.semester_id = semesterId;
        }

        if (box === 'outgoing') {
            where.requester_scope_unit_id = req.user.scope_unit_id;
        } else {
            where.target_scope_unit_id = { in: req.scopeUnitIds };
        }

        const rows = await prisma.lecturerAssignmentRequest.findMany({
            where,
            include: requestInclude,
            orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
        });

        return res.status(200).json({
            status: 'success',
            data: rows.map(toPublicRequest),
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

async function createRequestForSection(req, section, message) {
    if (!requiresExternalAssignmentRequest(section, req.scopeUnitIds)) {
        return {
            ok: false,
            reason: 'Không cần yêu cầu — đơn vị bạn quản lý chuyên môn học phần',
        };
    }

    const targetUnitId = resolveTargetScopeUnitId(section);
    if (!targetUnitId) {
        return { ok: false, reason: 'Học phần chưa có đơn vị quản lý chuyên môn' };
    }

    const existingPending = await prisma.lecturerAssignmentRequest.findFirst({
        where: { section_id: section.section_id, status: REQUEST_STATUS.PENDING },
    });

    if (existingPending) {
        return { ok: false, reason: 'Đã có yêu cầu đang chờ', request_id: existingPending.request_id };
    }

    const row = await prisma.lecturerAssignmentRequest.create({
        data: {
            section_id: section.section_id,
            semester_id: section.semester_id,
            requested_by_user_id: req.user.user_id,
            requester_scope_unit_id: req.user.scope_unit_id,
            target_scope_unit_id: targetUnitId,
            message,
            status: REQUEST_STATUS.PENDING,
        },
        include: requestInclude,
    });

    return { ok: true, data: toPublicRequest(row), targetUnitId };
}

exports.createAssignmentRequest = async (req, res) => {
    try {
        if (!assertOfficeUser(req, res)) return;

        const sectionId = String(req.body?.section_id || '').trim();
        const message = req.body?.message ? String(req.body.message).trim() : null;

        if (!sectionId) {
            return res.status(400).json({ status: 'fail', message: 'Thiếu mã lớp học phần' });
        }

        const section = await prisma.courseSection.findUnique({
            where: { section_id: sectionId },
            include: SECTION_LIST_INCLUDE,
        });

        if (!section) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy lớp học phần' });
        }

        const result = await createRequestForSection(req, section, message);
        if (!result.ok) {
            return res.status(400).json({ status: 'fail', message: result.reason });
        }

        return res.status(201).json({
            status: 'success',
            data: result.data,
            message: `Đã gửi yêu cầu tới ${result.data.target_unit?.unit_name || result.targetUnitId}`,
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.bulkCreateAssignmentRequests = async (req, res) => {
    try {
        if (!assertOfficeUser(req, res)) return;

        const semesterId = String(req.body?.semester_id || '').trim();
        const message = req.body?.message ? String(req.body.message).trim() : null;

        if (!semesterId) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn học kỳ' });
        }

        const sections = await prisma.courseSection.findMany({
            where: { semester_id: semesterId },
            include: SECTION_LIST_INCLUDE,
        });

        const candidates = sections.filter(
            (section) =>
                isSectionInOperationalScope(section, req.scopeUnitIds) &&
                requiresExternalAssignmentRequest(section, req.scopeUnitIds),
        );

        const pendingMap = await loadPendingRequestsBySectionId(
            prisma,
            candidates.map((s) => s.section_id),
        );

        const created = [];
        const skipped = [];

        for (const section of candidates) {
            if (pendingMap.has(section.section_id)) {
                skipped.push({
                    section_id: section.section_id,
                    unit_name: section.course?.unit?.unit_name,
                    reason: 'Đã có yêu cầu chờ xử lý',
                });
                continue;
            }

            const result = await createRequestForSection(req, section, message);
            if (result.ok) {
                created.push({
                    section_id: section.section_id,
                    request_id: result.data.request_id,
                    target_unit_name: result.data.target_unit?.unit_name,
                });
                pendingMap.set(section.section_id, { request_id: result.data.request_id });
            } else {
                skipped.push({
                    section_id: section.section_id,
                    reason: result.reason,
                });
            }
        }

        if (created.length === 0) {
            return res.status(400).json({
                status: 'fail',
                message:
                    skipped.length > 0
                        ? 'Không có lớp nào được gửi yêu cầu mới (có thể đã gửi hết trước đó)'
                        : 'Không có lớp học phần cần yêu cầu phân công ngoài phạm vi trong học kỳ này',
                data: { created, skipped },
            });
        }

        return res.status(201).json({
            status: 'success',
            data: { created, skipped },
            message: `Đã gửi ${created.length} yêu cầu phân công${
                skipped.length ? `, bỏ qua ${skipped.length} lớp` : ''
            }`,
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.fulfillAssignmentRequest = async (req, res) => {
    try {
        if (!assertOfficeUser(req, res)) return;

        const { id } = req.params;
        const lecturerId = req.body?.lecturer_id ? String(req.body.lecturer_id).trim() : null;
        const responseNote = req.body?.response_note
            ? String(req.body.response_note).trim()
            : null;

        if (!lecturerId) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn giảng viên' });
        }

        const request = await prisma.lecturerAssignmentRequest.findUnique({
            where: { request_id: id },
            include: requestInclude,
        });

        if (!request) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy yêu cầu' });
        }

        if (request.status !== REQUEST_STATUS.PENDING) {
            return res.status(400).json({ status: 'fail', message: 'Yêu cầu đã được xử lý' });
        }

        if (!isTargetInReceiverScope(request.target_scope_unit_id, req.scopeUnitIds)) {
            return res.status(403).json({
                status: 'error',
                message: 'Yêu cầu không thuộc phạm vi đơn vị của bạn',
            });
        }

        const check = await validateLecturerAssignable(
            prisma,
            req.scopeUnitIds,
            request.section,
            lecturerId,
        );

        if (!check.ok) {
            return res.status(403).json({ status: 'error', message: check.message });
        }

        await prisma.$transaction([
            prisma.courseSection.update({
                where: { section_id: request.section_id },
                data: { lecturer_id: lecturerId },
            }),
            prisma.lecturerAssignmentRequest.update({
                where: { request_id: id },
                data: {
                    status: REQUEST_STATUS.COMPLETED,
                    fulfilled_by_user_id: req.user.user_id,
                    fulfilled_at: new Date(),
                    response_note: responseNote,
                },
            }),
        ]);

        const updatedRequest = await prisma.lecturerAssignmentRequest.findUnique({
            where: { request_id: id },
            include: requestInclude,
        });

        return res.status(200).json({
            status: 'success',
            data: toPublicRequest(updatedRequest),
            message: 'Đã phân công giảng viên theo yêu cầu',
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.cancelAssignmentRequest = async (req, res) => {
    try {
        if (!assertOfficeUser(req, res)) return;

        const { id } = req.params;
        const request = await prisma.lecturerAssignmentRequest.findUnique({
            where: { request_id: id },
        });

        if (!request) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy yêu cầu' });
        }

        if (request.requester_scope_unit_id !== req.user.scope_unit_id) {
            return res.status(403).json({ status: 'error', message: 'Chỉ đơn vị gửi yêu cầu mới được hủy' });
        }

        if (request.status !== REQUEST_STATUS.PENDING) {
            return res.status(400).json({ status: 'fail', message: 'Yêu cầu đã được xử lý' });
        }

        const row = await prisma.lecturerAssignmentRequest.update({
            where: { request_id: id },
            data: { status: REQUEST_STATUS.CANCELLED },
            include: requestInclude,
        });

        return res.status(200).json({
            status: 'success',
            data: toPublicRequest(row),
            message: 'Đã hủy yêu cầu phân công',
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.rejectAssignmentRequest = async (req, res) => {
    try {
        if (!assertOfficeUser(req, res)) return;

        const { id } = req.params;
        const responseNote = req.body?.response_note
            ? String(req.body.response_note).trim()
            : 'Từ chối xử lý';

        const request = await prisma.lecturerAssignmentRequest.findUnique({
            where: { request_id: id },
        });

        if (!request) {
            return res.status(404).json({ status: 'fail', message: 'Không tìm thấy yêu cầu' });
        }

        if (!isTargetInReceiverScope(request.target_scope_unit_id, req.scopeUnitIds)) {
            return res.status(403).json({ status: 'error', message: 'Không thuộc phạm vi xử lý của bạn' });
        }

        if (request.status !== REQUEST_STATUS.PENDING) {
            return res.status(400).json({ status: 'fail', message: 'Yêu cầu đã được xử lý' });
        }

        const row = await prisma.lecturerAssignmentRequest.update({
            where: { request_id: id },
            data: {
                status: REQUEST_STATUS.REJECTED,
                response_note: responseNote,
                fulfilled_by_user_id: req.user.user_id,
                fulfilled_at: new Date(),
            },
            include: requestInclude,
        });

        return res.status(200).json({
            status: 'success',
            data: toPublicRequest(row),
            message: 'Đã từ chối yêu cầu',
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
