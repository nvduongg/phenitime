import { DAY_LABELS } from './formatters'

export const TIMETABLE_DAYS = [2, 3, 4, 5, 6, 7]

export const TIMETABLE_SHIFTS = [
  { key: 'ca1', label: 'Ca 1', subtitle: 'Tiết 1-3', startPeriod: 1 },
  { key: 'ca2', label: 'Ca 2', subtitle: 'Tiết 4-6', startPeriod: 4 },
  { key: 'ca3', label: 'Ca 3', subtitle: 'Tiết 7-9', startPeriod: 7 },
  { key: 'ca4', label: 'Ca 4', subtitle: 'Tiết 10-12', startPeriod: 10 },
  { key: 'ca5', label: 'Ca Tối', subtitle: 'Tiết 13-15', startPeriod: 13 },
]

export const SCHEDULER_RESULT_STORAGE_KEY = 'phenitime:lastSchedulerResult'

export function saveSchedulerResult(payload) {
  try {
    sessionStorage.setItem(SCHEDULER_RESULT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private mode errors
  }
}

export function loadSchedulerResult() {
  try {
    const raw = sessionStorage.getItem(SCHEDULER_RESULT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function buildTimetableRowFromCreate({ created, section, room }) {
  return {
    ...created,
    section: created.section || section || null,
    room: created.room || room || null,
  }
}

export function normalizeGridEvent(row) {
  const section = row.section || {}
  const studentGroups = section.student_groups || []

  return {
    id: row.schedule_id ?? `${row.section_id}-${row.day_of_week}-${row.start_period}`,
    section_id: row.section_id,
    course_id: section.course_id || section.course?.course_id,
    course_name: section.course?.course_name,
    room_id: row.room_id,
    lecturer_id: section.lecturer_id || section.lecturer?.lecturer_id,
    lecturer_name: section.lecturer?.lecturer_name,
    day: Number(row.day_of_week ?? row.day),
    start_period: Number(row.start_period),
    duration: Number(row.period_count ?? row.duration ?? 3),
    student_group_ids: studentGroups.map((group) => group.group_id).filter(Boolean),
    student_group_labels: studentGroups.map((group) => group.group_id).filter(Boolean),
  }
}

export function getShiftKeyForStartPeriod(startPeriod) {
  const period = Number(startPeriod)
  if (!period || Number.isNaN(period)) return null

  const exact = TIMETABLE_SHIFTS.find((item) => item.startPeriod === period)
  if (exact) return exact.key

  const shift = TIMETABLE_SHIFTS.find((item) => {
    const end = item.startPeriod + 2
    return period >= item.startPeriod && period <= end
  })
  return shift?.key || null
}

export function buildGridLookup(events) {
  const lookup = {}

  events.forEach((event) => {
    const shiftKey = getShiftKeyForStartPeriod(event.start_period)
    if (!shiftKey || !event.day) return

    const cellKey = `${shiftKey}-${event.day}`
    if (!lookup[cellKey]) lookup[cellKey] = []
    lookup[cellKey].push(event)
  })

  Object.values(lookup).forEach((cellEvents) => {
    cellEvents.sort((a, b) => a.section_id.localeCompare(b.section_id, 'vi'))
  })

  return lookup
}

export function filterGridEvents(events, filters = {}) {
  const { lecturerId, roomId, studentGroupId, courseId } = filters

  return events.filter((event) => {
    if (courseId && event.course_id !== courseId) return false
    if (lecturerId && event.lecturer_id !== lecturerId) return false
    if (roomId && event.room_id !== roomId) return false
    if (studentGroupId && !event.student_group_ids.includes(studentGroupId)) return false
    return true
  })
}

/** Buổi vừa xếp tay luôn hiện trên lưới (ô đã thả), kể cả khi bộ lọc tạm chưa khớp. */
export function mergeGridEventsWithPins(filteredEvents, pinnedEvents = []) {
  const merged = new Map(filteredEvents.map((event) => [String(event.id), event]))
  pinnedEvents.forEach((event) => {
    merged.set(String(event.id), event)
  })
  return [...merged.values()]
}

function formatCourseOptionLabel(courseId, courseName) {
  return courseName ? `${courseId} — ${courseName}` : courseId
}

export function buildFilterOptions(events, { extraSections = [] } = {}) {
  const lecturerMap = new Map()
  const roomSet = new Set()
  const groupSet = new Set()
  const courseMap = new Map()

  events.forEach((event) => {
    if (event.course_id) {
      courseMap.set(
        event.course_id,
        formatCourseOptionLabel(event.course_id, event.course_name),
      )
    }
    if (event.lecturer_id) {
      lecturerMap.set(
        event.lecturer_id,
        event.lecturer_name
          ? `${event.lecturer_name} (${event.lecturer_id})`
          : event.lecturer_id,
      )
    }
    if (event.room_id) roomSet.add(event.room_id)
    event.student_group_ids.forEach((groupId) => groupSet.add(groupId))
  })

  extraSections.forEach((section) => {
    const courseId = section.course_id || section.course?.course_id
    if (!courseId || courseMap.has(courseId)) return
    courseMap.set(
      courseId,
      formatCourseOptionLabel(courseId, section.course?.course_name),
    )
  })

  return {
    courseOptions: [...courseMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    lecturerOptions: [...lecturerMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    roomOptions: [...roomSet]
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map((value) => ({ value, label: value })),
    studentGroupOptions: [...groupSet]
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map((value) => ({ value, label: value })),
  }
}

export function getDayLabel(day) {
  return DAY_LABELS[day] || `Thứ ${day}`
}
