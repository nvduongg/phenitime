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

export const resolveSectionDateRange = (
  section,
  semesterLookup = new Map(),
  waves = [],
) => {
  if (!section) {
    return { startDate: null, endDate: null }
  }

  const fromTimetables = getSectionDateRange(section.timetables || [])
  if (fromTimetables.startDate && fromTimetables.endDate) {
    return fromTimetables
  }

  const semester =
    section.semester || semesterLookup.get(section.semester_id) || null

  if (!semester?.start_date || !semester?.end_date) {
    return { startDate: null, endDate: null }
  }

  const waveStartWeek = resolveWaveStartWeek(section, waves)
  const events = applyWaveWeekOffset(
    buildSchedulingEventsForSection(section),
    waveStartWeek,
  )

  if (events.length) {
    const weekFrom = Math.min(...events.map((event) => Number(event.week_from) || 1))
    const weekTo = Math.max(...events.map((event) => Number(event.week_to) || weekFrom))
    const dates = resolvePhaseDateRange(semester, weekFrom, weekTo)
    return {
      startDate: dates.start_date,
      endDate: dates.end_date,
    }
  }

  if (waveStartWeek > 1) {
    const dates = resolvePhaseDateRange(semester, waveStartWeek, waveStartWeek + 9)
    return {
      startDate: dates.start_date,
      endDate: dates.end_date,
    }
  }

  return {
    startDate: semester.start_date,
    endDate: semester.end_date,
  }
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
  resolveSectionScheduleDisplay,
} from './periodCalculator'
import {
  buildSchedulingEventsForSection,
  resolvePhaseDateRange,
  resolveSchedulePlanForSection,
} from './scheduleRhythm'
import { resolveSectionClassType } from './sectionClassType'
import {
  applyWaveWeekOffset,
  resolveWaveStartWeek,
} from './semesterWaves'
import {
  calculateIntegratedScheduleParams,
  resolveCourseSectioningProfile,
} from './sectioningProfile'
import {
  isAsyncOnlineExportSection,
  resolveExportGroupSortKey,
} from './sectionExportFormat'
import {
  buildOfflineSchedulePlan,
  shouldUseOfflineSchedule,
  parseOfflineWeekPlan,
  OFFLINE_WEEK_RHYTHMS,
} from '../constants/offlineSchedule'

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

  if (row?.export_weekly_periods != null && row.export_weekly_periods !== '') {
    return row.export_weekly_periods
  }

  if (row?.export_event_part != null) {
    const events = resolveSchedulingEventsForSection(section)
    const event = events.find((item) => item.event_part === row.export_event_part)
    if (event?.weekly_periods != null && event.weekly_periods !== '') {
      return event.weekly_periods
    }
    if (event?.duration != null && event.duration !== '') {
      return event.duration
    }
  }

  if (row?.export_week_from != null && row?.period_count != null && row.period_count !== '') {
    return row.period_count
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

  if (leftKey.suffixOrder != null && rightKey.suffixOrder != null) {
    const bySuffixOrder = leftKey.suffixOrder - rightKey.suffixOrder
    if (bySuffixOrder !== 0) return bySuffixOrder
  } else if (leftKey.suffix || rightKey.suffix) {
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
    const byEventPart = (a.export_event_part ?? 0) - (b.export_event_part ?? 0)
    if (byEventPart !== 0) return byEventPart
    const byDay = (a.day_of_week ?? 0) - (b.day_of_week ?? 0)
    if (byDay !== 0) return byDay
    return (a.start_period ?? 0) - (b.start_period ?? 0)
  })

export const sortTimetablesForDisplay = sortTimetablesForExport

