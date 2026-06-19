import { DAY_LABELS } from './formatters'
import { TIMETABLE_DAYS } from './timetableGrid'
import { normalizeLearningType } from '../constants/learningModes'

export const SCHEDULING_STATUS_COLORS = {
  strict: '#52c41a',
  relaxed: '#fa8c16',
  unscheduled: '#ff4d4f',
}

export const LEARNING_MODE_CHART_COLORS = {
  LT: '#1677ff',
  TH: '#13c2c2',
  ONLINE: '#722ed1',
  OTHER: '#94a3b8',
}

const VIRTUAL_ROOM_PATTERN = /^(ONLINE|MsTeam|ELN|MSTEAM)/i

export const DUMMY_SCHEDULING_KPIS = {
  total: 0,
  strict: 0,
  relaxed: 0,
  unscheduled: 0,
}

export const DUMMY_SUCCESS_RATE = []

export const DUMMY_LEARNING_MODES = []

export const DUMMY_ROOM_OCCUPANCY = TIMETABLE_DAYS.map((day) => ({
  day,
  label: DAY_LABELS[day],
  utilizedRooms: 0,
  bookings: 0,
}))

function isVirtualRoom(roomId, roomType) {
  const normalizedType = normalizeLearningType(roomType)
  if (normalizedType === 'ONLINE') return true
  const id = String(roomId || '').trim()
  return VIRTUAL_ROOM_PATTERN.test(id) || /elearning|msteam|online/i.test(id)
}

export function resolveLearningModeBucket(classType) {
  const normalized = normalizeLearningType(classType)
  if (!normalized) return 'OTHER'
  if (normalized === 'LT' || normalized === 'STD' || normalized === 'STANDARD') return 'LT'
  if (['TH', 'PC', 'PM', 'LAB', 'TN', 'VJ', 'MED'].includes(normalized)) return 'TH'
  if (
    normalized === 'ONLINE'
    || normalized === 'ELN'
    || normalized === 'DA'
    || normalized === 'TT'
    || normalized.includes('ELEARNING')
    || normalized.includes('COURSERA')
  ) {
    return 'ONLINE'
  }
  return 'OTHER'
}

export function normalizeSnapshotRow(row = {}) {
  return {
    event_id: row.event_id,
    section_id: row.section_id,
    room_id: row.room_id,
    day: row.day ?? row.day_of_week,
    start_period: row.start_period,
    period_count: row.period_count ?? 3,
    is_relaxed: Boolean(row.is_relaxed),
    relaxation_reason: row.relaxation_reason || null,
    class_type: row.class_type || null,
  }
}

export function normalizeTimetableApiRow(row = {}) {
  const roomId = row.room_id ?? row.room?.room_id
  const roomType = row.room?.room_type
  return {
    event_id: row.event_id || `${row.section_id}_${row.schedule_id}`,
    section_id: row.section_id ?? row.section?.section_id,
    room_id: roomId,
    day: row.day_of_week,
    start_period: row.start_period,
    period_count: row.period_count ?? 3,
    is_relaxed: Boolean(row.is_relaxed),
    class_type: row.section?.class_type || row.class_type,
    room_type: roomType,
    is_virtual_room: isVirtualRoom(roomId, roomType),
  }
}

export function enrichSnapshotRows(snapshot = [], timetables = [], rooms = []) {
  const sectionTypeById = new Map()
  ;(timetables || []).forEach((item) => {
    const sectionId = item.section?.section_id || item.section_id
    if (sectionId) {
      sectionTypeById.set(sectionId, item.section?.class_type)
    }
  })

  const roomTypeById = new Map(
    (rooms || []).map((room) => [room.room_id, room.room_type]),
  )

  return snapshot.map((row) => {
    const normalized = normalizeSnapshotRow(row)
    const roomType = roomTypeById.get(normalized.room_id)
    return {
      ...normalized,
      class_type: normalized.class_type || sectionTypeById.get(normalized.section_id),
      is_virtual_room: isVirtualRoom(normalized.room_id, roomType),
    }
  })
}

