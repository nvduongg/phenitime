export function requiresAssignmentRequest(section) {
  return Boolean(section?.assignment_meta?.requires_assignment_request)
}

/** @deprecated */
export function isCrossFacultySection(section) {
  return requiresAssignmentRequest(section)
}

export function hasPendingAssignmentRequest(section) {
  return section?.assignment_meta?.pending_request?.status === 'PENDING'
}

/** Có thể gửi yêu cầu phân công (chưa có YC chờ). */
export function canSendAssignmentRequest(section) {
  return requiresAssignmentRequest(section) && !hasPendingAssignmentRequest(section)
}