function phaseDateToIso(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Ngày BĐ/KT động theo tuần học kỳ của từng buổi (offline) hoặc giai đoạn đã xếp lịch. */
export const resolveTimetableRowExportDates = (row, section, semesterLookup = new Map()) => {
  if (row?.export_week_from != null) {
    const semester = section?.semester || semesterLookup.get(section?.semester_id) || {}
    const weekTo = row.export_week_to ?? row.export_week_from
    const dates = resolvePhaseDateRange(semester, row.export_week_from, weekTo)
    return {
      startDate: phaseDateToIso(dates.start_date),
      endDate: phaseDateToIso(dates.end_date),
    }
  }

  if (row?.start_date && row?.end_date) {
    return {
      startDate: phaseDateToIso(row.start_date),
      endDate: phaseDateToIso(row.end_date),
    }
  }

  return resolveSectionDateRange(section, semesterLookup)
}

/** Tuần học kỳ (T1, T2…) theo kế hoạch buổi hoặc suy từ ngày BĐ/KT. */
export const resolveTimetableRowExportWeek = (row, section, semesterLookup = new Map()) => {
  if (row?.export_week_from != null) {
    const from = Number(row.export_week_from)
    const to = Number(row.export_week_to ?? row.export_week_from)
    if (!Number.isFinite(from) || from < 1) return ''
    if (Number.isFinite(to) && to > from) {
      return `${from}-${to}`
    }
    return String(from)
  }

  const semester = section?.semester || semesterLookup.get(section?.semester_id) || {}
  const { startDate, endDate } = resolveTimetableRowExportDates(row, section, semesterLookup)

  if (!startDate || !semester?.start_date) {
    return ''
  }

  const weekStart = computeWeekNumber(startDate, semester.start_date)
  if (!weekStart) {
    return ''
  }

  if (endDate && endDate !== startDate) {
    const weekEnd = computeWeekNumber(endDate, semester.start_date)
    if (weekEnd && weekEnd !== weekStart) {
      return `${weekStart}-${weekEnd}`
    }
  }

  return String(weekStart)
}

function shouldExpandSectionForOfflineExport(section) {
  if (!section || isAsyncOnlineExportSection(section)) {
    return false
  }
  const course = section.course || {}
  const classType = resolveSectionClassType(section)
  return shouldUseOfflineSchedule(course, classType)
}

function findTimetableRowForOfflineEvent(sectionRows, event, dates, usedRowIds) {
  const slottedRows = sectionRows.filter(
    (row) => row.day_of_week && row.start_period && row.room_id,
  )

  if (slottedRows.length === 1) {
    return slottedRows[0]
  }

  const unusedRows = sectionRows.filter(
    (row) => !row.schedule_id || !usedRowIds.has(row.schedule_id),
  )

  for (const row of unusedRows) {
    if (
      row.start_date
      && row.end_date
      && dateRangesOverlap(
        row.start_date,
        row.end_date,
        dates.start_date,
        dates.end_date,
      )
    ) {
      return row
    }
  }

  const byPartIndex = unusedRows[event.event_part - 1]
  if (byPartIndex) {
    return byPartIndex
  }

  return unusedRows[0] || null
}

function expandOfflineSessionExportRows(
  rows,
  { semesterSections = [], semesterLookup = new Map() } = {},
) {
  const expandSectionIds = new Set(
    semesterSections
      .filter(shouldExpandSectionForOfflineExport)
      .map((section) => section.section_id),
  )

  if (!expandSectionIds.size) {
    return rows
  }

  const kept = rows.filter((row) => !expandSectionIds.has(row.section_id))
  const expanded = []

  for (const section of semesterSections) {
    if (!expandSectionIds.has(section.section_id)) {
      continue
    }

    const course = section.course || {}
    const plan = buildOfflineSchedulePlan(course)
    const sectionRows = rows
      .filter((row) => row.section_id === section.section_id)
      .sort((left, right) => exportStartDateMs(left) - exportStartDateMs(right))

    if (!plan?.events?.length) {
      kept.push(...sectionRows)
      continue
    }

    const semester = section.semester || semesterLookup.get(section.semester_id) || {}
    let currentWeek = null
    const usedRowIds = new Set()

    for (const event of plan.events) {
      if (currentWeek !== event.week_from) {
        currentWeek = event.week_from
        usedRowIds.clear()
      }

      const dates = resolvePhaseDateRange(semester, event.week_from, event.week_to)
      const matched = findTimetableRowForOfflineEvent(sectionRows, event, dates, usedRowIds)
      if (matched?.schedule_id) {
        usedRowIds.add(matched.schedule_id)
      }

      expanded.push({
        ...(matched || {}),
        section_id: section.section_id,
        section,
        period_count: event.duration ?? matched?.period_count ?? '',
        start_date: phaseDateToIso(dates.start_date),
        end_date: phaseDateToIso(dates.end_date),
        export_event_part: event.event_part,
        export_week_from: event.week_from,
        export_week_to: event.week_to,
        export_weekly_periods: event.weekly_periods ?? event.duration ?? '',
      })
    }
  }

  return [...kept, ...expanded]
}

function pickCanonicalOfflineSlot(rows = []) {
  const scheduled = rows.filter((row) => row.day_of_week && row.start_period)
  const pool = scheduled.length ? scheduled : rows

  const roomCounts = new Map()
  for (const row of pool) {
    const roomId = String(row.room_id || '')
    if (!roomId) continue
    roomCounts.set(roomId, (roomCounts.get(roomId) || 0) + 1)
  }

  let dominantRoom = null
  let dominantRoomCount = 0
  for (const [roomId, count] of roomCounts) {
    if (count > dominantRoomCount) {
      dominantRoomCount = count
      dominantRoom = roomId
    }
  }

  const roomPool = dominantRoom
    ? pool.filter((row) => String(row.room_id || '') === dominantRoom)
    : pool

  const counts = new Map()
  for (const row of roomPool) {
    const key = [
      String(row.room_id || ''),
      Number(row.day_of_week),
      Number(row.start_period),
      Number(row.period_count) || 3,
    ].join('|')
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  let bestKey = null
  let bestCount = 0
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestKey = key
    }
  }

  if (bestKey) {
    return roomPool.find((row) =>
      [
        String(row.room_id || ''),
        Number(row.day_of_week),
        Number(row.start_period),
        Number(row.period_count) || 3,
      ].join('|') === bestKey,
    ) || roomPool[0]
  }

  return roomPool[0]
}

