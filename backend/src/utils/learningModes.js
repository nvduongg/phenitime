/**
 * Unified Phenitime learning-mode taxonomy.
 * Keeps Node generator, Python scheduler, and React UI in sync.
 */

const {
    DELIVERY_CHANNELS,
    resolveDeliveryChannel,
    requiresSchedulingForCourse,
    resolveOnlineSectionClassType,
    isOnlineSectionGroupCode,
    isCourseraPracticeGroupCode,
} = require('./deliveryChannels');

const LEARNING_MODES = {
    THEORY: ['LT'],
    PRACTICE: ['TH', 'PM', 'TN', 'SB', 'XT'],
    ONLINE: ['ONLINE', 'ELN', 'ELN0', 'ONLINE_ELEARNING', 'ONLINE_COURSERA', 'ELEARNING', 'COURSERA'],
    SPECIAL: ['DA', 'ĐA', 'KL', 'TT', 'DN', 'BV', 'SPECIAL'],
};

const ASYNC_ONLINE_CLASS_TYPES = new Set([
    'ELN',
    'ELN0',
    'ONLINE',
    'ONLINE_ELEARNING',
    'ONLINE_COURSERA',
    'ELEARNING',
    'COURSERA',
]);

const SPECIAL_COURSE_NAME_KEYWORDS = [
    'đồ án',
    'do an',
    'thực tập',
    'thuc tap',
    'khóa luận',
    'khoa luan',
];

function normalizeLearningType(type) {
    return String(type ?? '').trim().toUpperCase();
}

function getLearningMode(type) {
    const normalized = normalizeLearningType(type);

    if (LEARNING_MODES.THEORY.includes(normalized)) return 'THEORY';
    if (LEARNING_MODES.PRACTICE.includes(normalized)) return 'PRACTICE';
    if (LEARNING_MODES.ONLINE.includes(normalized)) return 'ONLINE';
    if (LEARNING_MODES.SPECIAL.includes(normalized)) return 'SPECIAL';

    return 'THEORY';
}

function isPracticeRoomType(roomType) {
    return getLearningMode(roomType) === 'PRACTICE';
}

function isOnlineLearningType(type) {
    return getLearningMode(type) === 'ONLINE';
}

function isSpecialLearningType(type) {
    return getLearningMode(type) === 'SPECIAL';
}

function resolveCourseLearningMode(course, defaultRoomType = 'LT') {
    const channel = resolveDeliveryChannel(course);
    if (channel === DELIVERY_CHANNELS.SPECIAL) {
        return 'SPECIAL';
    }
    if (channel === DELIVERY_CHANNELS.ELEARNING || channel === DELIVERY_CHANNELS.COURSERA) {
        return 'ONLINE';
    }

    const roomType = normalizeLearningType(
        course?.default_room_type || course?.room_type || defaultRoomType,
    );

    if (isOnlineLearningType(roomType)) {
        return 'ONLINE';
    }

    if (isSpecialLearningType(roomType)) {
        return 'SPECIAL';
    }

    return getLearningMode(roomType);
}

function resolveOnlineClassType(course) {
    const channel = resolveDeliveryChannel(course);
    return resolveOnlineSectionClassType(channel);
}

function requiresSchedulingForSection(section) {
    if (!section) return false;

    const roomTypeReq = normalizeLearningType(section.room_type_req);
    if (roomTypeReq === 'ONLINE') {
        return false;
    }

    const groupCode = String(section.section_id || '').match(/\(([^)]+)\)$/)?.[1] || '';
    if (isOnlineSectionGroupCode(groupCode) && !isCourseraPracticeGroupCode(groupCode)) {
        return false;
    }

    return requiresSchedulingForCourse(section.course || {});
}

function resolvePracticeClassType(roomTypeReq) {
    const normalized = normalizeLearningType(roomTypeReq);
    if (normalized === 'PM') return 'PM';
    if (normalized === 'TH') return 'TH';
    return 'TH';
}

module.exports = {
    DELIVERY_CHANNELS,
    LEARNING_MODES,
    ASYNC_ONLINE_CLASS_TYPES,
    SPECIAL_COURSE_NAME_KEYWORDS,
    normalizeLearningType,
    getLearningMode,
    isPracticeRoomType,
    isOnlineLearningType,
    isSpecialLearningType,
    resolveCourseLearningMode,
    resolveDeliveryChannel,
    requiresSchedulingForCourse,
    requiresSchedulingForSection,
    resolveOnlineClassType,
    resolvePracticeClassType,
    isOnlineSectionGroupCode,
    isCourseraPracticeGroupCode,
};
