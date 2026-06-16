export const formatExportDateLong = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

export const formatExportDateShort = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  return `${day}/${month}/${year}`
}

export const formatLecturerDash = (lecturer, lecturerId) => {
  const name = lecturer?.lecturer_name
  const id = lecturer?.lecturer_id || lecturerId
  if (name && id) return `${name} - ${id}`
  return name || id || ''
}

export const formatLecturerParen = (lecturer, lecturerId) => {
  const name = lecturer?.lecturer_name
  const id = lecturer?.lecturer_id || lecturerId
  if (name && id) return `${name} (${id})`
  return name || id || ''
}

export const getSectionDateRange = (timetables = []) => {
  if (!timetables.length) {
    return { startDate: null, endDate: null }
  }

  let startDate = timetables[0].start_date
  let endDate = timetables[0].end_date

  for (const entry of timetables) {
    if (new Date(entry.start_date) < new Date(startDate)) {
      startDate = entry.start_date
    }
    if (new Date(entry.end_date) > new Date(endDate)) {
      endDate = entry.end_date
    }
  }

  return { startDate, endDate }
}

export const resolveSectionDateRange = (section, semesterLookup = new Map()) => {
  if (!section) {
    return { startDate: null, endDate: null }
  }

  const fromTimetables = getSectionDateRange(section.timetables || [])
  if (fromTimetables.startDate && fromTimetables.endDate) {
    return fromTimetables
  }

  const semester =
    section.semester || semesterLookup.get(section.semester_id) || null

  if (semester?.start_date && semester?.end_date) {
    return {
      startDate: semester.start_date,
      endDate: semester.end_date,
    }
  }

  return { startDate: null, endDate: null }
}

export const formatStudentGroupNames = (studentGroups = []) => {
  if (!studentGroups.length) return ''
  return studentGroups.map((group) => group.group_name || group.group_id).join(';')
}

export const formatCurriculumNames = (studentGroups = []) => {
  const names = [
    ...new Set(
      studentGroups
        .map((group) => group.curriculum?.curriculum_name)
        .filter(Boolean),
    ),
  ]
  return names.join(';')
}

/** Mã niên khóa gọn cho Excel (VD: K17), không dùng tên CTĐT dài. */
export const formatCohortIdsForExport = (studentGroups = []) => {
  const ids = [
    ...new Set(
      studentGroups
        .map((group) => group.curriculum?.cohort_id || group.curriculum?.cohort?.cohort_id)
        .filter(Boolean),
    ),
  ]
  return ids.sort((a, b) => String(b).localeCompare(String(a), 'vi')).join('; ')
}

export const resolveSectionCohortIds = (section) => [
  ...new Set(
    (section?.student_groups || [])
      .map((group) => group.curriculum?.cohort_id || group.curriculum?.cohort?.cohort_id)
      .filter(Boolean),
  ),
]

export const sectionMatchesCohortFilter = (section, cohortFilter = []) => {
  if (!cohortFilter?.length) {
    return true
  }
  const cohortIds = resolveSectionCohortIds(section)
  if (!cohortIds.length) {
    return false
  }
  return cohortIds.some((id) => cohortFilter.includes(id))
}

import {
  calculateScheduleParams,
  resolveSectionScheduleDisplay,
  resolveScheduleTypeForClass,
} from './periodCalculator'
import {
  buildSchedulingEventsForSection,
  resolvePhaseDateRange,
  resolveSchedulePlanForSection,
} from './scheduleRhythm'
import { resolveSectionClassType } from './sectionClassType'
import {
  calculateIntegratedScheduleParams,
  resolveCourseSectioningProfile,
} from './sectioningProfile'
import {
  formatSectionIdForExport,
  isAsyncOnlineExportSection,
  resolveExportGroupSortKey,
} from './sectionExportFormat'

/** Cột Nhóm KS khi xuất Excel: ELN/COUR async để trống (giống TKB thực); TH/LT giữ tên nhóm. */
export const formatStudentGroupNamesForExport = (section) => {
  if (!section) return ''
  if (isAsyncOnlineExportSection(section)) {
    return ''
  }
  return formatStudentGroupNames(section.student_groups || [])
}

/** Sĩ số dự kiến: trần ghép lớp (LT/TH) hoặc tổng thực tế (ONLINE/COUR async). */
export const resolveExpectedEnrollment = (section) => {
  if (!section) return ''

  if (isAsyncOnlineExportSection(section)) {
    const groups = section?.student_groups || []
    if (groups.length) {
      const total = groups.reduce(
        (sum, group) => sum + (Number(group.student_count) || 0),
        0,
      )
      if (total > 0) return total
    }
  }

  const storedCapacity = Number(section.capacity)
  if (Number.isFinite(storedCapacity) && storedCapacity > 0) {
    return storedCapacity
  }

  const groups = section?.student_groups || []
  if (!groups.length) {
    return ''
  }

  const total = groups.reduce(
    (sum, group) => sum + (Number(group.student_count) || 0),
    0,
  )
  return total > 0 ? total : ''
}