/** Chỉ gộp 1 dòng khi mỗi tuần đúng 1 buổi (WEEKLY/BIWEEKLY/EVERY_N hoặc CUSTOM không trùng tuần). */
function canConsolidateOfflineExportForSection(section) {
  const course = section?.course || {}
  const plan = buildOfflineSchedulePlan(course)
  if (!plan?.events?.length || plan.events.length <= 1) {
    return false
  }

  const rhythm = String(course.offline_week_rhythm || OFFLINE_WEEK_RHYTHMS.WEEKLY).toUpperCase()

  if (rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM) {
    const plannedWeeks = parseOfflineWeekPlan(course.offline_active_weeks)
    if (!plannedWeeks.length) {
      return false
    }
    const sessionsPerWeek = new Map()
    for (const week of plannedWeeks) {
      sessionsPerWeek.set(week, (sessionsPerWeek.get(week) || 0) + 1);
    }
    if ([...sessionsPerWeek.values()].some((count) => count > 1)) {
      return false
    }
  }

  const weekNumbers = plan.events.map((event) => Number(event.week_from))
  if (weekNumbers.some((week) => !Number.isFinite(week))) {
    return false
  }

  if (new Set(weekNumbers).size !== weekNumbers.length) {
    return false
  }

  return plan.events.every(
    (event) => Number(event.week_from) === Number(event.week_to),
  )
}

