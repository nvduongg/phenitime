import { normalizeDeliveryChannel } from './deliveryChannels'

export const OFFLINE_WEEK_RHYTHMS = Object.freeze({
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  EVERY_N: 'EVERY_N',
  CUSTOM: 'CUSTOM',
})

export const OFFLINE_WEEK_RHYTHM_OPTIONS = [
  { value: OFFLINE_WEEK_RHYTHMS.WEEKLY, label: 'Mỗi tuần' },
  { value: OFFLINE_WEEK_RHYTHMS.BIWEEKLY, label: 'Cách tuần' },
  { value: OFFLINE_WEEK_RHYTHMS.EVERY_N, label: 'Cách N tuần' },
  { value: OFFLINE_WEEK_RHYTHMS.CUSTOM, label: 'Kế hoạch chi tiết' },
]

export function parseActiveWeeks(value) {
  if (!value) return []
  return String(value)
    .split(/[,;\s]+/)
    .map((part) => Number(part.trim()))
    .filter((week) => Number.isFinite(week) && week >= 1)
    .sort((a, b) => a - b)
}

export function parseOfflineWeekPlan(value, maxWeeks = 10) {
  if (!value) return []

  const raw = String(value).trim()
  const cap = Math.max(Number(maxWeeks) || 10, 1)
  const looksLikePlan = /[:x]|\d-\d/i.test(raw)

  if (looksLikePlan) {
    const weeks = []
    const segments = raw.split(/[,;]+/)

    for (const segment of segments) {
      const trimmed = segment.trim()
      if (!trimmed) continue

      let match = trimmed.match(/^(\d+)\s*-\s*(\d+)\s*[:x]\s*(\d+)$/i)
      if (match) {
        const from = Number(match[1])
        const to = Number(match[2])
        const perWeek = Number(match[3])
        for (let week = from; week <= to && week <= cap; week += 1) {
          for (let index = 0; index < perWeek; index += 1) {
            weeks.push(week)
          }
        }
        continue
      }

      match = trimmed.match(/^(\d+)\s*[:x]\s*(\d+)$/i)
      if (match) {
        const week = Number(match[1])
        const count = Number(match[2])
        if (week <= cap) {
          for (let index = 0; index < count; index += 1) {
            weeks.push(week)
          }
        }
        continue
      }

      match = trimmed.match(/^(\d+)$/)
      if (match) {
        const week = Number(match[1])
        if (week <= cap) {
          weeks.push(week)
        }
      }
    }

    return weeks
  }

  return parseActiveWeeks(raw)
}

export function summarizeWeekPlan(weeks = []) {
  if (!weeks.length) return ''

  const freq = new Map()
  weeks.forEach((week) => {
    freq.set(week, (freq.get(week) || 0) + 1)
  })

  const parts = []
  const sortedWeeks = [...freq.keys()].sort((a, b) => a - b)
  let runStart = null
  let runEnd = null
  let runPer = null

  const flushRun = () => {
    if (runStart == null) return
    if (runStart === runEnd) {
      parts.push(runPer > 1 ? `T${runStart} (×${runPer})` : `T${runStart}`)
    } else {
      parts.push(runPer > 1
        ? `T${runStart}–${runEnd} (×${runPer}/tuần)`
        : `T${runStart}–${runEnd}`)
    }
    runStart = null
    runEnd = null
    runPer = null
  }

  sortedWeeks.forEach((week) => {
    const perWeek = freq.get(week)
    if (runStart != null && week === runEnd + 1 && perWeek === runPer) {
      runEnd = week
      return
    }
    flushRun()
    runStart = week
    runEnd = week
    runPer = perWeek
  })
  flushRun()

  return parts.join(', ')
}

function resolveWeekInterval(rhythm, interval) {
  if (rhythm === OFFLINE_WEEK_RHYTHMS.BIWEEKLY) return 2
  if (rhythm === OFFLINE_WEEK_RHYTHMS.EVERY_N) {
    return Math.max(Number(interval) || 2, 2)
  }
  return 1
}

export function resolveOfflineWeeks({
  sessionCount,
  rhythm = OFFLINE_WEEK_RHYTHMS.WEEKLY,
  weekInterval,
  activeWeeks,
  maxWeeks = 10,
}) {
  const count = Math.max(Number(sessionCount) || 0, 0)
  const cap = Math.max(Number(maxWeeks) || 10, 1)

  if (rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM) {
    const planned = parseOfflineWeekPlan(activeWeeks, cap)
    if (planned.length > 0) {
      return count > 0 ? planned.slice(0, count) : planned
    }
    return []
  }

  if (count <= 0) return []

  const step = resolveWeekInterval(rhythm, weekInterval)
  const weeks = []
  let week = 1

  while (weeks.length < count && week <= cap) {
    weeks.push(week)
    week += step
  }

  return weeks
}

export function courseSupportsOfflineConfig(classType, practiceCredits = 0) {
  const channel = normalizeDeliveryChannel(classType)
  if (channel === 'COURSERA' || channel === 'ELEARNING') {
    return true
  }
  const practice = Number(practiceCredits) || 0
  return channel === 'OFFLINE' && practice > 0
}

