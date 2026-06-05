import { ROLES } from '../constants/roles'

/** VP trường / VP khoa — phân công GV; lớp học phần chỉ xem. */
export const OFFICE_MENU_ROUTES = new Set([
  '/',
  '/academic/lecturer-assignment',
  '/academic/assignment-requests',
  '/course-sections',
])

export const MENU_ACCESS = {
  [ROLES.UNIVERSITY_TRAINING]: '*',
  [ROLES.SCHOOL_OFFICE]: OFFICE_MENU_ROUTES,
  [ROLES.FACULTY_OFFICE]: OFFICE_MENU_ROUTES,
}

export function isOfficeRole(role) {
  return role === ROLES.SCHOOL_OFFICE || role === ROLES.FACULTY_OFFICE
}

export function canAccessRoute(role, path) {
  const rules = MENU_ACCESS[role]
  if (!rules) return false
  if (rules === '*') return true
  return rules.has(path)
}

export function filterMenuItems(items, role) {
  return items
    .map((item) => {
      if (item.children) {
        const children = item.children.filter((child) =>
          canAccessRoute(role, child.key),
        )
        if (children.length === 0) return null
        return { ...item, children }
      }
      if (!canAccessRoute(role, item.key)) return null
      return item
    })
    .filter(Boolean)
}