/** Gộp nhiều buổi offline/tuần cùng lớp thành 1 dòng — chỉ khi mỗi tuần 1 buổi, cùng slot. */
function consolidateOfflineExportRows(
  rows,
  { semesterSections = [] } = {},
) {
  const sectionById = new Map(
    semesterSections.map((section) => [section.section_id, section]),
  )

  const offlineSectionIds = new Set(
    semesterSections
      .filter(shouldExpandSectionForOfflineExport)
      .map((section) => section.section_id),
  )

  if (!offlineSectionIds.size) {
    return rows
  }

  const offlineRows = rows.filter(
    (row) => offlineSectionIds.has(row.section_id) && row.export_week_from != null,
  )
  const otherRows = rows.filter(
    (row) => !(offlineSectionIds.has(row.section_id) && row.export_week_from != null),
  )

  const bySection = new Map()
  for (const row of offlineRows) {
    if (!bySection.has(row.section_id)) {
      bySection.set(row.section_id, [])
    }
    bySection.get(row.section_id).push(row)
  }

  const consolidated = []
  for (const [sectionId, group] of bySection) {
    if (group.length <= 1) {
      consolidated.push(...group)
      continue
    }

    const section = sectionById.get(sectionId) || group[0]?.section
    if (!canConsolidateOfflineExportForSection(section)) {
      consolidated.push(...group)
      continue
    }

    const canonical = pickCanonicalOfflineSlot(group)
    const weekNumbers = group.flatMap((row) => {
      const from = Number(row.export_week_from)
      const to = Number(row.export_week_to ?? row.export_week_from)
      if (!Number.isFinite(from)) return []
      if (Number.isFinite(to) && to > from) {
        return Array.from({ length: to - from + 1 }, (_, index) => from + index)
      }
      return [from]
    })

    const weekFrom = weekNumbers.length ? Math.min(...weekNumbers) : Number(group[0].export_week_from)
    const weekTo = weekNumbers.length ? Math.max(...weekNumbers) : Number(group[0].export_week_to ?? weekFrom)

    consolidated.push({
      ...canonical,
      section_id: canonical.section_id,
      section: canonical.section,
      export_week_from: weekFrom,
      export_week_to: weekTo,
      export_offline_consolidated: true,
      export_event_part: undefined,
    })
  }

  return [...otherRows, ...consolidated]
}

function parseEventPartFromEventId(eventId) {
  const match = String(eventId || '').match(/_Part(\d+)$/i)
  return match ? Number(match[1]) : null
}

function isSchedulableEventCovered(sectionId, event, rows, semester) {
  const dates = resolvePhaseDateRange(semester, event.week_from, event.week_to)

  for (const row of rows) {
    if (row.section_id !== sectionId) {
      continue
    }

    if (row.export_event_part === event.event_part) {
      return true
    }

    const rowPart = parseEventPartFromEventId(row.event_id)
    if (rowPart === event.event_part) {
      return true
    }

    if (
      row.day_of_week
      && row.start_period
      && row.start_date
      && row.end_date
      && dateRangesOverlap(
        row.start_date,
        row.end_date,
        dates.start_date,
        dates.end_date,
      )
    ) {
      return true
    }
  }

  return false
}

function createSchedulablePlaceholderRow(section, event, semesterLookup, waves = []) {
  const semester = section?.semester || semesterLookup.get(section?.semester_id) || {}
  const waveStartWeek = resolveWaveStartWeek(section, waves)
  const offsetEvent = applyWaveWeekOffset([event], waveStartWeek)[0] || event
  const weekFrom = offsetEvent.week_from ?? waveStartWeek
  const weekTo = offsetEvent.week_to ?? weekFrom
  const dates = resolvePhaseDateRange(semester, weekFrom, weekTo)

  return {
    section_id: section.section_id,
    section,
    room_id: null,
    day_of_week: '',
    start_period: '',
    period_count: event.duration ?? '',
    start_date: phaseDateToIso(dates.start_date),
    end_date: phaseDateToIso(dates.end_date),
    export_event_part: event.event_part,
    export_week_from: offsetEvent.week_from,
    export_week_to: offsetEvent.week_to,
    export_weekly_periods: event.weekly_periods ?? event.duration ?? '',
    export_unscheduled: true,
  }
}

/** Bổ sung buổi cần xếp lịch nhưng chưa có slot (AI unscheduled hoặc chưa chạy solver).
 *  Luôn chạy theo toàn bộ semesterSections — kể cả solver báo X buổi chưa xếp, export vẫn
 *  có dòng placeholder (Thứ/Tiết/Phòng trống) phục vụ đánh giá/mô phỏng. */
