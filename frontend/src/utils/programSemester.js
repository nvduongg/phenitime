export const TERMS_PER_YEAR = 3
export const DEFAULT_PROGRAM_SEMESTER_COUNT = 12

export function getProgramSemesterParts(semesterNumber) {
  const semester = Number(semesterNumber)
  if (!Number.isFinite(semester) || semester < 1) return null

  const year = Math.floor((semester - 1) / TERMS_PER_YEAR) + 1
  const term = ((semester - 1) % TERMS_PER_YEAR) + 1

  return { semester, term, year }
}

export function getProgramSemesterCalendarYear(semesterNumber, cohortStartYear) {
  const parts = getProgramSemesterParts(semesterNumber)
  const startYear = Number(cohortStartYear)
  if (!parts || !Number.isFinite(startYear)) return null

  // Nhập học tháng 10: Kỳ 1 năm 1 = start_year, Kỳ 2+ trong cùng năm CTĐT sang năm dương lịch kế tiếp
  return startYear + (parts.year - 1) + (parts.term > 1 ? 1 : 0)
}

export function formatProgramSemester(semesterNumber, cohortStartYear) {
  const parts = getProgramSemesterParts(semesterNumber)
  if (!parts) return '—'

  const label = `Kỳ ${parts.term} Năm ${parts.year}`
  if (cohortStartYear) {
    const calendarYear = getProgramSemesterCalendarYear(semesterNumber, cohortStartYear)
    return `${label} (${calendarYear})`
  }

  return label
}

export function buildProgramSemesterOptions(maxSemester = DEFAULT_PROGRAM_SEMESTER_COUNT, cohortStartYear) {
  return Array.from({ length: maxSemester }, (_, index) => {
    const value = index + 1
    return {
      value,
      label: formatProgramSemester(value, cohortStartYear),
    }
  })
}

export function formatCohortLabel(cohort) {
  if (!cohort) return '—'
  const id = cohort.cohort_id || cohort
  const startYear = typeof cohort === 'object' ? cohort.start_year : null
  if (startYear) {
    return `${id} (nhập học ${startYear})`
  }
  return String(id)
}

export function formatMajorLabel(major) {
  if (!major) return '—'

  const code = major.major_code || major.major_id
  const name = major.major_name || ''
  const hasDistinctInternalId = major.major_code && major.major_id !== major.major_code

  if (hasDistinctInternalId) {
    return `${major.major_code} — ${name} [${major.major_id}]`
  }

  return name ? `${code} — ${name}` : String(code)
}

export function formatMajorOptionLabel(major) {
  return formatMajorLabel(major)
}
