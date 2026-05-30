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

export function isOnlineRoomType(roomType) {
  return String(roomType || '').trim().toUpperCase() === 'ONLINE'
}

import { normalizeDeliveryChannel, DELIVERY_CHANNELS } from './deliveryChannels'
import { parseSectionGroupCode, isCourseraBaseGroupCode } from '../utils/sectionClassType'

export function isElearningSection(record) {
  const roomType =
    record?.room_type_req || record?.course?.default_room_type || record?.course?.room_type
  if (isOnlineRoomType(roomType)) return true

  const groupCode = parseSectionGroupCode(record?.section_id)
  if (isCourseraBaseGroupCode(groupCode)) return true
  if (/^ELN\d+$/i.test(groupCode)) return true

  const classType = String(record?.class_type || '').toUpperCase()
  if (['ELN', 'ELN0', 'ONLINE_ELEARNING', 'ONLINE_COURSERA', 'ELEARNING', 'COURSERA'].includes(classType)) {
    return true
  }

  const channel = normalizeDeliveryChannel(record?.course?.class_type)
  return channel === DELIVERY_CHANNELS.ELEARNING
    || channel === DELIVERY_CHANNELS.COURSERA
    || channel === DELIVERY_CHANNELS.HYBRID
}

export function formatTimetableRoom(roomId, record) {
  const normalizedRoomId = String(roomId || '').trim().toUpperCase()
  if (VIRTUAL_TIMETABLE_ROOM_IDS.has(normalizedRoomId)) {
    return 'ONLINE- Elearning'
  }

  const groupCode = parseSectionGroupCode(record?.section_id)
  if (isCourseraBaseGroupCode(groupCode) && !roomId) {
    return ''
  }

  if (isElearningSection(record) && !roomId) {
    const channel = normalizeDeliveryChannel(record?.course?.class_type)
    if (channel === DELIVERY_CHANNELS.COURSERA && isCourseraBaseGroupCode(groupCode)) {
      return ''
    }
    return 'ONLINE- Elearning'
  }
  if (!roomId) return '—'
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
