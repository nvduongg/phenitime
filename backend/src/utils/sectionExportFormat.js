const {
    resolveDeliveryChannel,
    DELIVERY_CHANNELS,
    isCourseraBaseGroupCode,
    isCourseraPracticeGroupCode,
} = require('./deliveryChannels');
const { normalizeLearningType } = require('./learningModes');

const SECTION_ID_RE = /^(.+)\(([^)]+)\)$/;
const SECTION_GROUP_RE = /\(([^)]+)\)$/;

function parseSectionGroupCode(sectionId) {
    return String(sectionId ?? '').match(SECTION_GROUP_RE)?.[1] ?? '';
}

function parseSectionIdParts(sectionId) {
    const id = String(sectionId ?? '').trim();
    const match = id.match(SECTION_ID_RE);
    if (!match) {
        return { prefix: id, groupCode: '' };
    }
    return { prefix: match[1], groupCode: match[2] };
}

function formatGroupCodeForExport(groupCode) {
    const code = String(groupCode || '').trim();
    if (!code) return code;

    const elnMatch = code.match(/^ELN(\d+)$/i);
    if (elnMatch) {
        return `N${elnMatch[1]}.ELN0`;
    }

    return code;
}

function formatSectionIdForExport(sectionOrId) {
    const sectionId = typeof sectionOrId === 'string'
        ? sectionOrId
        : sectionOrId?.section_id;
    const { prefix, groupCode } = parseSectionIdParts(sectionId);
    if (!groupCode) return String(sectionId || '');
    return `${prefix}(${formatGroupCodeForExport(groupCode)})`;
}

function isAsyncOnlineExportSection(section) {
    if (!section) return false;

    const groupCode = parseSectionGroupCode(section.section_id);
    if (isCourseraPracticeGroupCode(groupCode)) return false;

    if (normalizeLearningType(section.room_type_req) === 'ONLINE') {
        return true;
    }

    if (isCourseraBaseGroupCode(groupCode)) {
        return true;
    }

    if (/^ELN\d+$/i.test(groupCode)) {
        return true;
    }

    const channel = resolveDeliveryChannel(section.course || {});
    if (channel === DELIVERY_CHANNELS.ELEARNING) {
        return normalizeLearningType(section.room_type_req) === 'ONLINE'
            || /^ELN\d+$/i.test(groupCode);
    }

    if (channel === DELIVERY_CHANNELS.COURSERA
        && (isCourseraBaseGroupCode(groupCode) || /^ELN\d+$/i.test(groupCode))) {
        return true;
    }

    return false;
}

module.exports = {
    parseSectionIdParts,
    formatGroupCodeForExport,
    formatSectionIdForExport,
    isAsyncOnlineExportSection,
};
