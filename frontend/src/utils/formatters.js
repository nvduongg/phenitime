export const DAY_LABELS = {
  2: 'Thứ 2',
  3: 'Thứ 3',
  4: 'Thứ 4',
  5: 'Thứ 5',
  6: 'Thứ 6',
  7: 'Thứ 7',
  8: 'Chủ nhật',
}

export const DAY_TAG_COLORS = {
  2: 'blue',
  3: 'cyan',
  4: 'geekblue',
  5: 'purple',
  6: 'magenta',
  7: 'orange',
  8: 'red',
}

export const getErrorMessage = (error) => {
  const data = error?.response?.data
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }
  if (data?.message) {
    return formatApiDetail(data.message)
  }
  if (data?.detail) {
    return formatApiDetail(data.detail)
  }
  return error?.message || 'Đã xảy ra lỗi không xác định'
}

function formatApiDetail(detail) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.msg) {
          const location = Array.isArray(item.loc) ? item.loc.join('.') : ''
          return location ? `${location}: ${item.msg}` : item.msg
        }
        return JSON.stringify(item)
      })
      .join('; ')
  }
  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail)
  }
  return String(detail ?? '')
}

export const formatDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('vi-VN')
}

/** Hiển thị tín chỉ: 3 → "3", 2.5 → "2.5" */
export const formatCredits = (value) => {
  if (value == null || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  if (Number.isInteger(num)) return String(num)
  return String(parseFloat(num.toFixed(2)))
}

export const formatDayOfWeek = (day) => DAY_LABELS[day] || `Thứ ${day}`

export {
  CLASS_TYPE_LABELS,
  CLASS_TYPE_OPTIONS,
  formatClassType,
  getClassTypeColor,
} from '../constants/classTypes'

export {
  ROOM_TYPE_LABELS,
  ROOM_TYPE_OPTIONS,
  formatRoomType,
  formatTimetableRoom,
  getRoomTypeColor,
  isElearningSection,
  isOnlineRoomType,
} from '../constants/roomTypes'

export {
  LEARNING_MODES,
  getLearningMode,
  renderLearningModeTag,
  resolveSectionLearningMode,
} from '../constants/learningModes'

export {
  buildProgramSemesterOptions,
  formatCohortLabel,
  formatMajorLabel,
  formatMajorOptionLabel,
  formatProgramSemester,
} from '../utils/programSemester'

export { buildExportFilename, exportToExcel } from './excelExport'
export { formatLecturerParen } from './exportFormatters'
