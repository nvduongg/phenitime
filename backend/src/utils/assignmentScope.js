const { collectDescendantIds } = require('./scopeUnits');

const REQUEST_STATUS = {
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    REJECTED: 'REJECTED',
};

const SECTION_LIST_INCLUDE = {
    course: { include: { unit: true } },
    lecturer: true,
    student_groups: {
        include: {
            curriculum: {
                include: {
                    major: true,
                    unit: true,
                },
            },
        },
    },
    semester: {
        select: { start_date: true, end_date: true },
    },
    timetables: {
        select: { start_date: true, end_date: true },
    },
};

function isUnitInScope(unitId, scopeUnitIds) {
    if (!scopeUnitIds || !unitId) {
        return false;
    }
    return scopeUnitIds.includes(unitId);
}

function isSectionInOperationalScope(section, scopeUnitIds) {
    if (!scopeUnitIds) {
        return true;
    }

    const courseUnitId = section.course?.unit_id;
    if (courseUnitId && isUnitInScope(courseUnitId, scopeUnitIds)) {
        return true;
    }

    const groups = section.student_groups || [];
    for (const group of groups) {
        const curriculumUnitId = group.curriculum?.unit_id;
        const majorUnitId = group.curriculum?.major?.unit_id;
        if (isUnitInScope(curriculumUnitId, scopeUnitIds)) {
            return true;
        }
        if (isUnitInScope(majorUnitId, scopeUnitIds)) {
            return true;
        }
    }

    return false;
}

/**
 * HP do đơn vị khác quản lý chuyên môn — VP không tự phân công, phải gửi yêu cầu.
 */
function requiresExternalAssignmentRequest(section, scopeUnitIds) {
    if (!scopeUnitIds || !isSectionInOperationalScope(section, scopeUnitIds)) {
        return false;
    }
    const courseUnitId = section.course?.unit_id;
    if (!courseUnitId) {
        return false;
    }
    return !isUnitInScope(courseUnitId, scopeUnitIds);
}

/** @deprecated alias */
const isCrossFacultySection = requiresExternalAssignmentRequest;

function resolveTargetScopeUnitId(section) {
    return section.course?.unit_id || null;
}

function isTargetInReceiverScope(targetUnitId, receiverScopeUnitIds) {
    if (!receiverScopeUnitIds || !targetUnitId) {
        return false;
    }
    return receiverScopeUnitIds.includes(targetUnitId);
}

function enrichSectionAssignmentMeta(section, scopeUnitIds, pendingRequest = null) {
    const external = requiresExternalAssignmentRequest(section, scopeUnitIds);
    return {
        ...section,
        assignment_meta: {
            requires_assignment_request: external,
            cross_faculty: external,
            course_managing_unit_id: section.course?.unit_id || null,
            course_managing_unit_name: section.course?.unit?.unit_name || section.course?.unit_id || null,
            pending_request: pendingRequest
                ? {
                      request_id: pendingRequest.request_id,
                      status: pendingRequest.status,
                      target_scope_unit_name: pendingRequest.target_unit?.unit_name,
                  }
                : null,
        },
    };
}

async function validateLecturerAssignable(prisma, scopeUnitIds, section, lecturerId) {
    if (!lecturerId) {
        if (requiresExternalAssignmentRequest(section, scopeUnitIds)) {
            return {
                ok: false,
                message:
                    'Học phần do đơn vị khác quản lý chuyên môn. Vui lòng gửi yêu cầu phân công hoặc chờ đơn vị đó xử lý.',
            };
        }
        return { ok: true };
    }

    if (!scopeUnitIds) {
        return { ok: true };
    }

    if (!isSectionInOperationalScope(section, scopeUnitIds)) {
        return {
            ok: false,
            message: 'Lớp học phần không thuộc phạm vi đơn vị của bạn',
        };
    }

    if (requiresExternalAssignmentRequest(section, scopeUnitIds)) {
        const managing = section.course?.unit?.unit_name || section.course?.unit_id;
        return {
            ok: false,
            message: `Không thể tự phân công: học phần do «${managing}» quản lý. Hãy gửi yêu cầu phân công giảng dạy.`,
        };
    }

    const lecturer = await prisma.lecturer.findUnique({
        where: { lecturer_id: lecturerId },
        select: { lecturer_id: true, unit_id: true, lecturer_name: true },
    });

    if (!lecturer) {
        return { ok: false, message: 'Giảng viên không tồn tại' };
    }

    if (!isUnitInScope(lecturer.unit_id, scopeUnitIds)) {
        return {
            ok: false,
            message: 'Chỉ được gán giảng viên thuộc phạm vi trường/khoa của bạn',
        };
    }

    return { ok: true, lecturer };
}

async function loadPendingRequestsBySectionId(prisma, sectionIds) {
    if (!sectionIds.length) {
        return new Map();
    }

    const rows = await prisma.lecturerAssignmentRequest.findMany({
        where: {
            section_id: { in: sectionIds },
            status: REQUEST_STATUS.PENDING,
        },
        include: {
            target_unit: { select: { unit_id: true, unit_name: true } },
        },
    });

    return new Map(rows.map((row) => [row.section_id, row]));
}

module.exports = {
    REQUEST_STATUS,
    SECTION_LIST_INCLUDE,
    isSectionInOperationalScope,
    requiresExternalAssignmentRequest,
    isCrossFacultySection,
    resolveTargetScopeUnitId,
    isTargetInReceiverScope,
    enrichSectionAssignmentMeta,
    validateLecturerAssignable,
    loadPendingRequestsBySectionId,
};
