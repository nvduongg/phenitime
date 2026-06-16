const COHORT_FILTER_STORAGE_KEY = 'phenitime:sectionCohortFilter'

export function loadCohortFilter() {
  try {
    const raw = localStorage.getItem(COHORT_FILTER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

export function saveCohortFilter(cohortIds) {
  try {
    localStorage.setItem(
      COHORT_FILTER_STORAGE_KEY,
      JSON.stringify(Array.isArray(cohortIds) ? cohortIds.filter(Boolean) : []),
    )
  } catch {
    // ignore quota / private mode
  }
}
