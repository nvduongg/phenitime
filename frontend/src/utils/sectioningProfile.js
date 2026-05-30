import { normalizeLearningType } from '../constants/learningModes'
import { normalizeDeliveryChannel, DELIVERY_CHANNELS } from '../constants/deliveryChannels'

const SECTIONING_TEMPLATES = {
  STANDARD: { ltCap: 80, thCap: 40, ltRoom: 'STD', thRoom: 'TH' },
  LAB_COUPLED: { syncCap: 45, ltRoom: 'PC', thRoom: 'PC' },
  ONLINE: { cap: 200, room: 'ONLINE' },
  MEDICAL_CLINIC: { cap: 20, room: 'MED' },
}

function normalizeTemplateCode(code) {
  return String(code ?? 'STANDARD').trim().toUpperCase()
}

function resolveCourseTemplateCode(course) {
  const code = normalizeTemplateCode(course?.template_code)
  return Object.prototype.hasOwnProperty.call(SECTIONING_TEMPLATES, code)
    ? code
    : 'STANDARD'
}

function getCourseDefaultRoomType(course) {
  return normalizeLearningType(
    course?.default_room_type || course?.room_type || 'LT',
  )
}

function resolveStandardPracticeRoom(course, template = SECTIONING_TEMPLATES.STANDARD) {
  const defaultRoom = getCourseDefaultRoomType(course)
  if (defaultRoom === 'TN') return 'TN'
  if (['PM', 'PC', 'TH', 'TN', 'SB', 'XT', 'BV', 'MED', 'DN'].includes(defaultRoom)) {
    return defaultRoom
  }
  return template.thRoom
}

function resolveTheoryCredits(course = {}) {
  return Number(course.theory_credits ?? course.tc_lt) || 0
}

function resolvePracticeCredits(course = {}) {
  return Number(course.practice_credits ?? course.tc_th) || 0
}

function resolveOnlineClassType(course) {
  const classType = normalizeLearningType(course?.class_type)
  if (['ONLINE', 'ELN', 'ONLINE_ELEARNING', 'ONLINE_COURSERA'].includes(classType)) {
    return classType === 'ONLINE' ? 'ELN' : classType
  }
  return 'ELN'
}

function resolvePracticeClassType(roomType) {
  const normalized = normalizeLearningType(roomType)
  if (normalized === 'PM') return 'PM'
  if (normalized === 'TH') return 'TH'
  return 'TH'
}

export function resolveCourseSectioningProfile(course = {}) {
  const templateCode = resolveCourseTemplateCode(course)
  const template = SECTIONING_TEMPLATES[templateCode] || SECTIONING_TEMPLATES.STANDARD
  const theoryCredits = resolveTheoryCredits(course)
  const practiceCredits = resolvePracticeCredits(course)
  const defaultRoom = getCourseDefaultRoomType(course)
  const deliveryChannel = normalizeDeliveryChannel(course?.class_type)
  const deliveryMode = deliveryChannel

  const hasTheory = theoryCredits > 0
  const hasPractice = practiceCredits > 0
  const hasMixedCredits = hasTheory && hasPractice

  const splitsLtTh = hasMixedCredits
    && (templateCode === 'STANDARD' || templateCode === 'MEDICAL_CLINIC')

  const combinedLtTh = hasMixedCredits && templateCode === 'LAB_COUPLED'

  const usesPracticeSuffix = splitsLtTh

  let theoryRoomType = 'LT'
  let practiceRoomType = 'TH'

  switch (templateCode) {
    case 'LAB_COUPLED':
      theoryRoomType = template.ltRoom
      practiceRoomType = template.thRoom
      break
    case 'ONLINE':
      theoryRoomType = template.room
      practiceRoomType = template.room
      break
    case 'MEDICAL_CLINIC':
      theoryRoomType = template.room
      practiceRoomType = template.room
      break
    case 'STANDARD':
    default:
      theoryRoomType = template.ltRoom
      practiceRoomType = resolveStandardPracticeRoom(course, template)
      break
  }

  let primaryClassType = 'LT'
  if (!hasTheory && hasPractice) {
    primaryClassType = resolvePracticeClassType(defaultRoom)
  } else if (templateCode === 'ONLINE') {
    primaryClassType = resolveOnlineClassType(course)
  } else if (hasTheory) {
    primaryClassType = 'LT'
  }

  const isSplitDelivery = deliveryChannel === DELIVERY_CHANNELS.HYBRID
    || deliveryChannel === DELIVERY_CHANNELS.COURSERA

  return {
    templateCode,
    deliveryChannel,
    deliveryMode,
    isSplitDelivery,
    defaultRoom,
    theoryCredits,
    practiceCredits,
    hasTheory,
    hasPractice,
    hasMixedCredits,
    splitsLtTh,
    combinedLtTh,
    usesPracticeSuffix,
    theoryRoomType: normalizeLearningType(theoryRoomType),
    practiceRoomType: normalizeLearningType(practiceRoomType),
    primaryClassType,
  }
}

export function calculateIntegratedScheduleParams(
  course = {},
  maxWeeks = 10,
  shiftDuration = 3,
) {
  const theory = resolveTheoryCredits(course)
  const practice = resolvePracticeCredits(course)
  const totalPeriods = (theory * 15) + (practice * 30)

  if (totalPeriods <= 0) return null

  const blockSize = Math.max(Number(shiftDuration) || 3, 1)
  const weeks = Math.max(Number(maxWeeks) || 10, 1)
  const minPeriodsPerWeek = totalPeriods / weeks
  const stPerWeek = Math.ceil(minPeriodsPerWeek / blockSize) * blockSize
  const actualWeeks = Math.ceil(totalPeriods / stPerWeek)

  return { totalPeriods, stPerWeek, actualWeeks, numShifts: stPerWeek / blockSize }
}
