import { normalizeDeliveryChannel, DELIVERY_CHANNELS } from '../constants/deliveryChannels'
import { normalizeLearningType } from '../constants/learningModes'
import { parseSectionGroupCode, isCourseraBaseGroupCode, isCourseraPracticeGroupCode } from './sectionClassType'

const SECTION_ID_RE = /^(.+)\(([^)]+)\)$/

export function parseSectionIdParts(sectionId) {
  const id = String(sectionId ?? '').trim()
  const match = id.match(SECTION_ID_RE)
  if (!match) {
    return { prefix: id, groupCode: '' }
  }
  return { prefix: match[1], groupCode: match[2] }
}

/**
 * Map internal group codes to TKB export convention.
 * ELN01 → N01.ELN0 (matches real files: …-25(N01.ELN0))
 * COUR01 / COUR01.TH1 / N01 / N01.TH1 → giữ nguyên
 */
export function formatGroupCodeForExport(groupCode) {
  const code = String(groupCode || '').trim()
  if (!code) return code

  const elnMatch = code.match(/^ELN(\d+)$/i)
  if (elnMatch) {
    return `N${elnMatch[1]}.ELN0`
  }

  return code
}

export function formatSectionIdForExport(sectionOrId) {
  const sectionId = typeof sectionOrId === 'string'
    ? sectionOrId
    : sectionOrId?.section_id
  const { prefix, groupCode } = parseSectionIdParts(sectionId)
  if (!groupCode) return String(sectionId || '')
  return `${prefix}(${formatGroupCodeForExport(groupCode)})`
}

export function isAsyncOnlineExportSection(section) {
  if (!section) return false

  const groupCode = parseSectionGroupCode(section.section_id)
  if (isCourseraPracticeGroupCode(groupCode)) return false

  if (normalizeLearningType(section.room_type_req) === 'ONLINE') {
    return true
  }

  if (isCourseraBaseGroupCode(groupCode)) {
    return true
  }

  if (/^ELN\d+$/i.test(groupCode)) {
    return true
  }

  const channel = normalizeDeliveryChannel(section.course?.class_type)
  if (channel === DELIVERY_CHANNELS.ELEARNING) {
    return normalizeLearningType(section.room_type_req) === 'ONLINE'
      || /^ELN\d+$/i.test(groupCode)
  }

  if (channel === DELIVERY_CHANNELS.COURSERA && isCourseraBaseGroupCode(groupCode)) {
    return true
  }

  if (channel === DELIVERY_CHANNELS.HYBRID && /^ELN\d+$/i.test(groupCode)) {
    return true
  }

  return false
}

export function resolveExportGroupSortKey(sectionId) {
  const groupCode = parseSectionIdParts(sectionId).groupCode
  const exportCode = formatGroupCodeForExport(groupCode)
  const dotIndex = exportCode.indexOf('.')

  if (dotIndex === -1) {
    return { base: exportCode, tier: 0, suffix: '' }
  }

  const suffix = exportCode.slice(dotIndex + 1)
  const tier = suffix === 'ELN0' ? 0 : 1

  return {
    base: exportCode.slice(0, dotIndex),
    tier,
    suffix,
  }
}
