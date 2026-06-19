const xlsx = require('xlsx');
const { parseCourseIdList } = require('./parseCourseIdList');

const LECTURER_IMPORT_COLUMN = {
    lecturer_id: 0,
    lecturer_name: 1,
    unit_id: 2,
    max_quota: 3,
    specialties: 4,
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

function looksLikeLecturerId(value) {
    return /^[A-Z]{2,}\d+[A-Z0-9]*$/i.test(String(value || '').trim());
}

function findLecturerHeaderRowIndex(matrix) {
    for (let index = 0; index < matrix.length; index += 1) {
        const row = matrix[index];
        if (!Array.isArray(row)) continue;

        if (row.some((cell) => {
            const text = stripDiacritics(normalizeHeaderKey(cell));
            return text.includes('ma giang vien') || text === 'lecturer_id';
        })) {
            return index;
        }

        if (looksLikeLecturerId(row[0]) && index > 0) {
            return index - 1;
        }
    }

    return -1;
}

function readImportMatrix(fileOrPath) {
    if (Buffer.isBuffer(fileOrPath?.buffer)) {
        const workbook = xlsx.read(fileOrPath.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames.find((name) => /du.?li?e?u|data/i.test(name))
            || workbook.SheetNames[0];
        return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
    }

    const filePath = String(fileOrPath);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
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

function parseLecturerImportRows(file, pickRowValue, options = {}) {
    const defaultMaxQuota = Number(options.defaultMaxQuota) || 15;
    const matrix = readImportMatrix(file);
    const headerRowIndex = findLecturerHeaderRowIndex(matrix);
    if (headerRowIndex < 0) return [];

    const headers = matrix[headerRowIndex] || [];
    return matrix
        .slice(headerRowIndex + 1)
        .filter((cells) => Array.isArray(cells) && isValidImportCell(cells[LECTURER_IMPORT_COLUMN.lecturer_id]))
        .map((cells) => {
            const row = { __cells: cells };
            headers.forEach((header, index) => {
                if (header != null && String(header).trim() !== '') {
                    row[String(header).trim()] = cells[index] ?? null;
                }
            });
            return row;
        })
        .map((row) => ({
            row,
            lecturer_id: pickImportCell(row, LECTURER_IMPORT_COLUMN.lecturer_id, pickRowValue, [
                'Mã giảng viên', 'lecturer_id',
            ])?.toUpperCase() || null,
            lecturer_name: pickImportCell(row, LECTURER_IMPORT_COLUMN.lecturer_name, pickRowValue, [
                'Họ tên', 'Tên giảng viên', 'lecturer_name',
            ]),
            unit_id: pickImportCell(row, LECTURER_IMPORT_COLUMN.unit_id, pickRowValue, [
                'Mã khoa', 'Khoa', 'unit_id',
            ])?.toUpperCase() || null,
            max_quota: pickImportNumber(
                row,
                LECTURER_IMPORT_COLUMN.max_quota,
                pickRowValue,
                ['Định mức', 'max_quota'],
                defaultMaxQuota,
            ),
            course_ids: parseCourseIdList(
                pickImportCell(row, LECTURER_IMPORT_COLUMN.specialties, pickRowValue, [
                    'Chuyên môn', 'course_ids', 'Mã học phần', 'Mã môn học',
                ]),
            ),
        }))
        .filter((item) => item.lecturer_id && item.lecturer_name && item.unit_id);
}

module.exports = {
    LECTURER_IMPORT_COLUMN,
    parseLecturerImportRows,
};
