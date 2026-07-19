const { resolveDeliveryChannel, DELIVERY_CHANNELS } = require('./deliveryChannels');
const { resolvePracticeCredits, resolveScheduleTypeForClass } = require('./periodCalculator');

const OFFLINE_WEEK_RHYTHMS = Object.freeze({
    WEEKLY: 'WEEKLY',
    BIWEEKLY: 'BIWEEKLY',
    EVERY_N: 'EVERY_N',
    CUSTOM: 'CUSTOM',
});

const OFFLINE_RHYTHM_MODE = 'OFFLINE_SESSION';

function parseOfflineWeekPlan(value, maxWeeks = 10) {
    if (!value) return [];

    const raw = String(value).trim();
    const cap = Math.max(Number(maxWeeks) || 10, 1);
    const looksLikePlan = /[:x]|\d-\d/i.test(raw);

    if (looksLikePlan) {
        const weeks = [];
        const segments = raw.split(/[,;]+/);

        for (const segment of segments) {
            const trimmed = segment.trim();
            if (!trimmed) continue;

            let match = trimmed.match(/^(\d+)\s*-\s*(\d+)\s*[:x]\s*(\d+)$/i);
            if (match) {
                const from = Number(match[1]);
                const to = Number(match[2]);
                const perWeek = Number(match[3]);
                for (let week = from; week <= to && week <= cap; week += 1) {
                    for (let index = 0; index < perWeek; index += 1) {
                        weeks.push(week);
                    }
                }
                continue;
            }

            match = trimmed.match(/^(\d+)\s*[:x]\s*(\d+)$/i);
            if (match) {
                const week = Number(match[1]);
                const count = Number(match[2]);
                if (week <= cap) {
                    for (let index = 0; index < count; index += 1) {
                        weeks.push(week);
                    }
                }
                continue;
            }

            match = trimmed.match(/^(\d+)$/);
            if (match) {
                const week = Number(match[1]);
                if (week <= cap) {
                    weeks.push(week);
                }
            }
        }

        return weeks;
    }

    return parseActiveWeeks(raw);
}

function summarizeWeekPlan(weeks = []) {
    if (!weeks.length) return '';

    const freq = new Map();
    weeks.forEach((week) => {
        freq.set(week, (freq.get(week) || 0) + 1);
    });

    const parts = [];
    const sortedWeeks = [...freq.keys()].sort((a, b) => a - b);
    let runStart = null;
    let runEnd = null;
    let runPer = null;

    const flushRun = () => {
        if (runStart == null) return;
        if (runStart === runEnd) {
            parts.push(runPer > 1 ? `T${runStart} (×${runPer})` : `T${runStart}`);
        } else {
            parts.push(runPer > 1
                ? `T${runStart}–${runEnd} (×${runPer}/tuần)`
                : `T${runStart}–${runEnd}`);
        }
        runStart = null;
        runEnd = null;
        runPer = null;
    };

    sortedWeeks.forEach((week) => {
        const perWeek = freq.get(week);
        if (runStart != null && week === runEnd + 1 && perWeek === runPer) {
            runEnd = week;
            return;
        }
        flushRun();
        runStart = week;
        runEnd = week;
        runPer = perWeek;
    });
    flushRun();

    return parts.join(', ');
}

function parseActiveWeeks(value) {
    if (!value) return [];
    return String(value)
        .split(/[,;\s]+/)
        .map((part) => Number(part.trim()))
        .filter((week) => Number.isFinite(week) && week >= 1)
        .sort((a, b) => a - b);
}

function resolveWeekInterval(rhythm, interval) {
    if (rhythm === OFFLINE_WEEK_RHYTHMS.BIWEEKLY) {
        return 2;
    }
    if (rhythm === OFFLINE_WEEK_RHYTHMS.EVERY_N) {
        return Math.max(Number(interval) || 2, 2);
    }
    return 1;
}

function resolveOfflineWeeks({
    sessionCount,
    rhythm = OFFLINE_WEEK_RHYTHMS.WEEKLY,
    weekInterval,
    activeWeeks,
    maxWeeks = 10,
}) {
    const count = Math.max(Number(sessionCount) || 0, 0);
    const cap = Math.max(Number(maxWeeks) || 10, 1);

    if (rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM) {
        const planned = parseOfflineWeekPlan(activeWeeks, cap);
        if (planned.length > 0) {
            return count > 0 ? planned.slice(0, count) : planned;
        }
        return [];
    }

    if (count <= 0) {
        return [];
    }

    const step = resolveWeekInterval(rhythm, weekInterval);
    const weeks = [];
    let week = 1;

    while (weeks.length < count && week <= cap) {
        weeks.push(week);
        week += step;
    }

    return weeks;
}

