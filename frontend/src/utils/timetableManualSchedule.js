import { resolveWaveStartWeek } from './semesterWaves'
import { resolvePhaseDateRange } from './scheduleRhythm'

const THEORY_ROOMS = new Set(['LT', 'STD', 'STANDARD', ''])
const COMPUTER_LAB_ROOMS = new Set(['PC', 'PM', 'LAB'])
const MEDICAL_ROOMS = new Set(['MED', 'BV', 'VJ'])

export const DRAG_MIME = 'application/x-phenitime-unscheduled'

export function parseEventPart(eventId = '') {
  const match = String(eventId).match(/_Part(\d+)$/i)
  return match ? Number(match[1]) : 1
}

export function formatEventPartLabel(eventId = '') {
  const part = parseEventPart(eventId)
  return part > 1 ? `Part${part}` : 'Part1'
}

export function isRoomTypeCompatible(roomType, required) {
  const room = String(roomType || '').trim().toUpperCase()
  const req = String(required || 'LT').trim().toUpperCase()

  if (req === 'ONLINE') {
    return room === 'ONLINE'
  }
  if (room === 'ONLINE') {
    return req === 'ONLINE'
  }
  if (THEORY_ROOMS.has(req) && THEORY_ROOMS.has(room)) {
    return true
  }
  if (COMPUTER_LAB_ROOMS.has(req)) {
    return COMPUTER_LAB_ROOMS.has(room)
  }
  if (req === 'MED') {
    return MEDICAL_ROOMS.has(room)
  }
  return room === req
}

export function getShiftFromCell(shiftKey) {
  return TIMETABLE_SHIFTS.find((shift) => shift.key === shiftKey) || null
}

export function periodsOverlap(startA, durationA, startB, durationB) {
  const endA = startA + durationA - 1
  const endB = startB + durationB - 1
  return startA <= endB && startB <= endA
}

export function normalizeTimetableRow(row) {
  const section = row.section || {}
  const studentGroups = section.student_groups || []

  return {
    schedule_id: row.schedule_id,
    section_id: row.section_id,
    room_id: row.room_id,
    day_of_week: Number(row.day_of_week),
    start_period: Number(row.start_period),
    period_count: Number(row.period_count ?? 3),
    lecturer_id: section.lecturer_id || section.lecturer?.lecturer_id,
    student_group_ids: studentGroups.map((group) => group.group_id).filter(Boolean),
  }
}

export function getCompatibleRooms(rooms, section, { onlyPhysical = true } = {}) {
  const required = section?.room_type_req
    || section?.course?.default_room_type
    || section?.course?.room_type
    || 'LT'
  const minCapacity = Number(section?.capacity) || 0

  return rooms.filter((room) => {
    const roomType = String(room.room_type || '').trim().toUpperCase()
    if (onlyPhysical && roomType === 'ONLINE') {
      return false
    }
    if (minCapacity > 0 && Number(room.capacity) < minCapacity) {
      return false
    }
    return isRoomTypeCompatible(roomType, required)
  })
}

export function validateDropPlacement({
  timetables,
  section,
  day,
  startPeriod,
  periodCount = 3,
  roomId,
  eventId,
}) {
  const warnings = []
  const errors = []
  const rows = timetables.map(normalizeTimetableRow)
  const sectionId = section?.section_id
  const lecturerId = section?.lecturer_id || section?.lecturer?.lecturer_id
  const groupIds = (section?.student_groups || []).map((group) => group.group_id).filter(Boolean)

  if (!sectionId) {
    errors.push('Không tìm thấy lớp học phần.')
    return { errors, warnings }
  }

  const sameDaySection = rows.filter(
    (row) => row.section_id === sectionId && row.day_of_week === day,
  )
  if (sameDaySection.length > 0) {
    errors.push(
      `HC6: Lớp ${sectionId} đã có ca khác vào ${formatDayShort(day)} — chọn thứ khác.`,
    )
  }

  rows.forEach((row) => {
    if (!periodsOverlap(startPeriod, periodCount, row.start_period, row.period_count)) {
      return
    }
    if (row.day_of_week !== day) {
      return
    }

    if (row.room_id === roomId) {
      errors.push(`Phòng ${roomId} đã có lịch trùng ca này.`)
    }
    if (lecturerId && row.lecturer_id === lecturerId) {
      errors.push(`GV ${lecturerId} đã có lịch trùng ca này.`)
    }
    if (groupIds.some((groupId) => row.student_group_ids.includes(groupId))) {
      errors.push('Nhóm sinh viên đã có lịch trùng ca này.')
    }
  })

  const part = parseEventPart(eventId)
  const siblingParts = rows.filter((row) => row.section_id === sectionId)
  const scheduledParts = new Set(
    siblingParts.map((row) => {
      const match = String(row.section_id).match(/_Part(\d+)/)
      return match ? Number(match[1]) : null
    }),
  )

  if (siblingParts.length > 0 && part > 1) {
    const hasEarlierPart = siblingParts.some((row) => row.day_of_week !== day)
    if (!hasEarlierPart && sameDaySection.length === 0) {
      warnings.push('Gợi ý: Ca Part1 thường nên ở thứ khác (theo TKB mẫu).')
    }
  }

  if (scheduledParts.has(part)) {
    warnings.push(`Part${part} có thể đã được xếp (kiểm tra lại danh sách TKB).`)
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

function formatDayShort(day) {
  const labels = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7' }
  return labels[day] || `Thứ ${day}`
}

export function resolveSemesterDateRange(semester) {
  if (!semester?.start_date || !semester?.end_date) {
    return { startDate: null, endDate: null }
  }
  return {
    startDate: semester.start_date.slice(0, 10),
    endDate: semester.end_date.slice(0, 10),
  }
}

function formatPersistDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildManualTimetablePayload({
  section,
  roomId,
  day,
  startPeriod,
  periodCount = 3,
  semester,
  waves = [],
  defaultTeachingWeeks = 10,
}) {
  const waveStartWeek = resolveWaveStartWeek(section, waves)
  const weekTo = waveStartWeek + Math.max(Number(defaultTeachingWeeks) || 10, 1) - 1
  const phaseDates = semester?.start_date
    ? resolvePhaseDateRange(semester, waveStartWeek, weekTo)
    : null
  const fallbackDates = resolveSemesterDateRange(semester)

  return {
    section_id: section.section_id,
    room_id: roomId,
    day_of_week: day,
    start_period: startPeriod,
    period_count: periodCount,
    start_date: formatPersistDate(phaseDates?.start_date) || fallbackDates.startDate,
    end_date: formatPersistDate(phaseDates?.end_date) || fallbackDates.endDate,
  }
}

export function removeUnscheduledEvent(unscheduledList, eventId) {
  return unscheduledList.filter((item) => item.event_id !== eventId)
}
