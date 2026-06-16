/**
 * Canonical delivery-channel taxonomy (Kênh học).
 * Course.class_type stores the channel; LT/TH/ELN0 are resolved at section level.
 */

const { repairGarbledClassTypeCode } = require('./courseImportRows');

const DELIVERY_CHANNELS = Object.freeze({
    FACE: 'FACE',
    ELEARNING: 'ELEARNING',
    COURSERA: 'COURSERA',
    HYBRID: 'HYBRID',
    SPECIAL: 'SPECIAL',
});

const SPECIAL_CHANNEL_CODES = new Set(['DA', 'ĐA', 'TT', 'KL', 'DN', 'BV']);

const LEGACY_TO_CHANNEL = Object.freeze({
    LT: DELIVERY_CHANNELS.FACE,
    TH: DELIVERY_CHANNELS.FACE,
    OFFLINE: DELIVERY_CHANNELS.FACE,
    FACE: DELIVERY_CHANNELS.FACE,
    ONLINE: DELIVERY_CHANNELS.ELEARNING,
    ELN: DELIVERY_CHANNELS.ELEARNING,
    ONLINE_ELEARNING: DELIVERY_CHANNELS.ELEARNING,
    ELEARNING: DELIVERY_CHANNELS.ELEARNING,
    ONLINE_COURSERA: DELIVERY_CHANNELS.COURSERA,
    COURSERA: DELIVERY_CHANNELS.COURSERA,
    HYBRID: DELIVERY_CHANNELS.HYBRID,
    DA: DELIVERY_CHANNELS.SPECIAL,
    'ĐA': DELIVERY_CHANNELS.SPECIAL,
    TT: DELIVERY_CHANNELS.SPECIAL,
    KL: DELIVERY_CHANNELS.SPECIAL,
    DN: DELIVERY_CHANNELS.SPECIAL,
    BV: DELIVERY_CHANNELS.SPECIAL,
});

const IMPORT_ALIASES = Object.freeze({
    'trực tiếp': DELIVERY_CHANNELS.FACE,
    offline: DELIVERY_CHANNELS.FACE,
    'lý thuyết': DELIVERY_CHANNELS.FACE,
    lt: DELIVERY_CHANNELS.FACE,
    'thực hành': DELIVERY_CHANNELS.FACE,
    th: DELIVERY_CHANNELS.FACE,
    face: DELIVERY_CHANNELS.FACE,
    'e-learning': DELIVERY_CHANNELS.ELEARNING,
    elearning: DELIVERY_CHANNELS.ELEARNING,
    online_elearning: DELIVERY_CHANNELS.ELEARNING,
    'trực tuyến (e-learning)': DELIVERY_CHANNELS.ELEARNING,
    'truc tuyen (e-learning)': DELIVERY_CHANNELS.ELEARNING,
    eln: DELIVERY_CHANNELS.ELEARNING,
    online: DELIVERY_CHANNELS.ELEARNING,
    coursera: DELIVERY_CHANNELS.COURSERA,
    online_coursera: DELIVERY_CHANNELS.COURSERA,
    'kết hợp': DELIVERY_CHANNELS.HYBRID,
    hybrid: DELIVERY_CHANNELS.HYBRID,
    'đồ án': DELIVERY_CHANNELS.SPECIAL,
    'do an': DELIVERY_CHANNELS.SPECIAL,
    da: DELIVERY_CHANNELS.SPECIAL,
    'thực tập': DELIVERY_CHANNELS.SPECIAL,
    'thuc tap': DELIVERY_CHANNELS.SPECIAL,
    'khóa luận': DELIVERY_CHANNELS.SPECIAL,
    'khoa luan': DELIVERY_CHANNELS.SPECIAL,
    kl: DELIVERY_CHANNELS.SPECIAL,
});

const SPECIAL_COURSE_NAME_KEYWORDS = [
    'đồ án',
    'do an',
    'thực tập',
    'thuc tap',
    'khóa luận',
    'khoa luan',
];

function normalizeDeliveryChannelInput(value) {
    const raw = repairGarbledClassTypeCode(String(value ?? '').trim());
    if (!raw || raw === '-') return DELIVERY_CHANNELS.FACE;
    if (raw === 'ĐA') return DELIVERY_CHANNELS.SPECIAL;

    const lowered = raw.toLowerCase();
    if (IMPORT_ALIASES[lowered]) {
        return IMPORT_ALIASES[lowered];
    }

    const upper = raw.toUpperCase();
    if (LEGACY_TO_CHANNEL[upper]) {
        return LEGACY_TO_CHANNEL[upper];
    }

    return DELIVERY_CHANNELS.FACE;
}