export function formatWeeklyCountsToPlan(counts = []) {
  const parts = []
  counts.forEach((count, index) => {
    const week = index + 1
    const sessions = Number(count) || 0
    if (sessions <= 0) return
    parts.push(sessions === 1 ? String(week) : `${week}:${sessions}`)
  })
  return parts.join(', ')
}

export function parseToWeeklyCounts(planStr, maxWeeks = 10) {
  const counts = Array.from({ length: maxWeeks }, () => 0)
  const weeks = parseOfflineWeekPlan(planStr, maxWeeks)
  weeks.forEach((week) => {
    if (week >= 1 && week <= maxWeeks) {
      counts[week - 1] += 1
    }
  })
  return counts
}

export function sumWeeklyCounts(counts = []) {
  return counts.reduce((total, count) => total + (Number(count) || 0), 0)
}

export function formatOfflineSchedulePreview(values = {}, maxWeeks = 10) {
  const periods = Math.max(Number(values.offline_periods_per_session) || 3, 1)
  const rhythm = values.offline_week_rhythm || OFFLINE_WEEK_RHYTHMS.WEEKLY
  const sessionCount = Number(values.offline_session_count)
  const weeks = resolveOfflineWeeks({
    sessionCount,
    rhythm,
    weekInterval: values.offline_week_interval,
    activeWeeks: values.offline_active_weeks,
    maxWeeks,
  })

  if (weeks.length > 0) {
    const summary = summarizeWeekPlan(weeks)
    return `${weeks.length} buổi × ${periods} tiết · ${summary}`
  }

  if (!Number.isFinite(sessionCount) || sessionCount <= 0) {
    return 'Chưa cấu hình — sinh lớp TH theo TC×30 (tự động).'
  }

  return `${sessionCount} buổi × ${periods} tiết — kiểm tra nhịp tuần.`
}

export function defaultOfflineSessionCount(practiceCredits, periodsPerSession = 3) {
  const practice = Number(practiceCredits) || 0
  if (practice <= 0) return null
  const totalPeriods = practice * 30
  const perSession = Math.max(Number(periodsPerSession) || 3, 1)
  return Math.max(1, Math.ceil(totalPeriods / perSession / 10))
}

function resolvePracticeCredits(course = {}) {
  return Number(course.practice_credits ?? course.tc_th) || 0
}

export function hasManualOfflineSchedule(course = {}) {
  const sessionCount = Number(course.offline_session_count)
  if (Number.isFinite(sessionCount) && sessionCount > 0) {
    return true
  }
  if (course.offline_week_rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM
    && course.offline_active_weeks) {
    return parseOfflineWeekPlan(course.offline_active_weeks).length > 0
  }
  return false
}

export function courseHasOfflineScheduleSupport(course = {}) {
  const channel = normalizeDeliveryChannel(course.delivery_channel || course.class_type)
  if (channel === 'COURSERA' || channel === 'ELEARNING') {
    return true
  }
  return channel === 'OFFLINE' && resolvePracticeCredits(course) > 0
}

export function shouldUseOfflineSchedule(course = {}, classType = 'TH') {
  if (!hasManualOfflineSchedule(course)) {
    return false
  }
  const scheduleType = String(classType || '').toUpperCase()
  if (scheduleType !== 'TH') {
    return false
  }
  return courseHasOfflineScheduleSupport(course)
}

export function buildOfflineSchedulePlan(course = {}, shiftDuration = 3, maxWeeks = 10) {
  const rhythm = course.offline_week_rhythm || OFFLINE_WEEK_RHYTHMS.WEEKLY
  const plannedWeeks = rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM
    ? parseOfflineWeekPlan(course.offline_active_weeks, maxWeeks)
    : []
  const sessionCount = plannedWeeks.length > 0
    ? plannedWeeks.length
    : (Number(course.offline_session_count) || 0)
  const periodsPerSession = Math.max(
    Number(course.offline_periods_per_session) || Number(shiftDuration) || 3,
    1,
  )

  const weeks = resolveOfflineWeeks({
    sessionCount,
    rhythm,
    weekInterval: course.offline_week_interval,
    activeWeeks: course.offline_active_weeks,
    maxWeeks,
  })

  if (!weeks.length) {
    return null
  }

  const totalPeriods = weeks.length * periodsPerSession
  const firstWeek = weeks[0]
  const lastWeek = weeks[weeks.length - 1]

  const events = weeks.map((week, index) => ({
    event_part: index + 1,
    duration: periodsPerSession,
    weekly_periods: periodsPerSession,
    week_from: week,
    week_to: week,
    rhythm_mode: 'OFFLINE_SESSION',
  }))

  return {
    params: {
      totalPeriods,
      stPerWeek: periodsPerSession,
      actualWeeks: lastWeek - firstWeek + 1,
      numShifts: 1,
    },
    events,
    weeks,
    periodsPerSession,
    sessionCount: weeks.length,
  }
}