function resolveRhythmPlanForSection(section) {
  return resolveSchedulePlanForSection(section)
}

function dateRangesOverlap(startA, endA, startB, endB) {
  const a0 = new Date(startA).getTime()
  const a1 = new Date(endA).getTime()
  const b0 = new Date(startB).getTime()
  const b1 = new Date(endB).getTime()
  if ([a0, a1, b0, b1].some(Number.isNaN)) {
    return false
  }
  return a0 <= b1 && a1 >= b0
}

function resolveSchedulingEventsForSection(section) {
  if (Array.isArray(section?.scheduling_events) && section.scheduling_events.length) {
    return section.scheduling_events
  }
  return buildSchedulingEventsForSection(section)
}

function matchSchedulingEventWeeklyPeriods(section, startDate, endDate) {
  const events = resolveSchedulingEventsForSection(section)
  if (!events.length || !startDate || !endDate) {
    return null
  }

  const semester = section.semester || {}
  let bestPeriods = null
  let bestScore = -1
  const rowStart = new Date(startDate).getTime()
  const rowEnd = new Date(endDate).getTime()

  for (const event of events) {
    const phaseDates = resolvePhaseDateRange(
      semester,
      event.week_from,
      event.week_to,
    )
    if (!dateRangesOverlap(startDate, endDate, phaseDates.start_date, phaseDates.end_date)) {
      continue
    }

    const phaseStart = new Date(phaseDates.start_date).getTime()
    const phaseEnd = new Date(phaseDates.end_date).getTime()
    const contained = rowStart >= phaseStart && rowEnd <= phaseEnd
    const overlapStart = Math.max(rowStart, phaseStart)
    const overlapEnd = Math.min(rowEnd, phaseEnd)
    const overlapRatio = Math.max(0, overlapEnd - overlapStart)
      / Math.max(1, rowEnd - rowStart)
    const score = contained
      ? 1_000_000 + Number(event.weekly_periods ?? event.duration ?? 0)
      : overlapRatio * 1000 + Number(event.weekly_periods ?? event.duration ?? 0)

    if (score > bestScore) {
      bestScore = score
      bestPeriods = event.weekly_periods ?? event.duration
    }
  }

  return bestPeriods
}

function matchPhasePeriodsByDateRange(section, startDate, endDate) {
  const plan = resolveRhythmPlanForSection(section)
  if (!plan?.phases?.length || !startDate || !endDate) {
    return null
  }

  const semester = section.semester || {}
  let bestPeriods = null
  let bestScore = -1
  const rowStart = new Date(startDate).getTime()
  const rowEnd = new Date(endDate).getTime()

  for (const phase of plan.phases) {
    const phaseDates = resolvePhaseDateRange(
      semester,
      phase.weekFrom,
      phase.weekTo,
    )
    if (!dateRangesOverlap(startDate, endDate, phaseDates.start_date, phaseDates.end_date)) {
      continue
    }

    const phaseStart = new Date(phaseDates.start_date).getTime()
    const phaseEnd = new Date(phaseDates.end_date).getTime()
    const contained = rowStart >= phaseStart && rowEnd <= phaseEnd
    const overlapStart = Math.max(rowStart, phaseStart)
    const overlapEnd = Math.min(rowEnd, phaseEnd)
    const overlapRatio = Math.max(0, overlapEnd - overlapStart)
      / Math.max(1, rowEnd - rowStart)
    const score = contained
      ? 1_000_000 + Number(phase.periodsPerWeek || 0)
      : overlapRatio * 1000 + Number(phase.periodsPerWeek || 0)

    if (score > bestScore) {
      bestScore = score
      bestPeriods = phase.periodsPerWeek
    }
  }

  return bestPeriods
}

/** ST/tuần theo từng dòng TKB (giai đoạn), không lấy peak cả học kỳ. */
export const resolveWeeklyPeriodsForTimetableRow = (row, section) => {
  if (!section) return ''

  if (isAsyncOnlineExportSection(section)) {
    return ''
  }

  const eventPeriods = matchSchedulingEventWeeklyPeriods(
    section,
    row?.start_date,
    row?.end_date,
  )
  if (eventPeriods != null && eventPeriods !== '') {
    return eventPeriods
  }

  const phasePeriods = matchPhasePeriodsByDateRange(
    section,
    row?.start_date,
    row?.end_date,
  )
  if (phasePeriods != null && phasePeriods !== '') {
    return phasePeriods
  }

  return resolveWeeklyPeriodsForSection(section)
}