function appendMissingSchedulableExportRows(
  rows,
  {
    semesterSections = [],
    semesterLookup = new Map(),
    unscheduledClasses = [],
    sectionLookup = new Map(),
    waves = [],
  } = {},
) {
  const result = [...rows]
  const coveredKeys = new Set()

  const markCovered = (sectionId, part) => {
    if (sectionId && part != null && part !== '') {
      coveredKeys.add(`${sectionId}_Part${part}`)
    }
  }

  for (const row of result) {
    if (row.export_offline_consolidated) {
      const section = sectionLookup.get(row.section_id) || row.section
      const events = buildSchedulingEventsForSection(section)
      for (const event of events) {
        markCovered(row.section_id, event.event_part)
      }
      continue
    }

    if (row.export_event_part != null && row.export_event_part !== '') {
      markCovered(row.section_id, row.export_event_part)
    }
    const part = parseEventPartFromEventId(row.event_id)
    if (part != null) {
      markCovered(row.section_id, part)
    }
  }

  for (const section of semesterSections) {
    if (isAsyncOnlineExportSection(section)) {
      continue
    }

    const events = buildSchedulingEventsForSection(section)
    const semester = section.semester || semesterLookup.get(section.semester_id) || {}

    for (const event of events) {
      const key = `${section.section_id}_Part${event.event_part}`
      if (coveredKeys.has(key)) {
        continue
      }
      if (isSchedulableEventCovered(section.section_id, event, result, semester)) {
        markCovered(section.section_id, event.event_part)
        continue
      }

      result.push(createSchedulablePlaceholderRow(section, event, semesterLookup, waves))
      markCovered(section.section_id, event.event_part)
    }
  }

  for (const item of unscheduledClasses) {
    const sectionId = item.section_id
    if (!sectionId) {
      continue
    }

    const part = parseEventPartFromEventId(item.event_id)
    const key = part != null ? `${sectionId}_Part${part}` : sectionId
    if (coveredKeys.has(key)) {
      continue
    }

    const section = sectionLookup.get(sectionId)
      || result.find((row) => row.section_id === sectionId)?.section
      || { section_id: sectionId, class_type: item.class_type }
    const events = buildSchedulingEventsForSection(section)
    const event = part != null
      ? events.find((entry) => entry.event_part === part)
      : null

    if (event) {
      result.push(createSchedulablePlaceholderRow(section, event, semesterLookup, waves))
    } else {
      const { startDate, endDate } = resolveSectionDateRange(section, semesterLookup, waves)
      result.push({
        section_id: sectionId,
        section,
        room_id: null,
        day_of_week: '',
        start_period: '',
        period_count: '',
        start_date: startDate,
        end_date: endDate,
        export_event_part: part ?? '',
        export_unscheduled: true,
      })
    }

    if (part != null) {
      markCovered(sectionId, part)
    } else {
      coveredKeys.add(sectionId)
    }
  }

  return result
}

/**
 * Chuẩn bị dữ liệu xuất TKB: đã xếp + online async + buổi thiếu slot (unscheduled).
 * Buổi chưa xếp vẫn có trong file Excel (cột Thứ/Tiết/Phòng để trống) để làm số liệu đánh giá.
 */
export const prepareTimetablesForExport = (
  rows,
  sectionLookup = new Map(),
  { semesterSections = [], semesterLookup = new Map(), unscheduledClasses = [], waves = [] } = {},
) => {
  const scheduledSectionIds = new Set(rows.map((row) => row.section_id))

  const virtualRows = semesterSections
    .filter((section) =>
      isAsyncOnlineExportSection(section)
      && !scheduledSectionIds.has(section.section_id))
    .map((section) => {
      const { startDate, endDate } = resolveSectionDateRange(section, semesterLookup, waves)
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

  const mergedRows = consolidateOfflineExportRows(
    appendMissingSchedulableExportRows(
      expandOfflineSessionExportRows(
        [...rows, ...virtualRows],
        { semesterSections, semesterLookup },
      ),
      {
        semesterSections,
        semesterLookup,
        unscheduledClasses,
        sectionLookup,
        waves,
      },
    ),
    { semesterSections },
  )

  return sortTimetablesForExport(mergedRows, sectionLookup)
}
