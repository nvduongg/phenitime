import {
  buildOfflineSchedulePlan,
  shouldUseOfflineSchedule,
} from '../constants/offlineSchedule'
import { calculateScheduleParams, resolveScheduleTypeForClass } from './periodCalculator'
import { calculateIntegratedScheduleParams, resolveCourseSectioningProfile } from './sectioningProfile'

export const RHYTHM_MODES = {
  UNIFORM: 'UNIFORM',
  PHASE_5_5: 'PHASE_5_5',
}

const DEFAULT_RHYTHM_OPTIONS = {
  maxWeeks: 10,
  shiftDuration: 3,
  stretchEnabled: true,
  minShiftsForStretch: 2,
}

export function resolveScheduleRhythm(params, options = {}) {
  const settings = { ...DEFAULT_RHYTHM_OPTIONS, ...options }
  if (!params) return null

  const maxWeeks = Math.max(Number(settings.maxWeeks) || 10, 1)
  const numShifts = Math.floor(Number(params.numShifts) || 0)

  /** Nhịp học suy từ tổng tiết (TC×15 hoặc TC×30) và ca 3 tiết — không ép mẫu 5+5 tuần. */
  return {
    mode: RHYTHM_MODES.UNIFORM,
    totalPeriods: params.totalPeriods,
    stPerWeek: params.stPerWeek,
    durationWeeks: params.actualWeeks,
    maxWeeks,
    uniformActualWeeks: params.actualWeeks,
    phases: [{
      weekFrom: 1,
      weekTo: params.actualWeeks,
      shiftsPerWeek: numShifts,
      periodsPerWeek: params.stPerWeek,
    }],
    scheduleParams: { ...params },
  }
}

export function buildSchedulingEventsFromPlan(plan, shiftDuration = 3) {
  if (!plan?.phases?.length) {
    return []
  }

  const blockSize = Math.max(Number(shiftDuration) || 3, 1)
  const events = []
  let partIndex = 1

  for (const phase of plan.phases) {
    const periodsPerWeek = Math.floor(phase.periodsPerWeek || blockSize)
    const shiftCount = Math.max(
      Math.floor(phase.shiftsPerWeek || 0),
      periodsPerWeek > blockSize ? Math.ceil(periodsPerWeek / blockSize) : 0,
    )

    for (let shift = 0; shift < shiftCount; shift += 1) {
      events.push({
        event_part: partIndex,
        duration: blockSize,
        weekly_periods: periodsPerWeek,
        week_from: phase.weekFrom,
        week_to: phase.weekTo,
        rhythm_mode: plan.mode,
      })
      partIndex += 1
    }
  }

  return events
}

export function resolveScheduleParamsForSection(section, options = {}) {
  const course = section?.course || {}
  const classType = String(section?.class_type || 'LT').toUpperCase()
  const scheduleType = resolveScheduleTypeForClass(classType)
  const profile = resolveCourseSectioningProfile(course)
  const maxWeeks = Math.max(Number(options.maxWeeks) || 10, 1)
  const shiftDuration = Math.max(Number(options.shiftDuration) || 3, 1)

  if (profile.combinedLtTh) {
    return calculateIntegratedScheduleParams(course, maxWeeks, shiftDuration)
  }

  const credits = scheduleType === 'TH'
    ? Number(course.practice_credits ?? course.tc_th) || 0
    : Number(course.theory_credits ?? course.tc_lt) || 0

  return calculateScheduleParams(credits, scheduleType, maxWeeks, shiftDuration)
}

export function resolveSchedulePlanForSection(section, options = {}) {
  const params = resolveScheduleParamsForSection(section, options)
  if (!params) {
    return null
  }
  return resolveScheduleRhythm(params, options)
}

export function buildSchedulingEventsForSection(section, options = {}) {
  const course = section?.course || {}
  const classType = String(section?.class_type || 'LT').toUpperCase()
  const shiftDuration = Math.max(Number(options.shiftDuration) || 3, 1)
  const maxWeeks = Math.max(Number(options.maxWeeks) || 10, 1)

  if (shouldUseOfflineSchedule(course, classType)) {
    const offlinePlan = buildOfflineSchedulePlan(course, shiftDuration, maxWeeks)
    if (offlinePlan?.events?.length) {
      return offlinePlan.events
    }
  }

  const plan = resolveSchedulePlanForSection(section, options)
  if (!plan) {
    return []
  }
  return buildSchedulingEventsFromPlan(plan, shiftDuration)
}

export function resolvePhaseDateRange(semester, weekFrom, weekTo) {
  const fallbackStart = new Date('2026-04-06')
  const fallbackEnd = new Date('2026-06-14')
  const semesterStart = semester?.start_date ? new Date(semester.start_date) : fallbackStart
  const semesterEnd = semester?.end_date ? new Date(semester.end_date) : fallbackEnd
  const from = Math.max(1, Number(weekFrom) || 1)
  const to = Math.max(from, Number(weekTo) || from)

  const phaseStart = new Date(semesterStart)
  phaseStart.setDate(phaseStart.getDate() + (from - 1) * 7)

  const phaseEnd = new Date(semesterStart)
  phaseEnd.setDate(phaseEnd.getDate() + to * 7 - 1)
  if (phaseEnd > semesterEnd) {
    phaseEnd.setTime(semesterEnd.getTime())
  }
  if (phaseStart > semesterEnd) {
    return { start_date: semesterStart, end_date: semesterEnd }
  }

  return { start_date: phaseStart, end_date: phaseEnd }
}

export function getRhythmDisplayLabel(plan) {
  if (!plan) return null
  if (plan.mode === RHYTHM_MODES.PHASE_5_5) {
    return '5 tuần 1 ca + 5 tuần 2 ca'
  }
  return null
}

export function resolveSectionScheduleDisplayFromCourse(section) {
  const params = resolveScheduleParamsForSection(section)
  if (!params) return null

  const plan = resolveScheduleRhythm(params)
  const display = plan?.scheduleParams || params

  return {
    stPerWeek: display.stPerWeek,
    actualWeeks: plan?.durationWeeks ?? display.actualWeeks,
    rhythmLabel: getRhythmDisplayLabel(plan),
    uniformActualWeeks: params.actualWeeks,
  }
}
