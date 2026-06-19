const xlsx = require('xlsx');

const COURSE_IMPORT_COLUMN = {
    course_id: 0,
    course_name: 1,
    credits: 2,
    theory_credits: 3,
    practice_credits: 4,
    class_type: 5,
    room_type: 6,
    template_code: 7,
    unit_id: 8,
    offline_session_count: 9,
    offline_periods_per_session: 10,
    offline_week_rhythm: 11,
    offline_week_interval: 12,
    offline_active_weeks: 13,
};

function normalizeHeaderKey(header) {
    return String(header || '')
        .replace(/^\uFEFF/, '')
        .normalize('NFC')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function stripDiacritics(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function isValidImportCell(value) {
    if (value === undefined || value === null) return false;
    const text = String(value).trim();
    return text !== '' && text !== '-';
}

function looksLikeCourseId(value) {
    return /^[A-Z]{2,5}\d{3,}[A-Z0-9]*$/i.test(String(value || '').trim());
}

function repairGarbledClassTypeCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return raw;
    if (raw === 'ĐA' || raw === 'DA') return 'ĐA';

    const codes = [...raw].map((char) => char.charCodeAt(0));
    if (codes.length === 3 && codes[0] === 196 && codes[1] === 144 && codes[2] === 65) {
        return 'ĐA';
    }

    return raw;
}

function findCourseHeaderRowIndex(matrix) {
    for (let index = 0; index < matrix.length; index += 1) {
        const row = matrix[index];
        if (!Array.isArray(row)) continue;

        if (row.some((cell) => {
            const text = stripDiacritics(normalizeHeaderKey(cell));
            return text.includes('ma hoc phan') || text === 'course_id';
        })) {
            return index;
        }

        if (looksLikeCourseId(row[0]) && index > 0) {
            return index - 1;
        }
    }

    return -1;
}

function parseCourseImportRows(file) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((name) => /du.?li?e?u|data/i.test(name))
        || workbook.SheetNames[0];
    const matrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });

    const headerRowIndex = findCourseHeaderRowIndex(matrix);
    if (headerRowIndex < 0) {
        return [];
    }

    const headers = matrix[headerRowIndex] || [];
    return matrix
        .slice(headerRowIndex + 1)
        .filter((cells) => Array.isArray(cells) && cells.some((cell) => isValidImportCell(cell)))
        .map((cells) => {
            const row = { __cells: cells };
            headers.forEach((header, index) => {
                if (header != null && String(header).trim() !== '') {
                    row[String(header).trim()] = cells[index] ?? null;
                }
            });
            return row;
        });
}

function pickImportCell(row, columnIndex, pickRowValue, headerKeys = []) {
    if (headerKeys.length && pickRowValue) {
        const fromHeader = pickRowValue(row, headerKeys);
        if (isValidImportCell(fromHeader)) {
            return String(fromHeader).trim();
        }
    }

    const fromCell = row?.__cells?.[columnIndex];
    if (isValidImportCell(fromCell)) {
        return String(fromCell).trim();
    }

    return null;
}

function pickImportNumber(row, columnIndex, pickRowValue, headerKeys, fallback = null) {
    if (headerKeys.length && pickRowValue) {
        const fromHeader = pickRowValue(row, headerKeys);
        if (fromHeader !== null) {
            const parsed = Number(fromHeader);
            if (Number.isFinite(parsed)) return parsed;
        }
    }

    const fromCell = row?.__cells?.[columnIndex];
    const parsed = Number(fromCell);
    if (Number.isFinite(parsed)) return parsed;

    return fallback;
}

module.exports = {
    COURSE_IMPORT_COLUMN,
    isValidImportCell,
    parseCourseImportRows,
    pickImportCell,
    pickImportNumber,
    repairGarbledClassTypeCode,
};
