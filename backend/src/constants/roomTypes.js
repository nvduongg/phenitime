const ROOM_TYPE_LABELS = {
    LT: 'Giảng đường lý thuyết',
    STD: 'Giảng đường đại trà',
    PM: 'Phòng máy tính',
    PC: 'Phòng máy tính (PC lab)',
    TN: 'Phòng thí nghiệm',
    SB: 'Sân bãi / Nhà thể chất',
    XT: 'Xưởng thực hành',
    BV: 'Bệnh viện',
    MED: 'Phòng lâm sàng / Y khoa',
    DN: 'Doanh nghiệp',
    ONLINE: 'Trực tuyến',
    // Legacy
    TH: 'Thực hành (TH)',
    LAB: 'Phòng Lab (LAB)',
};

const ROOM_TYPE_CAPACITY = {
    LT: 80,
    STD: 80,
    PM: 40,
    PC: 45,
    TN: 40,
    SB: 40,
    XT: 40,
    BV: 40,
    MED: 20,
    DN: 40,
    ONLINE: 9999,
    TH: 40,
    LAB: 40,
};

const {
    LEARNING_MODES,
    ASYNC_ONLINE_CLASS_TYPES,
    getLearningMode,
    isOnlineLearningType,
    isPracticeRoomType,
    isSpecialLearningType,
    requiresSchedulingForCourse,
    resolveOnlineClassType,
    resolvePracticeClassType,
} = require('../utils/constants');

const VALID_ROOM_TYPES = new Set(Object.keys(ROOM_TYPE_LABELS));
const COMBINED_ROOM_TYPES = new Set(['PM']);

function normalizeRoomType(value, fallback = 'LT') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;

    const upper = raw.toUpperCase();
    if (VALID_ROOM_TYPES.has(upper)) return upper;

    return fallback;
}

function getCourseDefaultRoomType(course) {
    return normalizeRoomType(
        course?.default_room_type || course?.room_type,
        'LT',
    );
}

function getCapacityForRoomType(roomType, config = {}) {
    const normalized = normalizeRoomType(roomType);
    const configured = Number(config?.room_type_capacities?.[normalized]);
    if (Number.isFinite(configured) && configured > 0) {
        return configured;
    }
    return ROOM_TYPE_CAPACITY[normalized] || 30;
}

function isCombinedRoomType(roomType) {
    return isPracticeRoomType(roomType) && normalizeRoomType(roomType) === 'PM';
}

function isOnlineRoomType(roomType) {
    return isOnlineLearningType(roomType);
}

function isElearningCourse(course) {
    return getLearningMode(getCourseDefaultRoomType(course)) === 'ONLINE'
        || getLearningMode(String(course?.class_type || '')) === 'ONLINE';
}

function formatPracticeGroupCode(index) {
    return `TH${String(index).padStart(2, '0')}`;
}

module.exports = {
    ROOM_TYPE_LABELS,
    ROOM_TYPE_CAPACITY,
    COMBINED_ROOM_TYPES,
    LEARNING_MODES,
    ASYNC_ONLINE_CLASS_TYPES,
    VALID_ROOM_TYPES,
    normalizeRoomType,
    getCourseDefaultRoomType,
    getCapacityForRoomType,
    getLearningMode,
    isCombinedRoomType,
    isOnlineRoomType,
    isPracticeRoomType,
    isSpecialLearningType,
    isElearningCourse,
    requiresSchedulingForCourse,
    resolveOnlineClassType,
    resolvePracticeClassType,
    formatPracticeGroupCode,
};
