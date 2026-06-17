const { DEFAULT_MAX_WEEKS } = require('./periodCalculator');

function toDateOnly(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

/**
 * Tuần HK cuối cùng = tuần bắt đầu đợt muộn nhất + số tuần dạy - 1.
 * Ngày KT = Chủ nhật cuối của tuần HK đó (start + lastWeek * 7 - 1 ngày).
 */
function computeSemesterEndDate(
    startDate,
    {
        teachingWeeks = DEFAULT_MAX_WEEKS,
        latestWaveStartWeek = 1,
    } = {},
) {
    const start = toDateOnly(startDate);
    if (!start) return null;

    const weeks = Math.max(Number(teachingWeeks) || 10, 1);
    const waveStart = Math.max(Number(latestWaveStartWeek) || 1, 1);
    const lastTeachingWeek = waveStart + weeks - 1;

    const end = new Date(start);
    end.setDate(end.getDate() + lastTeachingWeek * 7 - 1);
    return end;
}

function formatDateIso(date) {
    if (!date) return null;
    const normalized = toDateOnly(date);
    if (!normalized) return null;
    return normalized.toISOString().slice(0, 10);
}

module.exports = {
    computeSemesterEndDate,
    formatDateIso,
};
