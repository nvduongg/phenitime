/**
 * Mã đơn vị cũ (trước tái cơ cấu) — không còn tồn tại trong hệ thống.
 * Mỗi học phần phải gán riêng sang mã khoa hiện hành; không thể ánh xạ 1-1.
 */
const LEGACY_UNIT_CODES = {
    CSE: {
        label: 'Khoa CNTT cũ',
        successors: ['FIS', 'FCS', 'FAD'],
        hint: 'Khoa CNTT cũ (CSE) đã tách thành FIS, FCS, FAD — mỗi học phần thuộc một khoa khác nhau.',
    },
    FBE: {
        label: 'Khối kinh tế cũ',
        successors: ['FBA', 'EIB'],
        hint: 'Mã FBE là tiền tố/mã cũ — dùng FBA hoặc EIB tùy khoa quản lý thực tế của từng học phần.',
    },
    FEL: {
        label: 'Khối ngoại ngữ cũ',
        successors: ['FL'],
        hint: 'Mã FEL là tiền tố/mã cũ — khoa quản lý hiện tại là FL.',
    },
    FTS: {
        label: 'Khối kỹ năng mềm cũ',
        successors: ['EIB'],
        hint: 'Mã FTS là tiền tố/mã cũ — nhiều học phần hiện thuộc EIB.',
    },
};

const LEGACY_UNIT_CODE_SET = new Set(Object.keys(LEGACY_UNIT_CODES));

function getLegacyUnitExplanation(code) {
    const legacy = LEGACY_UNIT_CODES[code];
    if (!legacy) return null;
    return `${code} (${legacy.label}): ${legacy.hint} Mã khoa hiện hành: ${legacy.successors.join(', ')}.`;
}

function buildLegacyUnitErrorMessage(codes) {
    const unique = [...new Set(codes.filter((code) => LEGACY_UNIT_CODE_SET.has(code)))];
    if (!unique.length) return null;

    const lines = unique.map((code) => getLegacyUnitExplanation(code)).filter(Boolean);
    return [
        'File đang dùng mã khoa cũ (trước tái cơ cấu), không thể thêm trực tiếp vào hệ thống.',
        ...lines,
        'Vui lòng điền cột "Mã khoa quản lý" (hoặc sửa cột "Mã khoa") bằng mã khoa hiện hành cho từng học phần — không dùng tiền tố mã học phần (CSE/FBE/FEL/FTS).',
    ].join(' ');
}

module.exports = {
    LEGACY_UNIT_CODES,
    LEGACY_UNIT_CODE_SET,
    getLegacyUnitExplanation,
    buildLegacyUnitErrorMessage,
};
