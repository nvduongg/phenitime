const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const xlsx = require('xlsx');
const { recalculateCurriculumCredits } = require('../utils/curriculumCredits');
const {
    loadCurriculumLookup,
    resolveStudentGroupCurriculum,
} = require('../utils/studentGroupCurriculum');
const { loadMajorLookups } = require('../utils/majorResolver');
const { resolveMajorIdForInsert, applyMajorIdRenames } = require('../utils/majorIdAssignment');
const { resolveCourseTemplateCode } = require('../utils/sectioningTemplates');
const { syncCourseCreditFields } = require('../utils/periodCalculator');
const { syncCourseOfflineFields } = require('../utils/offlineScheduleConfig');
const { getCourseDefaultRoomType } = require('../constants/roomTypes');
const { normalizeUnitId, resolveImportUnitId, buildLegacyUnitErrorMessage } = require('../utils/unitResolver');
const {
    COURSE_IMPORT_COLUMN,
    parseCourseImportRows,
    pickImportCell,
    pickImportNumber,
    repairGarbledClassTypeCode,
} = require('../utils/courseImportRows');
const { parseCourseIdList } = require('../utils/parseCourseIdList');
const { parseLecturerImportRows } = require('../utils/lecturerImportRows');
const { normalizeDeliveryChannelInput } = require('../utils/deliveryChannels');

function parseUploadRows(file) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((name) => /du.?li?e?u|data/i.test(name))
        || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(worksheet, { defval: null });
}

function pickValue(row, keys) {
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return null;
}

function pickNumber(row, keys, fallback = null) {
    const raw = pickValue(row, keys);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

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

function pickRowValue(row, keys) {
    const lookup = new Map(
        Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value]),
    );

    for (const key of keys) {
        const value = lookup.get(normalizeHeaderKey(key));
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }

    for (const key of keys) {
        const target = stripDiacritics(normalizeHeaderKey(key));
        for (const [header, value] of Object.entries(row)) {
            if (value === undefined || value === null || String(value).trim() === '') continue;
            const normalizedHeader = stripDiacritics(normalizeHeaderKey(header));
            if (normalizedHeader === target || normalizedHeader.includes(target)) {
                return String(value).trim();
            }
        }
    }

    return null;
}

function pickRowNumber(row, keys, fallback = null) {
    const raw = pickRowValue(row, keys);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLecturerId(raw) {
    if (!raw) return null;

    const text = String(raw).trim();
    const parenMatch = text.match(/\(([^)]+)\)/);
    if (parenMatch) return parenMatch[1].trim();

    const dashParts = text.split(' - ');
    if (dashParts.length > 1) return dashParts[dashParts.length - 1].trim();

    return null;
}

function parseStudentGroupTokens(raw) {
    if (!raw) return [];

    return [
        ...new Set(
            String(raw)
                .split(/[;,]/)
                .map((token) => token.trim())
                .filter(Boolean),
        ),
    ];
}

async function ensureStudentGroupId(prisma, groupId, { curriculumLookup, majorLookups }) {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return { groupId: null };

    const existing = await prisma.studentGroup.findUnique({
        where: { group_id: normalizedGroupId },
        select: { group_id: true },
    });
    if (existing) return { groupId: existing.group_id };

    const resolved = await resolveStudentGroupCurriculum(prisma, {
        groupId: normalizedGroupId,
        curriculumLookup,
        majorLookups,
        autoCreateCurriculum: true,
    });

    if (resolved.error) {
        return { error: `${normalizedGroupId}: ${resolved.error}` };
    }

    await prisma.studentGroup.create({
        data: {
            group_id: resolved.groupId,
            group_name: resolved.groupId,
            curriculum_id: resolved.curriculumId,
        },
    });

    return { groupId: resolved.groupId, created: true };
}