export const resolveWeeklyPeriodsForSection = (section) => {
  if (!section) return ''

  if (isAsyncOnlineExportSection(section)) {
    return ''
  }

  const course = section.course || {}
  const profile = resolveCourseSectioningProfile(course)
  const classType = resolveSectionClassType(section)
  const normalizedStored = String(section.class_type || '').trim().toUpperCase()

  if (section.st_per_week && classType === normalizedStored && !profile.combinedLtTh) {
    return section.st_per_week
  }

  if (profile.combinedLtTh) {
    return calculateIntegratedScheduleParams(course)?.stPerWeek
      ?? section.st_per_week
      ?? ''
  }

  const schedule = resolveSectionScheduleDisplay({ ...section, class_type: classType })
  return schedule?.stPerWeek ?? section.st_per_week ?? ''
}

export { resolveSectionClassType } from './sectionClassType'
export { formatSectionIdForExport, isAsyncOnlineExportSection } from './sectionExportFormat'

export const computeWeekNumber = (sessionStartDate, semesterStartDate) => {
  if (!sessionStartDate || !semesterStartDate) return ''

  const session = new Date(sessionStartDate)
  const semesterStart = new Date(semesterStartDate)
  if (Number.isNaN(session.getTime()) || Number.isNaN(semesterStart.getTime())) {
    return ''
  }

  session.setHours(0, 0, 0, 0)
  semesterStart.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((session - semesterStart) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return ''

  return Math.floor(diffDays / 7) + 1
}

export const resolveSectionContext = (row, sectionLookup = new Map()) => {
  return row.section || sectionLookup.get(row.section_id) || {}
}

const localeCompareVi = (left, right) =>
  String(left ?? '').localeCompare(String(right ?? ''), 'vi', { sensitivity: 'base' })

const compareSectionIds = (left, right) => {
  const leftKey = resolveExportGroupSortKey(left)
  const rightKey = resolveExportGroupSortKey(right)

  const byBase = localeCompareVi(leftKey.base, rightKey.base)
  if (byBase !== 0) return byBase

  if (leftKey.tier !== rightKey.tier) return leftKey.tier - rightKey.tier

  if (leftKey.suffix || rightKey.suffix) {
    const bySuffix = localeCompareVi(leftKey.suffix, rightKey.suffix)
    if (bySuffix !== 0) return bySuffix
  }

  return localeCompareVi(left, right)
}

const resolveCourseNameForExport = (row, sectionLookup = new Map()) =>
  row.section?.course?.course_name
  || sectionLookup.get(row.section_id)?.course?.course_name
  || row.section_id
  || ''

export const sortCourseSectionsForExport = (rows) =>
  [...rows].sort((a, b) => {
    const byCourseName = localeCompareVi(a.course?.course_name, b.course?.course_name)
    if (byCourseName !== 0) return byCourseName
    return compareSectionIds(a.section_id, b.section_id)
  })

const exportStartDateMs = (row) => {
  if (!row?.start_date) return Number.POSITIVE_INFINITY
  const ms = new Date(row.start_date).getTime()
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
}

export const sortTimetablesForExport = (rows, sectionLookup = new Map()) =>
  [...rows].sort((a, b) => {
    const byCourseName = localeCompareVi(
      resolveCourseNameForExport(a, sectionLookup),
      resolveCourseNameForExport(b, sectionLookup),
    )
    if (byCourseName !== 0) return byCourseName
    const bySection = compareSectionIds(a.section_id, b.section_id)
    if (bySection !== 0) return bySection
    const byStartDate = exportStartDateMs(a) - exportStartDateMs(b)
    if (byStartDate !== 0) return byStartDate
    const byDay = (a.day_of_week ?? 0) - (b.day_of_week ?? 0)
    if (byDay !== 0) return byDay
    return (a.start_period ?? 0) - (b.start_period ?? 0)
  })

/** Scheduled ca rows + async online sections (ELEARNING/COUR01) without TKB entries. */
export const prepareTimetablesForExport = (
  rows,
  sectionLookup = new Map(),
  { semesterSections = [], semesterLookup = new Map() } = {},
) => {
  const scheduledSectionIds = new Set(rows.map((row) => row.section_id))

  const virtualRows = semesterSections
    .filter((section) =>
      isAsyncOnlineExportSection(section)
      && !scheduledSectionIds.has(section.section_id))
    .map((section) => {
      const { startDate, endDate } = resolveSectionDateRange(section, semesterLookup)
      return {
        section_id: section.section_id,
        section,
        room_id: null,
        day_of_week: '',
        start_period: '',
        period_count: '',
        start_date: startDate,
        end_date: endDate,
      }
    })

  return sortTimetablesForExport([...rows, ...virtualRows], sectionLookup)
}
