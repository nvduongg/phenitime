const fs = require('fs');
const path = require('path');
const {
    LEGACY_UNIT_CODE_SET,
    buildLegacyUnitErrorMessage,
} = require('../constants/legacyUnitCodes');

const COURSE_UNIT_OVERRIDES_PATH = path.resolve(
    __dirname,
    '../../data/course-unit-overrides.json',
);

const UNIT_COLUMN_INDEX = 8;

let cachedCourseUnitOverrides = null;

function normalizeUnitId(raw) {
    if (raw === undefined || raw === null) return null;

    const normalized = String(raw)
        .replace(/^\uFEFF/, '')
        .replace(/\u00A0/g, ' ')
        .trim()
        .toUpperCase();

    return normalized || null;
}

function loadCourseUnitOverrides() {
    if (cachedCourseUnitOverrides) return cachedCourseUnitOverrides;

    cachedCourseUnitOverrides = {};
    if (!fs.existsSync(COURSE_UNIT_OVERRIDES_PATH)) {
        return cachedCourseUnitOverrides;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(COURSE_UNIT_OVERRIDES_PATH, 'utf8'));
        if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([courseId, unitId]) => {
                const normalizedCourseId = String(courseId || '').trim().toUpperCase();
                const normalizedUnitId = normalizeUnitId(unitId);
                if (normalizedCourseId && normalizedUnitId) {
                    cachedCourseUnitOverrides[normalizedCourseId] = normalizedUnitId;
                }
            });
        }
    } catch {
        cachedCourseUnitOverrides = {};
    }

    return cachedCourseUnitOverrides;
}

function isLegacyUnitCode(unitId) {
    return LEGACY_UNIT_CODE_SET.has(unitId);
}

function isUsableImportUnitId(unitId) {
    if (!unitId) return false;
    if (isLegacyUnitCode(unitId)) return false;
    return true;
}

function pickUnitIdFromRow(row, pickRowValue) {
    const fromHeaders = normalizeUnitId(
        pickRowValue(row, [
            'Mã khoa quản lý',
            'Mã khoa',
            'Khoa quản lý',
            'Khoa',
        ]),
    );
    if (fromHeaders) return fromHeaders;

    const fromCell = normalizeUnitId(row?.__cells?.[8]);
    if (fromCell) return fromCell;

    const entries = Object.entries(row || {}).filter(
        ([key, value]) => key !== '__cells'
            && value !== undefined
            && value !== null
            && String(value).trim() !== '',
    );
    if (entries.length > 8) {
        const fromTemplateColumn = normalizeUnitId(entries[8][1]);
        if (fromTemplateColumn) return fromTemplateColumn;
    }

    const fromEnglishColumn = normalizeUnitId(
        pickRowValue(row, ['current_unit_id', 'unit_id']),
    );
    if (isUsableImportUnitId(fromEnglishColumn)) {
        return fromEnglishColumn;
    }

    return null;
}

/**
 * Đọc mã khoa từ file import. Chỉ coi là mã cũ nếu giá trị thực tế trong file là CSE/FBE/FEL/FTS.
 */
function resolveImportUnitId({ courseId, pickRowValue, row }) {
    const rawUnitId = pickUnitIdFromRow(row, pickRowValue);

    if (isUsableImportUnitId(rawUnitId)) {
        return { unitId: rawUnitId, source: 'file' };
    }

    const normalizedCourseId = String(courseId || '').trim().toUpperCase();
    const overrideUnitId = loadCourseUnitOverrides()[normalizedCourseId];
    if (isUsableImportUnitId(overrideUnitId)) {
        return { unitId: overrideUnitId, source: 'override_file' };
    }

    return {
        unitId: null,
        rejectedUnitId: rawUnitId,
        isLegacy: Boolean(rawUnitId && isLegacyUnitCode(rawUnitId)),
        missingUnit: !rawUnitId,
    };
}

module.exports = {
    normalizeUnitId,
    resolveImportUnitId,
    pickUnitIdFromRow,
    isLegacyUnitCode,
    isUsableImportUnitId,
    buildLegacyUnitErrorMessage,
    loadCourseUnitOverrides,
};
