const { resolvePhaseDateRange } = require('./scheduleRhythm');

function toDateOnly(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function computeSemesterWeekNumber(sessionDate, semesterStartDate) {
    const session = toDateOnly(sessionDate);
    const semesterStart = toDateOnly(semesterStartDate);
    if (!session || !semesterStart) return null;

    session.setHours(0, 0, 0, 0);
    semesterStart.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((session - semesterStart) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return null;

    return Math.floor(diffDays / 7) + 1;
}

function buildOccupancyBlocks(timetables = [], semester = {}) {
    const semesterStart = semester?.start_date;
    if (!semesterStart) return [];

    return timetables
        .filter((row) => row?.room_id && row?.day_of_week && row?.start_period)
        .map((row) => {
            const weekFrom = computeSemesterWeekNumber(row.start_date, semesterStart) || 1;
            const weekTo = computeSemesterWeekNumber(row.end_date, semesterStart) || weekFrom;

            return {
                room_id: String(row.room_id).trim(),
                day_of_week: Number(row.day_of_week),
                start_period: Number(row.start_period),
                period_count: Math.max(Number(row.period_count) || 3, 1),
                week_from: Math.min(weekFrom, weekTo),
                week_to: Math.max(weekFrom, weekTo),
            };
        });
}

function applyWaveWeekOffset(events = [], startWeek = 1) {
    const offset = Math.max(Number(startWeek) || 1, 1);
    if (offset <= 1) {
        return events;
    }

    return events.map((event) => {
        const next = { ...event };
        if (next.week_from != null) {
            next.week_from = Number(next.week_from) + offset - 1;
        }
        if (next.week_to != null) {
            next.week_to = Number(next.week_to) + offset - 1;
        }
        return next;
    });
}

function buildWaveId(semesterId, waveOrder) {
    return `${String(semesterId).trim()}_${Number(waveOrder)}`;
}

module.exports = {
    computeSemesterWeekNumber,
    buildOccupancyBlocks,
    applyWaveWeekOffset,
    buildWaveId,
    resolvePhaseDateRange,
};