export function buildSchedulingRows({ timetableSnapshot = [], timetables = [], rooms = [], semesterId }) {
  if (timetableSnapshot.length > 0) {
    return enrichSnapshotRows(timetableSnapshot, timetables, rooms)
  }

  const sourceRows = semesterId
    ? (timetables || []).filter((item) => item.section?.semester_id === semesterId)
    : timetables || []

  return sourceRows
    .map(normalizeTimetableApiRow)
    .filter((row) => row.day != null && row.room_id)
}

export function buildDashboardMetrics({
  timetableSnapshot = [],
  timetables = [],
  unscheduledClasses = [],
  rooms = [],
  semesterId = null,
}) {
  const schedulingRows = buildSchedulingRows({
    timetableSnapshot,
    timetables,
    rooms,
    semesterId,
  })
  const unscheduled = Array.isArray(unscheduledClasses) ? unscheduledClasses : []

  const strict = schedulingRows.filter((row) => !row.is_relaxed).length
  const relaxed = schedulingRows.filter((row) => Boolean(row.is_relaxed)).length
  const unscheduledCount = unscheduled.length
  const total = strict + relaxed + unscheduledCount

  const successRateData = [
    {
      name: 'Xếp chuẩn',
      value: strict,
      color: SCHEDULING_STATUS_COLORS.strict,
    },
    {
      name: 'Linh động',
      value: relaxed,
      color: SCHEDULING_STATUS_COLORS.relaxed,
    },
    {
      name: 'Chưa xếp',
      value: unscheduledCount,
      color: SCHEDULING_STATUS_COLORS.unscheduled,
    },
  ].filter((item) => item.value > 0)

  const learningModeCounts = {
    LT: 0,
    TH: 0,
    ONLINE: 0,
    OTHER: 0,
  }

  const bumpLearningMode = (classType) => {
    const bucket = resolveLearningModeBucket(classType)
    learningModeCounts[bucket] += 1
  }

  schedulingRows.forEach((row) => bumpLearningMode(row.class_type))
  unscheduled.forEach((item) => bumpLearningMode(item.class_type))

  const learningModesData = [
    {
      name: 'Lý thuyết (LT)',
      key: 'LT',
      count: learningModeCounts.LT,
      fill: LEARNING_MODE_CHART_COLORS.LT,
    },
    {
      name: 'Thực hành (TH)',
      key: 'TH',
      count: learningModeCounts.TH,
      fill: LEARNING_MODE_CHART_COLORS.TH,
    },
    {
      name: 'Trực tuyến',
      key: 'ONLINE',
      count: learningModeCounts.ONLINE,
      fill: LEARNING_MODE_CHART_COLORS.ONLINE,
    },
  ].filter((item) => item.count > 0)

  if (learningModeCounts.OTHER > 0) {
    learningModesData.push({
      name: 'Khác',
      key: 'OTHER',
      count: learningModeCounts.OTHER,
      fill: LEARNING_MODE_CHART_COLORS.OTHER,
    })
  }

  const physicalRoomTotal = (rooms || []).filter(
    (room) => !isVirtualRoom(room.room_id, room.room_type),
  ).length

  const roomOccupancyByDay = TIMETABLE_DAYS.map((day) => {
    const dayRows = schedulingRows.filter(
      (row) => Number(row.day) === day && !row.is_virtual_room,
    )
    const utilizedRoomIds = new Set(
      dayRows.map((row) => row.room_id).filter(Boolean),
    )
    const bookings = dayRows.length
    const utilizedRooms = utilizedRoomIds.size
    const utilizationPct = physicalRoomTotal > 0
      ? Math.round((utilizedRooms / physicalRoomTotal) * 100)
      : 0

    return {
      day,
      label: DAY_LABELS[day] || `Thứ ${day}`,
      utilizedRooms,
      bookings,
      periodHours: bookings * 3,
      utilizationPct,
      physicalRoomTotal,
    }
  })

  const hasLiveData = total > 0 || schedulingRows.length > 0

  return {
    hasLiveData,
    kpis: {
      total,
      strict,
      relaxed,
      unscheduled: unscheduledCount,
    },
    successRateData,
    learningModesData,
    roomOccupancyByDay,
    physicalRoomTotal,
    scheduledSessions: schedulingRows.length,
    successRatePct: total > 0 ? Math.round(((strict + relaxed) / total) * 100) : 0,
  }
}