function courseSupportsOfflineConfig(course = {}) {
    const channel = resolveDeliveryChannel(course);

    if (channel === DELIVERY_CHANNELS.COURSERA
        || channel === DELIVERY_CHANNELS.ELEARNING) {
        return true;
    }

    return channel === DELIVERY_CHANNELS.OFFLINE && resolvePracticeCredits(course) > 0;
}

function courseNeedsPhysicalOfflineSections(course = {}) {
    const channel = resolveDeliveryChannel(course);

    if (channel !== DELIVERY_CHANNELS.COURSERA
        && channel !== DELIVERY_CHANNELS.ELEARNING) {
        return false;
    }

    /** E-learning thuần: TC TH học async trên LMS — chỉ xếp buổi gặp mặt khi cấu hình offline. */
    if (channel === DELIVERY_CHANNELS.ELEARNING) {
        return hasManualOfflineSchedule(course);
    }

    /** Coursera: online async + buổi TH/PC lab khi có TC TH hoặc cấu hình offline. */
    return resolvePracticeCredits(course) > 0 || hasManualOfflineSchedule(course);
}

function hasManualOfflineSchedule(course = {}) {
    const sessionCount = Number(course.offline_session_count);
    if (Number.isFinite(sessionCount) && sessionCount > 0) {
        return true;
    }
    if (course.offline_week_rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM
        && course.offline_active_weeks) {
        return parseOfflineWeekPlan(course.offline_active_weeks).length > 0;
    }
    return false;
}

function shouldUseOfflineSchedule(course = {}, classType) {
    if (!hasManualOfflineSchedule(course)) {
        return false;
    }

    const scheduleType = resolveScheduleTypeForClass(classType);
    if (scheduleType !== 'TH') {
        return false;
    }

    return courseSupportsOfflineConfig(course);
}

function buildOfflineSchedulePlan(course = {}, shiftDuration = 3, maxWeeks = 10, defaults = {}) {
    const rhythm = course.offline_week_rhythm
        || defaults.week_rhythm
        || OFFLINE_WEEK_RHYTHMS.WEEKLY;
    const plannedWeeks = rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM
        ? parseOfflineWeekPlan(course.offline_active_weeks, maxWeeks)
        : [];
    const sessionCount = plannedWeeks.length > 0
        ? plannedWeeks.length
        : (Number(course.offline_session_count) || 0);
    const periodsPerSession = Math.max(
        Number(course.offline_periods_per_session)
        || Number(defaults.periods_per_session)
        || 3,
        1,
    );

    const weeks = resolveOfflineWeeks({
        sessionCount,
        rhythm,
        weekInterval: course.offline_week_interval || defaults.week_interval,
        activeWeeks: course.offline_active_weeks,
        maxWeeks,
    });

    if (!weeks.length) {
        return null;
    }

    const totalPeriods = weeks.length * periodsPerSession;
    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];
    const durationWeeks = lastWeek - firstWeek + 1;

    const freq = new Map();
    weeks.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
    const maxConcurrent = Math.max(...freq.values());

    const events = [];
    for (let part = 1; part <= maxConcurrent; part++) {
        const weeksWithThisPart = [];
        for (let w = firstWeek; w <= lastWeek; w++) {
            if ((freq.get(w) || 0) >= part) {
                weeksWithThisPart.push(w);
            }
        }
        
        if (weeksWithThisPart.length > 0) {
            events.push({
                event_part: part,
                duration: periodsPerSession,
                weekly_periods: periodsPerSession,
                week_from: Math.min(...weeksWithThisPart),
                week_to: Math.max(...weeksWithThisPart),
                rhythm_mode: OFFLINE_RHYTHM_MODE,
            });
        }
    }

    return {
        params: {
            totalPeriods,
            stPerWeek: periodsPerSession,
            actualWeeks: durationWeeks,
            numShifts: maxConcurrent,
        },
        events,
        weeks,
        periodsPerSession,
        sessionCount: weeks.length,
    };
}

