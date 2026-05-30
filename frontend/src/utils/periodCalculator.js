import { resolveSectionScheduleDisplayFromCourse } from './scheduleRhythm'

export function calculateScheduleParams(
  credits,
  type = 'LT',
  maxWeeks = 10,
  shiftDuration = 3,
) {
  const normalizedCredits = Number(credits) || 0
  if (normalizedCredits <= 0) return null

  const blockSize = Math.max(Number(shiftDuration) || 3, 1)
  const weeks = Math.max(Number(maxWeeks) || 10, 1)
  const scheduleType = String(type || 'LT').toUpperCase()

  const totalPeriods = scheduleType === 'LT'
    ? normalizedCredits * 15
    : normalizedCredits * 30

  const minPeriodsPerWeek = totalPeriods / weeks
  const stPerWeek = Math.ceil(minPeriodsPerWeek / blockSize) * blockSize
  const actualWeeks = Math.ceil(totalPeriods / stPerWeek)
  const numShifts = stPerWeek / blockSize

  return { totalPeriods, stPerWeek, actualWeeks, numShifts }
}

export function resolveScheduleTypeForClass(classType) {
  const normalized = String(classType || 'LT').toUpperCase()
  if (['TH', 'PM', 'TN', 'SB', 'XT'].includes(normalized)) {
    return 'TH'
  }
  return 'LT'
}

export function resolveSectionScheduleDisplay(section) {
  const fromCourse = resolveSectionScheduleDisplayFromCourse(section)

  if (section?.st_per_week && section?.duration_weeks) {
    return {
      stPerWeek: section.st_per_week,
      actualWeeks: section.duration_weeks,
      rhythmLabel: fromCourse?.rhythmLabel ?? null,
      uniformActualWeeks: fromCourse?.uniformActualWeeks ?? null,
    }
  }

  return fromCourse
}