function resolveDeliveryChannel(course = {}) {
    const fromClassType = normalizeDeliveryChannelInput(course.class_type);
    if (fromClassType === DELIVERY_CHANNELS.SPECIAL) {
        return DELIVERY_CHANNELS.SPECIAL;
    }

    const normalizedName = String(course.course_name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (SPECIAL_COURSE_NAME_KEYWORDS.some((keyword) => {
        const normalizedKeyword = keyword
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        return normalizedName.includes(normalizedKeyword);
    })) {
        return DELIVERY_CHANNELS.SPECIAL;
    }

    return fromClassType;
}

function isAsyncOnlineChannel(channel) {
    return channel === DELIVERY_CHANNELS.ELEARNING
        || channel === DELIVERY_CHANNELS.COURSERA;
}

function isSplitDeliveryChannel(channel) {
    return channel === DELIVERY_CHANNELS.HYBRID
        || channel === DELIVERY_CHANNELS.COURSERA;
}

function requiresPhysicalSchedule(course = {}) {
    const channel = resolveDeliveryChannel(course);
    if (channel === DELIVERY_CHANNELS.SPECIAL) {
        return false;
    }
    if (channel === DELIVERY_CHANNELS.FACE) {
        return true;
    }
    if (channel === DELIVERY_CHANNELS.ELEARNING) {
        return false;
    }
    if (channel === DELIVERY_CHANNELS.COURSERA || channel === DELIVERY_CHANNELS.HYBRID) {
        const practiceCredits = Number(course.practice_credits ?? course.tc_th) || 0;
        return practiceCredits > 0;
    }
    return true;
}

function requiresSchedulingForCourse(course = {}) {
    return requiresPhysicalSchedule(course);
}

function skipsAutoGenerateForChannel(channel) {
    return channel === DELIVERY_CHANNELS.SPECIAL;
}

/**
 * Physical template when channel splits online + lab (HYBRID / COURSERA + TH).
 */
function resolvePhysicalTemplateForSplit(course = {}) {
    const { resolveCourseTemplateCode } = require('./sectioningTemplates');
    const templateCode = resolveCourseTemplateCode(course);
    if (templateCode !== 'ONLINE' && templateCode !== 'SPECIAL') {
        return templateCode;
    }
    return 'LAB_COUPLED';
}

function sliceCourseCredits(course, { theoryOnly = false, practiceOnly = false } = {}) {
    const theory = Number(course.theory_credits ?? course.tc_lt) || 0;
    const practice = Number(course.practice_credits ?? course.tc_th) || 0;

    if (theoryOnly) {
        return {
            ...course,
            theory_credits: theory,
            practice_credits: 0,
            credits: theory,
        };
    }

    if (practiceOnly) {
        return {
            ...course,
            theory_credits: 0,
            practice_credits: practice,
            credits: practice,
        };
    }

    return course;
}

function resolveOnlineSectionClassType(channel) {
    if (channel === DELIVERY_CHANNELS.COURSERA || channel === DELIVERY_CHANNELS.HYBRID) {
        return 'ELN';
    }
    return 'ELN';
}

/** Hình thức học xuất báo cáo: ELN (LMS), COUR (Coursera) — không dùng ELN0. */
function resolveOnlineExportClassType(sectionClassType = 'ELN') {
    const normalized = String(sectionClassType || '').trim().toUpperCase();
    if (['ELN', 'ELN0', 'ONLINE_ELEARNING', 'ELEARNING', 'ONLINE'].includes(normalized)) {
        return 'ELN';
    }
    return normalized || 'ELN';
}

function isOnlineSectionGroupCode(groupCode) {
    const code = String(groupCode || '').trim();
    return /^(ELN|COUR)\d+/i.test(code) || /\.ELN0$/i.test(code);
}

function isCourseraBaseGroupCode(groupCode) {
    return /^COUR\d+$/i.test(String(groupCode || '').trim());
}

function isCourseraPracticeGroupCode(groupCode) {
    return /^COUR\d+\.TH\d+$/i.test(String(groupCode || '').trim());
}

module.exports = {
    DELIVERY_CHANNELS,
    SPECIAL_CHANNEL_CODES,
    LEGACY_TO_CHANNEL,
    IMPORT_ALIASES,
    normalizeDeliveryChannelInput,
    resolveDeliveryChannel,
    isAsyncOnlineChannel,
    isSplitDeliveryChannel,
    requiresPhysicalSchedule,
    requiresSchedulingForCourse,
    skipsAutoGenerateForChannel,
    resolvePhysicalTemplateForSplit,
    sliceCourseCredits,
    resolveOnlineSectionClassType,
    resolveOnlineExportClassType,
    isOnlineSectionGroupCode,
    isCourseraBaseGroupCode,
    isCourseraPracticeGroupCode,
};
