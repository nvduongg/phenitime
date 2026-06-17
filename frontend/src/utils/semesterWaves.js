function resolveSectionCohortIds(section) {
  return [...new Set(
    (section?.student_groups || [])
      .map((group) => group.curriculum?.cohort_id || group.curriculum?.cohort?.cohort_id)
      .filter(Boolean),
  )]
}

export function normalizeCohortIdList(cohortIds = []) {
  return [...new Set(
    (Array.isArray(cohortIds) ? cohortIds : [cohortIds])
      .map((id) => String(id).trim())
      .filter(Boolean),
  )]
}

/** Suy đợt từ niên khóa của lớp (K18 → Đ2 tuần 6…). */
export function resolveWaveForSection(section, waves = []) {
  if (!section || !waves.length) {
    return null
  }

  const cohortIds = resolveSectionCohortIds(section)
  return findWaveForCohorts(waves, cohortIds)
}

export function findWaveForCohorts(waves = [], cohortIds = []) {
  const normalized = normalizeCohortIdList(cohortIds)
  if (!waves.length || !normalized.length) {
    return null
  }

  const exact = waves.find((wave) => {
    const waveCohorts = normalizeCohortIdList(wave.cohort_ids)
    return waveCohorts.length === normalized.length
      && normalized.every((id) => waveCohorts.includes(id))
  })
  if (exact) {
    return exact
  }

  const subsetMatches = waves.filter((wave) => {
    const waveCohorts = normalizeCohortIdList(wave.cohort_ids)
    return normalized.every((id) => waveCohorts.includes(id))
  })

  if (subsetMatches.length === 1) {
    return subsetMatches[0]
  }

  return null
}

export function applyWaveWeekOffset(events = [], startWeek = 1) {
  const offset = Math.max(Number(startWeek) || 1, 1)
  if (offset <= 1) {
    return events
  }

  return events.map((event) => {
    const next = { ...event }
    if (next.week_from != null) {
      next.week_from = Number(next.week_from) + offset - 1
    }
    if (next.week_to != null) {
      next.week_to = Number(next.week_to) + offset - 1
    }
    return next
  })
}

export function resolveWaveStartWeek(section, waves = []) {
  return resolveWaveForSection(section, waves)?.start_week || 1
}

/**
 * Gợi ý phân đợt từ danh sách niên khóa trong hệ thống.
 * Mỗi niên khóa → 1 đợt; tuần BĐ lệch nhau theo max_teaching_weeks (gối ~50% HK).
 * Người dùng có thể gộp/tách đợt trước khi lưu.
 */
export function suggestWavesFromCohorts(cohortIds = [], maxTeachingWeeks = 10) {
  const ids = normalizeCohortIdList(cohortIds).sort((a, b) => a.localeCompare(b, 'vi'))
  if (!ids.length) {
    return []
  }

  const weeks = Math.max(Number(maxTeachingWeeks) || 10, 1)
  const weekGap = Math.max(1, Math.ceil(weeks / 2))

  return ids.map((cohortId, index) => ({
    wave_order: index + 1,
    wave_name: `Đợt ${index + 1}`,
    start_week: 1 + index * weekGap,
    cohort_ids: [cohortId],
  }))
}
