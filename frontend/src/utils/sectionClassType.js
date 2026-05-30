import { normalizeLearningType } from '../constants/learningModes'
import { resolveCourseSectioningProfile } from './sectioningProfile'

const SECTION_GROUP_RE = /\(([^)]+)\)$/

function isCourseraBaseGroupCode(groupCode) {
  return /^COUR\d+$/i.test(String(groupCode || '').trim())
}

function isCourseraPracticeGroupCode(groupCode) {
  return /^COUR\d+\.TH\d+$/i.test(String(groupCode || '').trim())
}

function isOnlineSectionGroupCode(groupCode) {
  const code = String(groupCode || '').trim()
  return /^(ELN|COUR)\d+/i.test(code) || /\.ELN0$/i.test(code)
}

export { isCourseraBaseGroupCode, isCourseraPracticeGroupCode }

function resolveOnlineExportClassType(sectionClassType = 'ELN') {
  const normalized = String(sectionClassType || '').trim().toUpperCase()
  if (['ELN', 'ONLINE_ELEARNING', 'ONLINE_COURSERA', 'ELEARNING', 'COURSERA'].includes(normalized)) {
    return 'ELN0'
  }
  return normalized || 'ELN0'
}

export function parseSectionGroupCode(sectionId) {
  const id = String(sectionId ?? '')
  return id.match(SECTION_GROUP_RE)?.[1] ?? ''
}

export function isPracticeGroupCode(groupCode) {
  return /\.TH(\d+)?$/i.test(String(groupCode || ''))
}

export function resolveSectionClassType(section) {
  if (!section) return 'LT'

  const course = section.course || {}
  const profile = resolveCourseSectioningProfile(course)
  const stored = normalizeLearningType(section.class_type) || profile.primaryClassType
  const groupCode = parseSectionGroupCode(section.section_id)

  if (isCourseraPracticeGroupCode(groupCode)) {
    return 'TH'
  }

  if (isCourseraBaseGroupCode(groupCode) || (
    isOnlineSectionGroupCode(groupCode)
    && normalizeLearningType(section.room_type_req) === 'ONLINE'
  )) {
    return resolveOnlineExportClassType(stored)
  }

  if (profile.combinedLtTh) {
    return 'LT'
  }

  if (profile.usesPracticeSuffix && isPracticeGroupCode(groupCode)) {
    return 'TH'
  }

  if (profile.splitsLtTh && profile.hasTheory && !isPracticeGroupCode(groupCode)) {
    return 'LT'
  }

  if (!profile.splitsLtTh) {
    if (profile.hasTheory && !profile.hasPractice) {
      return 'LT'
    }
    if (profile.hasPractice && !profile.hasTheory) {
      return stored === 'LT' ? profile.primaryClassType : stored
    }
    return stored || profile.primaryClassType
  }

  return stored || profile.primaryClassType
}

export function resolveSectionRoomTypeReq(section, classType = resolveSectionClassType(section)) {
  const course = section?.course || {}
  const profile = resolveCourseSectioningProfile(course)
  const normalizedClass = normalizeLearningType(classType)
  const stored = normalizeLearningType(section?.room_type_req)
  const practiceRooms = new Set(['PM', 'PC', 'TH', 'TN', 'SB', 'XT', 'BV', 'MED', 'DN'])

  if (profile.combinedLtTh) {
    if (stored && practiceRooms.has(stored)) return stored
    if (practiceRooms.has(profile.defaultRoom)) return profile.defaultRoom
    return profile.practiceRoomType
  }

  if (stored) {
    if (normalizedClass === 'LT' && ['LT', 'STD', 'PC', 'PM'].includes(stored)) {
      return stored
    }
    if (normalizedClass !== 'LT' && !['LT', 'STD'].includes(stored)) {
      return stored
    }
  }

  return normalizedClass === 'LT'
    ? profile.theoryRoomType
    : profile.practiceRoomType
}
