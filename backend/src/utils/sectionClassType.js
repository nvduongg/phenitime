const {
    resolveCourseSectioningProfile,
    resolveStandardPracticeRoom,
    SECTIONING_TEMPLATES,
} = require('./sectioningTemplates');
const { normalizeLearningType, isPracticeRoomType } = require('./learningModes');
const { getCourseDefaultRoomType } = require('../constants/roomTypes');
const {
    resolveOnlineExportClassType,
    isOnlineSectionGroupCode,
    isCourseraBaseGroupCode,
    isCourseraPracticeGroupCode,
} = require('./deliveryChannels');

const SECTION_GROUP_RE = /\(([^)]+)\)$/;

function parseSectionGroupCode(sectionId) {
    const id = String(sectionId ?? '');
    return id.match(SECTION_GROUP_RE)?.[1] ?? '';
}

function isPracticeGroupCode(groupCode) {
    return /\.TH(\d+)?$/i.test(String(groupCode || ''));
}

function resolveSectionClassType(section) {
    if (!section) return 'LT';

    const course = section.course || {};
    const profile = resolveCourseSectioningProfile(course);
    const stored = normalizeLearningType(section.class_type) || profile.primaryClassType;
    const groupCode = parseSectionGroupCode(section.section_id);

    if (isCourseraPracticeGroupCode(groupCode)) {
        return 'TH';
    }

    if (isCourseraBaseGroupCode(groupCode) || (
        isOnlineSectionGroupCode(groupCode)
        && normalizeLearningType(section.room_type_req) === 'ONLINE'
    )) {
        return resolveOnlineExportClassType(stored);
    }

    if (profile.combinedLtTh) {
        return 'LT';
    }

    if (profile.usesPracticeSuffix && isPracticeGroupCode(groupCode)) {
        return 'TH';
    }

    if (profile.splitsLtTh && profile.hasTheory && !isPracticeGroupCode(groupCode)) {
        return 'LT';
    }

    if (!profile.splitsLtTh) {
        if (profile.hasTheory && !profile.hasPractice) {
            return 'LT';
        }
        if (profile.hasPractice && !profile.hasTheory) {
            return stored === 'LT' ? profile.primaryClassType : stored;
        }
        return stored || profile.primaryClassType;
    }

    return stored || profile.primaryClassType;
}

function resolveSectionRoomTypeReq(section, classType = resolveSectionClassType(section)) {
    const course = section?.course || {};
    const profile = resolveCourseSectioningProfile(course);
    const normalizedClass = normalizeLearningType(classType);
    const stored = normalizeLearningType(section?.room_type_req);

    if (profile.combinedLtTh) {
        if (stored && isPracticeRoomType(stored)) {
            return stored;
        }
        if (isPracticeRoomType(profile.defaultRoom)) {
            return profile.defaultRoom;
        }
        return profile.practiceRoomType;
    }

    if (stored) {
        if (normalizedClass === 'LT' && ['LT', 'STD', 'PC', 'PM'].includes(stored)) {
            return stored;
        }
        if (normalizedClass !== 'LT' && !['LT', 'STD'].includes(stored)) {
            return stored;
        }
    }

    if (normalizedClass === 'LT') {
        return profile.theoryRoomType;
    }

    if (profile.practiceRoomType) {
        return profile.practiceRoomType;
    }

    return resolveStandardPracticeRoom(course, SECTIONING_TEMPLATES.STANDARD);
}

module.exports = {
    parseSectionGroupCode,
    isPracticeGroupCode,
    resolveSectionClassType,
    resolveSectionRoomTypeReq,
};