function normalizeRoomType(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return 'LT';

    const aliases = {
        'giảng đường lý thuyết': 'LT',
        lt: 'LT',
        'phòng máy tính': 'PM',
        pm: 'PM',
        'phòng thí nghiệm': 'TN',
        tn: 'TN',
        'sân bãi': 'SB',
        'nhà thể chất': 'SB',
        sb: 'SB',
        'xưởng thực hành': 'XT',
        xt: 'XT',
        'bệnh viện': 'BV',
        bv: 'BV',
        'doanh nghiệp': 'DN',
        dn: 'DN',
        online: 'ONLINE',
        'trực tuyến': 'ONLINE',
        // Legacy
        th: 'TH',
        lab: 'LAB',
    };

    const lowered = raw.toLowerCase();
    if (aliases[lowered]) return aliases[lowered];

    return raw.toUpperCase();
}

function normalizeClassType(value) {
    return normalizeDeliveryChannelInput(value);
}

function normalizeCourseType(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'MANDATORY';

    const aliases = {
        mandatory: 'MANDATORY',
        'bắt buộc': 'MANDATORY',
        elective: 'ELECTIVE',
        'tự chọn': 'ELECTIVE',
    };

    const lowered = raw.toLowerCase();
    if (aliases[lowered]) return aliases[lowered];

    return raw.toUpperCase();
}

function sendImportSuccess(res, insertedCount, totalScanned, errors = []) {
    res.status(200).json({
        status: 'success',
        message: 'Import dữ liệu thành công',
        data: {
            total_scanned: totalScanned,
            inserted_count: insertedCount,
            errors,
        },
    });
}

async function findMissingReferences({ unitIds = [], courseIds = [], curriculumIds = [], majorIds = [] }) {
    const [existingUnits, existingCourses, existingCurricula, existingMajors] = await Promise.all([
        unitIds.length
            ? prisma.organizationUnit.findMany({
                where: { unit_id: { in: unitIds } },
                select: { unit_id: true },
            })
            : [],
        courseIds.length
            ? prisma.course.findMany({
                where: { course_id: { in: courseIds } },
                select: { course_id: true },
            })
            : [],
        curriculumIds.length
            ? prisma.curriculum.findMany({
                where: { curriculum_id: { in: curriculumIds } },
                select: { curriculum_id: true },
            })
            : [],
        majorIds.length
            ? prisma.major.findMany({
                where: { major_id: { in: majorIds } },
                select: { major_id: true },
            })
            : [],
    ]);

    const unitSet = new Set(existingUnits.map((unit) => unit.unit_id));
    const courseSet = new Set(existingCourses.map((course) => course.course_id));
    const curriculumSet = new Set(existingCurricula.map((curriculum) => curriculum.curriculum_id));
    const majorSet = new Set(existingMajors.map((major) => major.major_id));

    return {
        missingUnits: unitIds.filter((id) => !unitSet.has(id)),
        missingCourses: courseIds.filter((id) => !courseSet.has(id)),
        missingCurricula: curriculumIds.filter((id) => !curriculumSet.has(id)),
        missingMajors: majorIds.filter((id) => !majorSet.has(id)),
    };
}

function sendMissingReferenceError(
    res,
    missingUnits = [],
    missingCourses = [],
    missingCurricula = [],
    missingMajors = [],
) {
    const parts = [];
    if (missingUnits.length) {
        parts.push(`Mã khoa chưa có: ${missingUnits.join(', ')}`);
    }
    if (missingCourses.length) {
        parts.push(`Mã học phần chưa có: ${missingCourses.join(', ')}`);
    }
    if (missingCurricula.length) {
        parts.push(`Mã CTĐT chưa có: ${missingCurricula.join(', ')}`);
    }
    if (missingMajors.length) {
        parts.push(`Mã ngành chưa có: ${missingMajors.join(', ')}`);
    }

    const detail = parts.length
        ? `${parts.join('. ')}. Vui lòng thêm vào hệ thống hoặc sửa file import.`
        : 'Vui lòng kiểm tra lại file import.';

    return res.status(400).json({
        status: 'fail',
        message: `Lỗi ràng buộc dữ liệu. ${detail}`,
        data: {
            missing_units: missingUnits,
            missing_courses: missingCourses,
            missing_curricula: missingCurricula,
            missing_majors: missingMajors,
        },
    });
}

