export const ROOM_TYPE_LABELS = {
  LT: 'Giảng đường lý thuyết',
  PM: 'Phòng máy tính',
  TN: 'Phòng thí nghiệm',
  SB: 'Sân bãi / Nhà thể chất',
  XT: 'Xưởng thực hành',
  BV: 'Bệnh viện',
  DN: 'Doanh nghiệp',
  ONLINE: 'Trực tuyến',
  // Legacy codes (dữ liệu cũ)
  TH: 'Thực hành (TH)',
  LAB: 'Phòng Lab (LAB)',
}

export const ROOM_TYPE_COLORS = {
  LT: 'blue',
  PM: 'geekblue',
  TN: 'purple',
  SB: 'green',
  XT: 'orange',
  BV: 'magenta',
  DN: 'gold',
  ONLINE: 'cyan',
  TH: 'green',
  LAB: 'purple',
}

export const ROOM_TYPE_OPTIONS = [
  { value: 'LT', label: 'LT — Giảng đường lý thuyết' },
  { value: 'PM', label: 'PM — Phòng máy tính' },
  { value: 'TN', label: 'TN — Phòng thí nghiệm' },
  { value: 'SB', label: 'SB — Sân bãi / Nhà thể chất' },
  { value: 'XT', label: 'XT — Xưởng thực hành' },
  { value: 'BV', label: 'BV — Bệnh viện' },
  { value: 'DN', label: 'DN — Doanh nghiệp' },
  { value: 'ONLINE', label: 'ONLINE — Trực tuyến' },
]

export const VIRTUAL_ROOM_TYPES = new Set(['ONLINE'])

export const COMBINED_ROOM_TYPES = new Set(['PM'])

export const VIRTUAL_TIMETABLE_ROOM_IDS = new Set(['ONLINE', 'ONLINE_VIRTUAL'])

const SKIP_ROOM_TYPE_SUFFIX = new Set(['LT', 'STD', 'STANDARD'])
const COMPUTER_LAB_ROOM_TYPES = new Set(['PC', 'PM', 'LAB', 'TH'])
const ROOM_ID_TYPE_MARKER_RE = /\((?:PC|PM|LT|TN|LAB|TH|STD|SB|XT|BV|DN)\)/i

function roomIdAlreadyHasTypeMarker(roomId) {
  return ROOM_ID_TYPE_MARKER_RE.test(String(roomId || ''))
}

function roomIdContainsPcMarker(roomId) {
  const id = String(roomId || '').trim().toUpperCase()
  if (!id) return false
  return id.includes('(PC)') || id.startsWith('PC') || id.includes('-PC') || /\bPC\d/.test(id)
}

function shouldAppendRoomTypeSuffix(roomId, roomType) {
  if (roomIdAlreadyHasTypeMarker(roomId)) {
    return false
  }

  const type = String(roomType || '').trim().toUpperCase()
  if (!type || SKIP_ROOM_TYPE_SUFFIX.has(type)) {
    return false
  }

  const id = String(roomId || '').trim().toUpperCase()
  if (id.includes(type)) {
    return false
  }

  if (type === 'PM' && roomIdContainsPcMarker(roomId)) {
    return false
  }

  if (COMPUTER_LAB_ROOM_TYPES.has(type) && roomIdContainsPcMarker(roomId)) {
    return false
  }

  return true
}

export function isOnlineRoomType(roomType) {
  return String(roomType || '').trim().toUpperCase() === 'ONLINE'
}

import { parseSectionGroupCode, isCourseraBaseGroupCode } from '../utils/sectionClassType'
import { isAsyncOnlineExportSection } from '../utils/sectionExportFormat'

export function isElearningSection(record) {
  return isAsyncOnlineExportSection(record)
}

export function formatTimetableRoom(roomId, record, roomLookup) {
  const normalizedRoomId = String(roomId || '').trim().toUpperCase()
  if (VIRTUAL_TIMETABLE_ROOM_IDS.has(normalizedRoomId)) {
    return 'ONLINE- Elearning'
  }

  const groupCode = parseSectionGroupCode(record?.section_id)
  if (isCourseraBaseGroupCode(groupCode) && !roomId) {
    return ''
  }

  if (isAsyncOnlineExportSection(record) && !roomId) {
    return 'ONLINE- Elearning'
  }

  if (!roomId) {
    return '—'
  }

  const lookup = roomLookup instanceof Map ? roomLookup : null
  const room = lookup?.get(roomId)
  const roomType = String(room?.room_type || '').trim().toUpperCase()
  if (shouldAppendRoomTypeSuffix(roomId, roomType)) {
    return `${roomId} (${roomType})`
  }

  return roomId
}

export function isCombinedRoomType(roomType) {
  return COMBINED_ROOM_TYPES.has(String(roomType || '').trim().toUpperCase())
}

export function formatRoomType(roomType) {
  if (!roomType) return '—'
  return ROOM_TYPE_LABELS[roomType] || roomType
}

export function getRoomTypeColor(roomType) {
  return ROOM_TYPE_COLORS[roomType] || 'default'
}
