/**
 * Quy ước mã lớp học phần (theo file Lớp học phần.csv của trường):
 *   {Tên học phần}-{đợt}-{học kỳ}-{năm 2 chữ số}({mã nhóm})
 *
 * Ví dụ HK3 đợt 1 năm học 2025-2026:
 *   Tiếng Anh 3-1-3-25(N01)        — "3" thuộc tên môn, không phải đợt
 *   Bào chế sinh dược học 1-1-3-25(N01.TH1)
 */

function parseSemesterScheduleSuffix(semester) {
    if (!semester) return null;

    const semesterId = String(semester.semester_id || '');

    let term = null;
    let dot = 1;
    let yearShort = null;

    // Quy ước ưu tiên: {năm}_{năm}_{họcKỳ}_{đợt} — VD: 2025_2026_3_1
    const compactMatch = semesterId.match(/^(\d{4})_(\d{4})_(\d+)_(\d+)$/);
    if (compactMatch) {
        yearShort = Number(compactMatch[1]) % 100;
        term = Number(compactMatch[3]);
        dot = Number(compactMatch[4]);
    } else {
        // Tương thích cũ: 2025_2026_HK3_D1
        const termMatch = semesterId.match(/HK(\d+)/i);
        const dotMatch = semesterId.match(/D(\d+)/i);

        term = termMatch ? Number(termMatch[1]) : null;
        dot = dotMatch ? Number(dotMatch[1]) : 1;
    }

    if (yearShort == null) {
        const academicYear = String(semester.academic_year || '');
        const academicYearMatch = academicYear.match(/(\d{4})/);
        if (academicYearMatch) {
            yearShort = Number(academicYearMatch[1]) % 100;
        }
    }

    if (yearShort == null && semester.start_date) {
        const date = new Date(semester.start_date);
        if (!Number.isNaN(date.getTime())) {
            yearShort = date.getFullYear() % 100;
        }
    }

    if (!Number.isFinite(term) || term < 1 || yearShort == null) {
        return null;
    }

    return `${dot}-${term}-${yearShort}`;
}

function formatTheoryGroupCode(index) {
    return `N${String(index).padStart(2, '0')}`
}

function formatElnGroupCode(index) {
    return `ELN${String(index).padStart(2, '0')}`
}

function formatCourseraGroupCode(index) {
    return `COUR${String(index).padStart(2, '0')}`
}

function formatCourseraPracticeGroupCode(baseGroupCode, practiceIndex) {
    const base = String(baseGroupCode || '').trim()
    return `${base}.TH${practiceIndex}`
}

function buildSectionId(courseName, scheduleSuffix, groupCode) {
    const name = String(courseName || '').trim()
    const suffix = String(scheduleSuffix || '').trim()
    const group = String(groupCode || '').trim()

    if (!name || !suffix || !group) {
        return null
    }

    return `${name}-${suffix}(${group})`
}

module.exports = {
    parseSemesterScheduleSuffix,
    formatTheoryGroupCode,
    formatElnGroupCode,
    formatCourseraGroupCode,
    formatCourseraPracticeGroupCode,
    buildSectionId,
}