function formatOfflineScheduleSummary(course = {}, maxWeeks = 10, defaults = {}) {
    if (!hasManualOfflineSchedule(course)) {
        return null;
    }

    const periodsPerSession = Math.max(
        Number(course.offline_periods_per_session)
        || Number(defaults.periods_per_session)
        || 3,
        1,
    );
    const rhythm = course.offline_week_rhythm
        || defaults.week_rhythm
        || OFFLINE_WEEK_RHYTHMS.WEEKLY;
    const weeks = resolveOfflineWeeks({
        sessionCount: course.offline_session_count,
        rhythm,
        weekInterval: course.offline_week_interval || defaults.week_interval,
        activeWeeks: course.offline_active_weeks,
        maxWeeks,
    });

    if (!weeks.length) {
        return `${course.offline_session_count} buổi × ${periodsPerSession} tiết`;
    }

    const weekLabel = summarizeWeekPlan(weeks) || (weeks.length <= 6
        ? weeks.join(', ')
        : `${weeks.slice(0, 3).join(', ')}…${weeks[weeks.length - 1]}`);

    return `${weeks.length} buổi × ${periodsPerSession} tiết · ${weekLabel}`;
}

function syncCourseOfflineFields(courseData = {}, defaults = {}) {
    const next = { ...courseData };
    const channel = resolveDeliveryChannel(next);
    const practiceCredits = resolvePracticeCredits(next);
    const supportsOffline = channel === DELIVERY_CHANNELS.COURSERA
        || channel === DELIVERY_CHANNELS.ELEARNING
        || (channel === DELIVERY_CHANNELS.OFFLINE && practiceCredits > 0);

    if (!supportsOffline) {
        next.offline_session_count = null;
        next.offline_periods_per_session = null;
        next.offline_week_rhythm = null;
        next.offline_week_interval = null;
        next.offline_active_weeks = null;
        return next;
    }

    const sessionCount = next.offline_session_count;
    if (sessionCount === '' || sessionCount === undefined) {
        next.offline_session_count = null;
    } else {
        const parsed = Number(sessionCount);
        next.offline_session_count = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
    }

    if (next.offline_session_count == null) {
        next.offline_periods_per_session = null;
        next.offline_week_rhythm = null;
        next.offline_week_interval = null;
        next.offline_active_weeks = null;
        return next;
    }

    const periods = Number(next.offline_periods_per_session);
    next.offline_periods_per_session = Number.isFinite(periods) && periods > 0
        ? Math.floor(periods)
        : Math.floor(Number(defaults.periods_per_session) || 3);

    const rhythm = String(
        next.offline_week_rhythm
        || defaults.week_rhythm
        || OFFLINE_WEEK_RHYTHMS.WEEKLY,
    ).toUpperCase();
    next.offline_week_rhythm = Object.values(OFFLINE_WEEK_RHYTHMS).includes(rhythm)
        ? rhythm
        : OFFLINE_WEEK_RHYTHMS.WEEKLY;

    if (next.offline_week_rhythm === OFFLINE_WEEK_RHYTHMS.EVERY_N) {
        const interval = Number(next.offline_week_interval);
        next.offline_week_interval = Number.isFinite(interval) && interval >= 2
            ? Math.floor(interval)
            : Math.floor(Number(defaults.week_interval) || 2);
    } else {
        next.offline_week_interval = null;
    }

    if (next.offline_week_rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM) {
        const planned = parseOfflineWeekPlan(next.offline_active_weeks);
        next.offline_active_weeks = planned.length
            ? String(next.offline_active_weeks || '').trim()
            : null;
        if (planned.length && !next.offline_session_count) {
            next.offline_session_count = planned.length;
        }
    } else {
        next.offline_active_weeks = null;
    }

    return next;
}

function validateOfflineSchedule(course = {}) {
    if (!hasManualOfflineSchedule(course)) {
        return null;
    }

    if (!courseSupportsOfflineConfig(course)) {
        return 'Cấu hình buổi offline chỉ áp dụng cho Coursera, E-learning hoặc OFFLINE có TC TH.';
    }

    if (course.offline_week_rhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM) {
        const planned = parseOfflineWeekPlan(course.offline_active_weeks);
        if (!planned.length) {
            return 'Vui lòng nhập kế hoạch buổi offline (VD: 2-8:2, 9 hoặc 2,2,3,3…).';
        }
    }

    return null;
}

module.exports = {
    OFFLINE_WEEK_RHYTHMS,
    OFFLINE_RHYTHM_MODE,
    parseActiveWeeks,
    parseOfflineWeekPlan,
    summarizeWeekPlan,
    resolveOfflineWeeks,
    courseSupportsOfflineConfig,
    courseNeedsPhysicalOfflineSections,
    hasManualOfflineSchedule,
    shouldUseOfflineSchedule,
    buildOfflineSchedulePlan,
    formatOfflineScheduleSummary,
    syncCourseOfflineFields,
    validateOfflineSchedule,
};
