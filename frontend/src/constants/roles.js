export const ROLES = {
  UNIVERSITY_TRAINING: 'UNIVERSITY_TRAINING',
  SCHOOL_OFFICE: 'SCHOOL_OFFICE',
  FACULTY_OFFICE: 'FACULTY_OFFICE',
}

export const ROLE_LABELS = {
  [ROLES.UNIVERSITY_TRAINING]: 'Ban Đào tạo (Đại học)',
  [ROLES.SCHOOL_OFFICE]: 'Văn phòng trường',
  [ROLES.FACULTY_OFFICE]: 'Văn phòng khoa',
}

/** Nhãn ngắn cho thanh header. */
export const ROLE_SHORT_LABELS = {
  [ROLES.UNIVERSITY_TRAINING]: 'Ban ĐT ĐH',
  [ROLES.SCHOOL_OFFICE]: 'VP trường',
  [ROLES.FACULTY_OFFICE]: 'VP khoa',
}

/** Vai trò có thể tạo qua form / sinh hàng loạt (không gồm Ban Đào tạo Đại học). */
export const PROVISIONABLE_ROLES = [ROLES.SCHOOL_OFFICE, ROLES.FACULTY_OFFICE]
