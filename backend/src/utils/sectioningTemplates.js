const { normalizeRoomType, getCourseDefaultRoomType } = require('../constants/roomTypes');
const {
    resolveDeliveryChannel,
    DELIVERY_CHANNELS,
} = require('./deliveryChannels');
const {
    isPracticeRoomType,
    resolveOnlineClassType,
    resolvePracticeClassType,
} = require('./learningModes');

const SECTIONING_TEMPLATES = {
    STANDARD: {
        ltCap: 80,
        thCap: 40,
        ltRoom: 'STD',
        thRoom: 'TH',
    },
    LAB_COUPLED: {
        syncCap: 40,
        ltRoom: 'PC',
        thRoom: 'PC',
    },
    ONLINE: {
        cap: 800,
        room: 'ONLINE',
    },
    MEDICAL_CLINIC: {
        cap: 20,
        room: 'MED',
    },
    SPECIAL: {
        skipsAutoGenerate: true,
    },
};

const TEMPLATE_CODES = Object.freeze(Object.keys(SECTIONING_TEMPLATES));
const DEFAULT_TEMPLATE_CODE = 'STANDARD';

function normalizeTemplateCode(code) {
    return String(code ?? DEFAULT_TEMPLATE_CODE).trim().toUpperCase();
}

function resolveCourseTemplateCode(course) {
    const code = normalizeTemplateCode(course?.template_code);
    return TEMPLATE_CODES.includes(code) ? code : DEFAULT_TEMPLATE_CODE;
}

function resolveTemplateConfig(templateCode) {
    const code = resolveCourseTemplateCode({ template_code: templateCode });
    return SECTIONING_TEMPLATES[code];
}

/** STANDARD template: course default room when practice-type, else template TH room. */
function resolveStandardPracticeRoom(course, template = SECTIONING_TEMPLATES.STANDARD) {
    const defaultRoom = normalizeRoomType(getCourseDefaultRoomType(course), template.thRoom);
    if (defaultRoom === 'TN') {
        return 'TN';
    }
    if (isPracticeRoomType(defaultRoom)) {
        return defaultRoom;
    }
    return template.thRoom;
}

function isSpecialTemplate(templateCode) {
    return resolveCourseTemplateCode({ template_code: templateCode }) === 'SPECIAL';
}

function skipsAutoGenerateForTemplate(templateCode) {
    const code = resolveCourseTemplateCode({ template_code: templateCode });
    return Boolean(SECTIONING_TEMPLATES[code]?.skipsAutoGenerate);
}

function resolveTheoryCredits(course = {}) {
    return Number(course.theory_credits ?? course.tc_lt) || 0;
}

function resolvePracticeCredits(course = {}) {
    return Number(course.practice_credits ?? course.tc_th) || 0;
}

function formatCoupledPracticeGroupCode(baseGroupCode) {
    return `${String(baseGroupCode || '').trim()}.TH1`;
}

/**
 * Derive sectioning rules from the 3 course metadata columns:
 * Hình thức (class_type), Mẫu sinh lớp (template_code), Loại phòng mặc định.
 */
function resolveCourseSectioningProfile(course = {}) {
    const templateCode = resolveCourseTemplateCode(course);
    const template = SECTIONING_TEMPLATES[templateCode] || SECTIONING_TEMPLATES.STANDARD;
    const theoryCredits = resolveTheoryCredits(course);
    const practiceCredits = resolvePracticeCredits(course);
    const defaultRoom = getCourseDefaultRoomType(course);
    const deliveryChannel = resolveDeliveryChannel(course);
    const deliveryMode = deliveryChannel;

    const hasTheory = theoryCredits > 0;
    const hasPractice = practiceCredits > 0;
    const hasMixedCredits = hasTheory && hasPractice;

    /** STANDARD / MEDICAL: separate LT stream + TH stream (N01 + N01.TH1). */
    const splitsLtTh = hasMixedCredits
        && (templateCode === 'STANDARD' || templateCode === 'MEDICAL_CLINIC');

    /**
     * LAB_COUPLED: one section (N01) covers LT+TH together in PC lab — per real TKB.
     * Export shows Hình thức = LT, room = PC, no .TH1 suffix.
     */
    const combinedLtTh = hasMixedCredits && templateCode === 'LAB_COUPLED';

    const usesPracticeSuffix = splitsLtTh;

    let theoryRoomType = 'LT';
    let practiceRoomType = 'TH';
    let theoryCapacity = template.ltCap ?? template.cap ?? 80;
    let practiceCapacity = template.thCap ?? template.cap ?? 40;

    switch (templateCode) {
        case 'LAB_COUPLED':
            theoryRoomType = template.ltRoom;
            practiceRoomType = template.thRoom;
            theoryCapacity = template.syncCap;
            practiceCapacity = template.syncCap;
            break;
        case 'ONLINE':
            theoryRoomType = template.room;
            practiceRoomType = template.room;
            theoryCapacity = template.cap;
            practiceCapacity = template.cap;
            break;
        case 'MEDICAL_CLINIC':
            theoryRoomType = template.room;
            practiceRoomType = template.room;
            theoryCapacity = template.cap;
            practiceCapacity = template.cap;
            break;
        case 'STANDARD':
        default:
            theoryRoomType = template.ltRoom;
            practiceRoomType = resolveStandardPracticeRoom(course, template);
            theoryCapacity = template.ltCap;
            practiceCapacity = template.thCap;
            break;
    }

    let primaryClassType = 'LT';
    if (!hasTheory && hasPractice) {
        primaryClassType = resolvePracticeClassType(defaultRoom);
    } else if (templateCode === 'ONLINE') {
        primaryClassType = resolveOnlineClassType(course);
    } else if (hasTheory) {
        primaryClassType = 'LT';
    }

    const isSplitDelivery = deliveryChannel === DELIVERY_CHANNELS.HYBRID
        || deliveryChannel === DELIVERY_CHANNELS.COURSERA;

    return {
        templateCode,
        deliveryChannel,
        deliveryMode,
        isSplitDelivery,
        defaultRoom,
        theoryCredits,
        practiceCredits,
        hasTheory,
        hasPractice,
        hasMixedCredits,
        splitsLtTh,
        combinedLtTh,
        usesPracticeSuffix,
        theoryRoomType: normalizeRoomType(theoryRoomType),
        practiceRoomType: normalizeRoomType(practiceRoomType),
        theoryCapacity,
        practiceCapacity,
        primaryClassType,
    };
}

module.exports = {
    SECTIONING_TEMPLATES,
    TEMPLATE_CODES,
    DEFAULT_TEMPLATE_CODE,
    normalizeTemplateCode,
    resolveCourseTemplateCode,
    resolveTemplateConfig,
    resolveStandardPracticeRoom,
    isSpecialTemplate,
    skipsAutoGenerateForTemplate,
    resolveTheoryCredits,
    resolvePracticeCredits,
    formatCoupledPracticeGroupCode,
    resolveCourseSectioningProfile,
};
