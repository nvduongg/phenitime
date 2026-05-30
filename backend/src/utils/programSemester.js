const TERMS_PER_YEAR = 3
const DEFAULT_PROGRAM_SEMESTER_COUNT = 12

function getProgramSemesterParts(semesterNumber) {
    const semester = Number(semesterNumber)
    if (!Number.isFinite(semester) || semester < 1) return null

    const year = Math.floor((semester - 1) / TERMS_PER_YEAR) + 1
    const term = ((semester - 1) % TERMS_PER_YEAR) + 1

    return { semester, term, year }
}

function getProgramSemesterCalendarYear(semesterNumber, cohortStartYear) {
    const parts = getProgramSemesterParts(semesterNumber)
    const startYear = Number(cohortStartYear)
    if (!parts || !Number.isFinite(startYear)) return null

    // Nhập học tháng 10: Kỳ 1 năm 1 = start_year, Kỳ 2+ trong cùng năm CTĐT sang năm dương lịch kế tiếp
    return startYear + (parts.year - 1) + (parts.term > 1 ? 1 : 0)
}

function inferProgramSemester(cohortStartYear, semesterStartDate) {
    const startYear = Number(cohortStartYear)
    if (!Number.isFinite(startYear) || !semesterStartDate) return null

    const date = new Date(semesterStartDate)
    if (Number.isNaN(date.getTime())) return null

    const calendarYear = date.getFullYear()
    const month = date.getMonth() + 1

    const candidates = []
    for (let semester = 1; semester <= DEFAULT_PROGRAM_SEMESTER_COUNT; semester += 1) {
        if (getProgramSemesterCalendarYear(semester, startYear) === calendarYear) {
            candidates.push(semester)
        }
    }

    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]

    for (const semester of candidates) {
        const term = ((semester - 1) % TERMS_PER_YEAR) + 1
        if (term === 1 && month >= 9) return semester
        if (term === 2 && month >= 1 && month <= 5) return semester
        if (term === 3 && month >= 6 && month <= 8) return semester
    }

    return candidates[0]
}

module.exports = {
    TERMS_PER_YEAR,
    DEFAULT_PROGRAM_SEMESTER_COUNT,
    getProgramSemesterParts,
    getProgramSemesterCalendarYear,
    inferProgramSemester,
}
