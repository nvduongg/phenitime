import dayjs from 'dayjs'

export const DEFAULT_TEACHING_WEEKS = 10

/**
 * Tuần HK cuối = tuần BĐ đợt muộn nhất + số tuần dạy - 1.
 * Ngày KT = cuối tuần HK đó (start + lastWeek * 7 - 1 ngày).
 */
export function computeSemesterEndDate(
  startDate,
  {
    teachingWeeks = DEFAULT_TEACHING_WEEKS,
    latestWaveStartWeek = 1,
  } = {},
) {
  const start = dayjs(startDate)
  if (!start.isValid()) return null

  const weeks = Math.max(Number(teachingWeeks) || DEFAULT_TEACHING_WEEKS, 1)
  const waveStart = Math.max(Number(latestWaveStartWeek) || 1, 1)
  const lastTeachingWeek = waveStart + weeks - 1

  return start.add(lastTeachingWeek * 7 - 1, 'day')
}

export function formatSemesterEndPreview(startDate, options = {}) {
  const end = computeSemesterEndDate(startDate, options)
  return end ? end.format('DD/MM/YYYY') : '—'
}
