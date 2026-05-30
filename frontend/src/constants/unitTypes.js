/** Vietnamese labels for all organization unit type codes (VN + EN legacy). */
export const UNIT_TYPE_LABELS = {
  UNIVERSITY: 'Đại học',
  TRUONG: 'Trường đại học',
  SCHOOL: 'Viện/Trường',
  KHOA: 'Khoa',
  FACULTY: 'Khoa',
  BO_MON: 'Bộ môn',
  DEPARTMENT: 'Bộ môn',
  TRUNG_TAM: 'Trung tâm',
  CENTER: 'Trung tâm',
  PHONG: 'Phòng ban',
  OFFICE: 'Phòng ban',
}

export const UNIT_TYPE_COLORS = {
  TRUONG: 'purple',
  UNIVERSITY: 'purple',
  SCHOOL: 'geekblue',
  KHOA: 'blue',
  FACULTY: 'blue',
  BO_MON: 'green',
  DEPARTMENT: 'green',
  TRUNG_TAM: 'cyan',
  CENTER: 'cyan',
  PHONG: 'gold',
  OFFICE: 'gold',
}

/** @deprecated Root nodes are shown in the tree table. Kept for legacy checks only. */
export const HIDDEN_ROOT_UNIT_TYPES = new Set(['TRUONG', 'UNIVERSITY'])

export const UNIT_TYPE_FORM_OPTIONS = [
  { value: 'UNIVERSITY', label: 'Đại học' },
  { value: 'TRUONG', label: 'Trường đại học' },
  { value: 'SCHOOL', label: 'Viện/Trường' },
  { value: 'KHOA', label: 'Khoa' },
  { value: 'BO_MON', label: 'Bộ môn' },
  { value: 'TRUNG_TAM', label: 'Trung tâm' },
  { value: 'PHONG', label: 'Phòng ban' },
]

export function formatUnitType(value) {
  if (!value) return '—'
  const key = String(value).toUpperCase()
  return UNIT_TYPE_LABELS[key] || value
}

export function getUnitTypeColor(value) {
  if (!value) return 'default'
  const key = String(value).toUpperCase()
  return UNIT_TYPE_COLORS[key] || 'default'
}

export function isHiddenRootUnitType(unit) {
  return HIDDEN_ROOT_UNIT_TYPES.has(unit?.unit_type)
}

/** Unit types that represent a faculty / department level (Khoa). */
export const FACULTY_UNIT_TYPES = new Set(['KHOA', 'FACULTY'])

export function isFacultyUnit(unit) {
  if (!unit?.unit_type) return false
  return FACULTY_UNIT_TYPES.has(String(unit.unit_type).toUpperCase())
}

export function filterFacultyUnits(units) {
  return (units || []).filter(isFacultyUnit)
}