exports.importCourses = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn một file Excel/CSV để upload' });
        }

        const rows = parseCourseImportRows(req.file);
        const coursesToInsert = [];
        const legacyUnitCodes = [];
        const unresolvedCourses = [];

        rows.forEach((row) => {
            const courseId = pickImportCell(row, COURSE_IMPORT_COLUMN.course_id, pickRowValue, [
                'Mã học phần', 'Mã môn học', 'Mã môn', 'course_id',
            ]);
            const courseName = pickImportCell(row, COURSE_IMPORT_COLUMN.course_name, pickRowValue, [
                'Tên học phần', 'Tên môn học', 'Tên môn', 'course_name',
            ]);
            const unitResolution = resolveImportUnitId({ courseId, pickRowValue, row });
            const classType = normalizeClassType(
                pickImportCell(row, COURSE_IMPORT_COLUMN.class_type, pickRowValue, [
                    'Hình thức học', 'class_type',
                ]) || 'LT',
            );
            const roomType = normalizeRoomType(
                pickImportCell(row, COURSE_IMPORT_COLUMN.room_type, pickRowValue, [
                    'Yêu cầu phòng', 'Loại phòng', 'Loại phòng mặc định', 'Địa điểm học', 'room_type',
                ]) || 'LT',
            );
            const templateCode = resolveCourseTemplateCode({
                template_code: pickImportCell(row, COURSE_IMPORT_COLUMN.template_code, pickRowValue, [
                    'Mẫu sinh lớp', 'Template', 'template_code',
                ]) || 'STANDARD',
            });

            if (!courseId || !courseName) return;

            if (!unitResolution.unitId) {
                unresolvedCourses.push({
                    course_id: courseId,
                    unit_in_file: unitResolution.rejectedUnitId || null,
                });
                if (unitResolution.isLegacy && unitResolution.rejectedUnitId) {
                    legacyUnitCodes.push(unitResolution.rejectedUnitId);
                }
                return;
            }

            coursesToInsert.push(syncCourseOfflineFields(syncCourseCreditFields({
                course_id: courseId,
                course_name: courseName,
                credits: pickImportNumber(
                    row,
                    COURSE_IMPORT_COLUMN.credits,
                    pickRowValue,
                    ['Tổng tín chỉ', 'credits'],
                    3,
                ),
                theory_credits: pickImportNumber(
                    row,
                    COURSE_IMPORT_COLUMN.theory_credits,
                    pickRowValue,
                    ['Tín chỉ lý thuyết', 'TC Lý thuyết', 'theory_credits'],
                    0,
                ),
                practice_credits: pickImportNumber(
                    row,
                    COURSE_IMPORT_COLUMN.practice_credits,
                    pickRowValue,
                    ['Tín chỉ thực hành', 'TC Thực hành', 'practice_credits'],
                    0,
                ),
                class_type: classType,
                room_type: roomType,
                default_room_type: roomType,
                template_code: templateCode,
                unit_id: unitResolution.unitId,
                offline_session_count: pickImportNumber(
                    row,
                    COURSE_IMPORT_COLUMN.offline_session_count,
                    pickRowValue,
                    ['Số buổi offline', 'Buổi offline', 'offline_session_count'],
                    null,
                ),
                offline_periods_per_session: pickImportNumber(
                    row,
                    COURSE_IMPORT_COLUMN.offline_periods_per_session,
                    pickRowValue,
                    ['Tiết/buổi offline', 'offline_periods_per_session'],
                    null,
                ),
                offline_week_rhythm: pickImportCell(row, COURSE_IMPORT_COLUMN.offline_week_rhythm, pickRowValue, [
                    'Nhịp tuần offline', 'offline_week_rhythm',
                ]),
                offline_week_interval: pickImportNumber(
                    row,
                    COURSE_IMPORT_COLUMN.offline_week_interval,
                    pickRowValue,
                    ['Cách N tuần', 'offline_week_interval'],
                    null,
                ),
                offline_active_weeks: pickImportCell(row, COURSE_IMPORT_COLUMN.offline_active_weeks, pickRowValue, [
                    'Tuần offline', 'offline_active_weeks',
                ]),
            })));
        });

        if (legacyUnitCodes.length) {
            return res.status(400).json({
                status: 'fail',
                message: buildLegacyUnitErrorMessage(legacyUnitCodes),
                data: {
                    legacy_units: [...new Set(legacyUnitCodes)],
                    unresolved_courses: unresolvedCourses.slice(0, 20),
                },
            });
        }

        const missingUnitRows = unresolvedCourses.filter((item) => !item.unit_in_file);
        if (missingUnitRows.length) {
            return res.status(400).json({
                status: 'fail',
                message:
                    'Không đọc được cột "Mã khoa" / "Mã khoa quản lý" trong file. '
                    + 'Vui lòng dùng file mẫu, giữ đúng tên cột và điền mã khoa hiện hành (FIS, FCS, FAD, FL, FBA, EIB, FFS…).',
                data: {
                    unresolved_courses: missingUnitRows.slice(0, 20),
                },
            });
        }

        if (coursesToInsert.length === 0) {
            const detail = unresolvedCourses.length
                ? ` ${unresolvedCourses.length} dòng thiếu mã khoa quản lý hợp lệ.`
                : '';
            return res.status(400).json({
                status: 'fail',
                message: `Không tìm thấy dữ liệu hợp lệ trong file.${detail}`,
                data: { unresolved_courses: unresolvedCourses.slice(0, 20) },
            });
        }

        const unitIds = [...new Set(coursesToInsert.map((item) => item.unit_id))];
        const { missingUnits } = await findMissingReferences({ unitIds });

        if (missingUnits.length) {
            return sendMissingReferenceError(res, missingUnits);
        }

        const result = await prisma.course.createMany({
            data: coursesToInsert,
            skipDuplicates: true,
        });

        sendImportSuccess(res, result.count, coursesToInsert.length);
    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                status: 'fail',
                message: 'Lỗi ràng buộc: Mã khoa (unit_id) trong file chưa tồn tại trong hệ thống.',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.importMajors = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn một file Excel/CSV để upload' });
        }

        const rows = parseUploadRows(req.file);
        const existingMajors = await prisma.major.findMany({
            select: { major_id: true, major_code: true },
        });
        const existingIds = new Set(existingMajors.map((major) => major.major_id));
        const majorsToInsert = [];
        const dbRenames = [];

        rows.forEach((row) => {
            const majorCode = pickValue(row, ['major_code', 'Mã ngành']);
            const majorName = pickValue(row, ['major_name', 'Tên ngành']);
            const unitId = normalizeUnitId(
                pickRowValue(row, ['Mã khoa', 'Khoa quản lý', 'unit_id']),
            );

            if (!majorCode || !majorName || !unitId) return;

            const normalizedCode = String(majorCode).trim();
            const normalizedName = String(majorName).trim();
            const resolved = resolveMajorIdForInsert(
                normalizedCode,
                existingIds,
                majorsToInsert,
                existingMajors,
            );
            const majorId = resolved.majorId;
            resolved.dbRenames.forEach((rename) => {
                if (!dbRenames.some((item) => item.from === rename.from)) {
                    dbRenames.push(rename);
                }
            });

            if (existingIds.has(majorId)) {
                return;
            }

            existingIds.add(majorId);
            majorsToInsert.push({
                major_id: majorId,
                major_code: normalizedCode,
                major_name: normalizedName,
                unit_id: unitId,
            });
        });

        if (majorsToInsert.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'Không tìm thấy dữ liệu hợp lệ trong file' });
        }

        const unitIds = [...new Set(majorsToInsert.map((item) => item.unit_id))];
        const { missingUnits } = await findMissingReferences({ unitIds });

        if (missingUnits.length) {
            return sendMissingReferenceError(res, missingUnits);
        }

        const result = await prisma.$transaction(async (tx) => {
            await applyMajorIdRenames(tx, dbRenames);

            return tx.major.createMany({
                data: majorsToInsert,
                skipDuplicates: true,
            });
        });

        sendImportSuccess(res, result.count, majorsToInsert.length);
    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                status: 'fail',
                message: 'Lỗi ràng buộc: Mã khoa (unit_id) trong file chưa tồn tại trong hệ thống.',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.importLecturers = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn một file Excel/CSV để upload' });
        }

        const parsedRows = parseLecturerImportRows(req.file, pickRowValue);
        const lecturersToUpsert = parsedRows.map((row) => ({
            lecturer_id: row.lecturer_id,
            lecturer_name: row.lecturer_name,
            unit_id: normalizeUnitId(row.unit_id),
            max_quota: row.max_quota,
            course_ids: row.course_ids,
        }));

        if (lecturersToUpsert.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'Không tìm thấy dữ liệu hợp lệ trong file' });
        }

        const unitIds = [...new Set(lecturersToUpsert.map((item) => item.unit_id))];
        const courseIds = [...new Set(lecturersToUpsert.flatMap((item) => item.course_ids))];
        const { missingUnits, missingCourses } = await findMissingReferences({ unitIds, courseIds });

        if (missingUnits.length || missingCourses.length) {
            return sendMissingReferenceError(res, missingUnits, missingCourses);
        }

        let created = 0;
        let updated = 0;

        await prisma.$transaction(async (tx) => {
            for (const item of lecturersToUpsert) {
                const existing = await tx.lecturer.findUnique({
                    where: { lecturer_id: item.lecturer_id },
                    select: { lecturer_id: true },
                });

                if (existing) {
                    await tx.lecturer.update({
                        where: { lecturer_id: item.lecturer_id },
                        data: {
                            lecturer_name: item.lecturer_name,
                            unit_id: item.unit_id,
                            max_quota: item.max_quota,
                        },
                    });
                    updated += 1;
                } else {
                    await tx.lecturer.create({
                        data: {
                            lecturer_id: item.lecturer_id,
                            lecturer_name: item.lecturer_name,
                            unit_id: item.unit_id,
                            max_quota: item.max_quota,
                        },
                    });
                    created += 1;
                }

                await tx.lecturerCourseSpecialty.deleteMany({
                    where: { lecturer_id: item.lecturer_id },
                });

                if (item.course_ids.length > 0) {
                    await tx.lecturerCourseSpecialty.createMany({
                        data: item.course_ids.map((course_id) => ({
                            lecturer_id: item.lecturer_id,
                            course_id,
                        })),
                        skipDuplicates: true,
                    });
                }
            }
        });

        res.status(200).json({
            status: 'success',
            message: `Import thành công: ${created} giảng viên mới, ${updated} giảng viên cập nhật (tổng ${lecturersToUpsert.length} dòng).`,
            created,
            updated,
            total: lecturersToUpsert.length,
        });
    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                status: 'fail',
                message: 'Lỗi ràng buộc: Mã khoa hoặc mã học phần trong file chưa tồn tại trong hệ thống.',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.importRooms = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn một file Excel/CSV để upload' });
        }

        const rows = parseUploadRows(req.file);
        const roomsToInsert = [];

        rows.forEach((row) => {
            const roomId = pickValue(row, ['room_id', 'Mã phòng']);
            const roomType = normalizeRoomType(pickValue(row, ['room_type', 'Loại phòng']));
            const capacity = pickNumber(row, ['capacity', 'Sức chứa']);

            if (!roomId || !roomType || capacity === null) return;

            roomsToInsert.push({
                room_id: roomId,
                room_type: roomType,
                capacity,
            });
        });

        if (roomsToInsert.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'Không tìm thấy dữ liệu hợp lệ trong file' });
        }

        const result = await prisma.room.createMany({
            data: roomsToInsert,
            skipDuplicates: true,
        });

        sendImportSuccess(res, result.count, roomsToInsert.length);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.importCourseSections = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn một file Excel/CSV để upload' });
        }

        const { semester_id } = req.body;
        if (!semester_id) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng cung cấp mã học kỳ (semester_id)' });
        }

        const semester = await prisma.semester.findUnique({ where: { semester_id } });
        if (!semester) {
            return res.status(400).json({
                status: 'fail',
                message: `Mã học kỳ '${semester_id}' chưa tồn tại. Vui lòng tạo học kỳ trước khi import.`,
            });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < rawData.length; i++) {
            if (!rawData[i]) continue;

            const rowString = rawData[i]
                .map((cell) => String(cell || '').trim().toLowerCase())
                .join('|');

            if (
                rowString.includes('lớp học phần') &&
                (rowString.includes('mã học phần') || rowString.includes('mã hp'))
            ) {
                headerRowIndex = i;
                headers = rawData[i].map((col) => (col ? String(col).trim() : ''));
                break;
            }
        }

        if (headerRowIndex === -1) {
            return res.status(400).json({
                status: 'fail',
                message: 'File không đúng định dạng. Không tìm thấy cột "Lớp học phần" và "Mã HP/Mã học phần".',
            });
        }

        const parsedRows = [];
        const errors = [];

        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const rowArray = rawData[i];
            const row = {};

            headers.forEach((header, index) => {
                if (header) row[header] = rowArray[index];
            });

            const sectionId = pickRowValue(row, ['Lớp học phần']);
            const courseId = pickRowValue(row, ['Mã học phần', 'Mã HP', 'Mã môn học']);

            if (!sectionId || !courseId) continue;

            const capacity = pickRowNumber(
                row,
                ['Số SV dự kiến', 'Số SV dự kiến ', 'Số lượng', 'Sĩ số', 'Sĩ số dự kiến'],
                40,
            );
            const lecturerRaw = pickRowValue(row, ['Giảng Viên 1', 'Giảng viên', 'Giảng Viên']);
            const groupTokens = parseStudentGroupTokens(
                pickRowValue(row, ['Nhóm KS', 'Nhom KS', 'Lớp sinh viên', 'Nhóm sinh viên']),
            );

            parsedRows.push({
                rowNumber: i + 1,
                section_id: sectionId,
                course_id: courseId,
                semester_id,
                lecturer_id: parseLecturerId(lecturerRaw),
                class_type: normalizeClassType(
                    pickRowValue(row, ['Hình thức học', 'Hình thức']) || 'LT',
                ),
                capacity,
                groupTokens,
            });
        }

        if (parsedRows.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'Không tìm thấy dữ liệu hợp lệ trong file' });
        }

        // File TKB thường lặp cùng lớp học phần theo từng buổi — giữ dòng cuối cho mỗi section_id
        const uniqueRows = [...new Map(parsedRows.map((item) => [item.section_id, item])).values()];

        const courseIds = [...new Set(uniqueRows.map((item) => item.course_id))];
        const { missingCourses } = await findMissingReferences({ courseIds });
        if (missingCourses.length) {
            return sendMissingReferenceError(res, [], missingCourses);
        }

        const courseRecords = await prisma.course.findMany({
            where: { course_id: { in: courseIds } },
            select: {
                course_id: true,
                room_type: true,
                default_room_type: true,
            },
        });
        const courseById = new Map(courseRecords.map((course) => [course.course_id, course]));

        const resolveImportedRoomTypeReq = (course, classType) => {
            const defaultRoom = getCourseDefaultRoomType(course);
            const normalizedClassType = String(classType || 'LT').toUpperCase();
            if (normalizedClassType === 'TH') return defaultRoom;
            if (normalizedClassType === 'LT') return 'LT';
            return defaultRoom;
        };

        const [curriculumLookup, majorLookups] = await Promise.all([
            loadCurriculumLookup(prisma),
            loadMajorLookups(prisma),
        ]);

        let insertedCount = 0;
        let updatedCount = 0;
        let linkedGroupCount = 0;
        let createdGroupCount = 0;

        for (const item of uniqueRows) {
            const connectedGroupIds = [];

            for (const groupToken of item.groupTokens) {
                const groupResult = await ensureStudentGroupId(prisma, groupToken, {
                    curriculumLookup,
                    majorLookups,
                });

                if (groupResult.error) {
                    errors.push(`Dòng ${item.rowNumber}: ${groupResult.error}`);
                    continue;
                }

                if (groupResult.groupId) {
                    connectedGroupIds.push(groupResult.groupId);
                    if (groupResult.created) createdGroupCount += 1;
                }
            }

            linkedGroupCount += connectedGroupIds.length;

            const existing = await prisma.courseSection.findUnique({
                where: { section_id: item.section_id },
                select: { section_id: true },
            });

            const sectionData = {
                course_id: item.course_id,
                semester_id: item.semester_id,
                lecturer_id: item.lecturer_id,
                class_type: item.class_type,
                room_type_req: resolveImportedRoomTypeReq(
                    courseById.get(item.course_id),
                    item.class_type,
                ),
                capacity: item.capacity,
                student_groups: connectedGroupIds.length
                    ? { set: connectedGroupIds.map((groupId) => ({ group_id: groupId })) }
                    : { set: [] },
            };

            if (existing) {
                await prisma.courseSection.update({
                    where: { section_id: item.section_id },
                    data: sectionData,
                });
                updatedCount += 1;
            } else {
                await prisma.courseSection.create({
                    data: {
                        section_id: item.section_id,
                        ...sectionData,
                    },
                });
                insertedCount += 1;
            }
        }

        res.status(200).json({
            status: 'success',
            message: 'Import lớp học phần thành công',
            data: {
                total_scanned: parsedRows.length,
                unique_sections: uniqueRows.length,
                inserted_count: insertedCount,
                updated_count: updatedCount,
                linked_group_count: linkedGroupCount,
                created_group_count: createdGroupCount,
                errors,
            },
        });
    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                status: 'fail',
                message: 'Lỗi ràng buộc: Mã môn học hoặc mã giảng viên trong file Excel chưa tồn tại trong hệ thống.',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.importRoadmaps = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn một file Excel/CSV để upload' });
        }

        const { curriculum_id } = req.body;
        if (!curriculum_id) {
            return res.status(400).json({
                status: 'fail',
                message: 'Vui lòng cung cấp mã chương trình đào tạo (curriculum_id)',
            });
        }

        const curriculum = await prisma.curriculum.findUnique({ where: { curriculum_id } });
        if (!curriculum) {
            return res.status(400).json({
                status: 'fail',
                message: `Mã CTĐT '${curriculum_id}' chưa tồn tại trong hệ thống.`,
            });
        }

        const rows = parseUploadRows(req.file);
        const roadmapsToInsert = [];

        rows.forEach((row) => {
            const courseId = pickValue(row, ['course_id', 'Mã học phần', 'Mã môn học']);
            const recommendedSemester = pickNumber(
                row,
                ['recommended_semester', 'Học kỳ KN', 'Học kỳ', 'Học kỳ khuyến nghị'],
            );
            const courseType = normalizeCourseType(
                pickValue(row, ['course_type', 'Loại môn', 'Loại học phần']) || 'MANDATORY',
            );

            if (!courseId || recommendedSemester === null) return;

            roadmapsToInsert.push({
                curriculum_id,
                course_id: courseId,
                recommended_semester: recommendedSemester,
                course_type: courseType,
            });
        });

        if (roadmapsToInsert.length === 0) {
            return res.status(400).json({ status: 'fail', message: 'Không tìm thấy dữ liệu hợp lệ trong file' });
        }

        const courseIds = [...new Set(roadmapsToInsert.map((item) => item.course_id))];
        const { missingCourses } = await findMissingReferences({ courseIds });

        if (missingCourses.length) {
            return sendMissingReferenceError(res, [], missingCourses);
        }

        const result = await prisma.roadmap.createMany({
            data: roadmapsToInsert,
            skipDuplicates: true,
        });

        await recalculateCurriculumCredits(prisma, curriculum_id);

        sendImportSuccess(res, result.count, roadmapsToInsert.length);
    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                status: 'fail',
                message: 'Lỗi ràng buộc: Mã học phần trong file chưa tồn tại trong hệ thống.',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.importStudentGroups = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Vui lòng chọn một file Excel/CSV để upload' });
        }

        const rows = parseUploadRows(req.file);
        const [curriculumLookup, majorLookups] = await Promise.all([
            loadCurriculumLookup(prisma),
            loadMajorLookups(prisma),
        ]);
        const groupsToInsert = [];
        const errors = [];
        const pendingRows = [];

        rows.forEach((row, index) => {
            const groupId = pickValue(row, ['group_id', 'Mã lớp', 'Tên lớp']);
            const majorRef = pickValue(row, ['major_code', 'Mã ngành', 'Ngành']);
            const cohortId = pickValue(row, ['cohort_id', 'Niên khóa', 'Mã niên khóa']);
            const internalMajorId = pickValue(row, ['major_id']) || majorRef;

            if (!groupId) return;

            pendingRows.push({
                rowIndex: index + 2,
                groupId,
                majorRef,
                internalMajorId,
                cohortId,
                studentCount: pickNumber(row, ['student_count', 'Sĩ số']),
            });
        });

        for (const item of pendingRows) {
            const resolved = await resolveStudentGroupCurriculum(prisma, {
                groupId: item.groupId,
                majorRef: item.majorRef,
                internalMajorId: item.internalMajorId,
                cohortId: item.cohortId,
                curriculumLookup,
                majorLookups,
                autoCreateCurriculum: true,
            });

            if (resolved.ambiguous) {
                const options = resolved.candidates
                    .map((major) => `${major.major_id} (${major.major_name})`)
                    .join('; ');
                errors.push(`Dòng ${item.rowIndex}: ${resolved.error}. Chọn: ${options}`);
                continue;
            }

            if (resolved.error) {
                errors.push(`Dòng ${item.rowIndex}: ${resolved.error}`);
                continue;
            }

            groupsToInsert.push({
                group_id: resolved.groupId,
                group_name: resolved.groupId,
                curriculum_id: resolved.curriculumId,
                student_count: item.studentCount,
            });
        }

        if (groupsToInsert.length === 0) {
            const detail = errors.length ? errors.slice(0, 5).join('; ') : 'Không tìm thấy dữ liệu hợp lệ trong file';
            return res.status(400).json({ status: 'fail', message: detail });
        }

        const result = await prisma.studentGroup.createMany({
            data: groupsToInsert,
            skipDuplicates: true,
        });

        sendImportSuccess(res, result.count, groupsToInsert.length, errors);
    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({
                status: 'fail',
                message: 'Lỗi ràng buộc: Ngành, niên khóa hoặc CTĐT liên quan chưa tồn tại trong hệ thống.',
            });
        }
        res.status(500).json({ status: 'error', message: error.message });
    }
};