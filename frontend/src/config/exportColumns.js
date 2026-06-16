import {
  formatExportDateLong,
  formatExportDateShort,
  formatLecturerDash,
  formatLecturerParen,
  formatStudentGroupNamesForExport,
  formatCohortIdsForExport,
  resolveSectionDateRange,
  resolveSectionContext,
  resolveWeeklyPeriodsForTimetableRow,
  resolveSectionClassType,
  formatSectionIdForExport,
  resolveExpectedEnrollment,
} from '../utils/exportFormatters'
import { formatTimetableRoom } from '../constants/roomTypes'

export const buildCourseSectionExportColumns = ({ semesterLookup } = {}) => [
  {
    title: 'Stt',
    exportValue: (_row, rowIndex) => rowIndex + 1,
  },
  {
    title: 'Mã học phần',
    exportValue: (row) => row.course_id || '',
  },
  {
    title: 'Tên học phần',
    exportValue: (row) => row.course?.course_name || '',
  },
  {
    title: 'Lớp học phần',
    exportValue: (row) => formatSectionIdForExport(row) || '',
  },
  {
    title: 'Hình thức học',
    exportValue: (row) => resolveSectionClassType(row) || '',
  },
  {
    title: 'Số lượng',
    exportValue: (row) => resolveExpectedEnrollment(row),
  },
  {
    title: 'Nhóm KS',
    exportValue: (row) => formatStudentGroupNamesForExport(row),
  },
  {
    title: 'Niên khóa',
    exportValue: (row) => formatCohortIdsForExport(row.student_groups),
  },
  {
    title: 'Giảng viên',
    exportValue: (row) => formatLecturerDash(row.lecturer, row.lecturer_id),
  },
  {
    title: 'Buổi bắt đầu',
    exportValue: (row) =>
      formatExportDateLong(resolveSectionDateRange(row, semesterLookup).startDate),
  },
  {
    title: 'Buổi kết thúc',
    exportValue: (row) =>
      formatExportDateLong(resolveSectionDateRange(row, semesterLookup).endDate),
  },
  {
    title: 'Khoa quản lý chuyên môn',
    exportValue: (row) => row.course?.unit?.unit_name || '',
  },
]

export const buildTimetableExportColumns = ({ sectionLookup } = {}) => [
  {
    title: 'TT',
    exportValue: (_row, rowIndex) => rowIndex + 1,
  },
  {
    title: 'Mã HP',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return section.course_id || row.section?.course_id || ''
    },
  },
  {
    title: 'Số TC',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return section.course?.credits ?? ''
    },
  },
  {
    title: 'Số TC LT',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return section.course?.theory_credits ?? ''
    },
  },
  {
    title: 'Số TC TH',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return section.course?.practice_credits ?? ''
    },
  },
  {
    title: 'Lớp học phần',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return formatSectionIdForExport(section) || formatSectionIdForExport(row.section_id) || ''
    },
  },
  {
    title: 'Số SV dự kiến ',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return resolveExpectedEnrollment(section)
    },
  },
  {
    title: 'Hình thức học',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return resolveSectionClassType(section) || ''
    },
  },
  {
    title: 'ST /tuần',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return resolveWeeklyPeriodsForTimetableRow(row, section)
    },
  },
  {
    title: 'Thứ',
    exportValue: (row) => row.day_of_week ?? '',
  },
  {
    title: 'Tiết BĐ',
    exportValue: (row) => row.start_period ?? '',
  },
  {
    title: 'Số tiết',
    exportValue: (row) => row.period_count ?? '',
  },
  {
    title: 'Phòng học',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return formatTimetableRoom(row.room_id, section)
    },
  },
  {
    title: 'Ngày BĐ',
    exportValue: (row) => formatExportDateShort(row.start_date),
  },
  {
    title: 'Ngày KT',
    exportValue: (row) => formatExportDateShort(row.end_date),
  },
  {
    title: 'Giảng viên',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return formatLecturerParen(section.lecturer, section.lecturer_id)
    },
  },
  {
    title: 'Khoa chuyên môn',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return section.course?.unit?.unit_name || ''
    },
  },
  {
    title: 'Niên khóa',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return formatCohortIdsForExport(section.student_groups)
    },
  },
  {
    title: 'Nhóm KS',
    exportValue: (row) => {
      const section = resolveSectionContext(row, sectionLookup)
      return formatStudentGroupNamesForExport(section)
    },
  },
]
