import { useCallback, useEffect, useMemo, useState } from 'react'
import { DeleteOutlined, ExportOutlined, ThunderboltOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Input,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import ExcelImportModal from '../../components/Common/ExcelImportModal'
import ImportToolbarActions from '../../components/Common/ImportToolbarActions'
import PageHeader from '../../components/Common/PageHeader'
import { useAuth } from '../../contexts/AuthContext'
import { isOfficeRole } from '../../config/permissions'
import { useAppContext } from '../../contexts/AppContext'
import { getImportTemplate } from '../../config/importTemplates'
import { getTableScroll } from '../../config/table'
import { buildCourseSectionExportColumns } from '../../config/exportColumns'
import { renderLearningModeTag } from '../../constants/learningModes'
import { sortCourseSectionsForExport } from '../../utils/exportFormatters'
import {
  buildExportFilename,
  exportToExcel,
  formatLecturerParen,
} from '../../utils/formatters'
import { resolveSectionScheduleDisplay } from '../../utils/periodCalculator'
import {
  autoGenerateSections,
  deleteCourseSection,
  getCourseSections,
} from '../../services/api'

function CourseSections() {
  const { user } = useAuth()
  const readOnly = isOfficeRole(user?.role)
  const { semesters, activeSemesterId } = useAppContext()
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [semesterFilter, setSemesterFilter] = useState(undefined)
  const [importOpen, setImportOpen] = useState(false)
  const [autoGenOpen, setAutoGenOpen] = useState(false)

  const effectiveSemesterFilter =
    semesterFilter !== undefined ? semesterFilter : activeSemesterId

  const importTemplate = getImportTemplate('courseSections')

  const fetchSections = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCourseSections()
      setSections(result.data || [])
    } catch {
      // Error handled by axios interceptor
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getCourseSections()
      .then((result) => {
        if (!cancelled) {
          setSections(result.data || [])
        }
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const semesterOptions = useMemo(
    () =>
      semesters.map((semester) => ({
        value: semester.semester_id,
        label: `${semester.semester_name || semester.semester_id} (${semester.semester_id})`,
      })),
    [semesters],
  )

  const filteredSections = useMemo(() => {
    return sections.filter((item) => {
      const matchSemester = effectiveSemesterFilter
        ? item.semester_id === effectiveSemesterFilter
        : true
      const keyword = searchText.trim().toLowerCase()
      const matchSearch = keyword
        ? [
            item.section_id,
            item.course_id,
            item.course?.course_name,
            item.lecturer_id,
            item.lecturer?.lecturer_name,
            ...(item.student_groups || []).flatMap((group) => [
              group.group_id,
              group.group_name,
            ]),
          ]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(keyword))
        : true
      return matchSemester && matchSearch
    })
  }, [sections, effectiveSemesterFilter, searchText])

  const handleOpenImport = () => {
    if (!effectiveSemesterFilter) {
      message.warning('Vui lòng chọn học kỳ trước khi nhập Excel')
      return
    }
    setImportOpen(true)
  }

  const handleOpenAutoGenerate = () => {
    if (!effectiveSemesterFilter) {
      message.warning('Vui lòng chọn học kỳ trước khi sinh lớp tự động')
      return
    }
    setAutoGenOpen(true)
  }

  const handleAutoGenerate = async () => {
    setAutoGenOpen(false)
    setGenerating(true)

    const loadingKey = 'auto-generate-sections'
    message.loading({
      content: 'Đang phân tích lộ trình và sinh lớp...',
      key: loadingKey,
      duration: 0,
    })

    try {
      const result = await autoGenerateSections({ semester_id: effectiveSemesterFilter })
      const createdCount = result.created_count ?? result.data?.length ?? 0

      message.success({
        content: result.message || `Đã sinh thành công ${createdCount} lớp học phần!`,
        key: loadingKey,
      })
      fetchSections()
    } catch {
      message.destroy(loadingKey)
    } finally {
      setGenerating(false)
    }
  }

  const semesterLookup = useMemo(
    () => new Map(semesters.map((semester) => [semester.semester_id, semester])),
    [semesters],
  )

  const exportColumns = useMemo(
    () => buildCourseSectionExportColumns({ semesterLookup }),
    [semesterLookup],
  )

  const handleExport = () => {
    if (filteredSections.length === 0) {
      message.warning('Không có dữ liệu để xuất')
      return
    }

    const filename = buildExportFilename('Lop-hoc-phan', { semesterId: effectiveSemesterFilter })
    exportToExcel(
      sortCourseSectionsForExport(filteredSections),
      exportColumns,
      filename,
      { sheetName: 'Lop hoc phan' },
    )
    message.success('Xuất file Excel thành công')
  }

  const handleDelete = async (sectionId) => {
    try {
      await deleteCourseSection(sectionId)
      message.success('Xóa lớp học phần thành công')
      fetchSections()
    } catch {
      // Error handled by axios interceptor
    }
  }

  const columns = [
    {
      title: 'Mã lớp',
      dataIndex: 'section_id',
      key: 'section_id',
      ellipsis: true,
      width: 320,
      render: (value) => <span className="section-id-cell">{value}</span>,
    },
    {
      title: 'Tên học phần',
      key: 'course_name',
      ellipsis: true,
      render: (_, record) => record.course?.course_name || record.course_id,
    },
    {
      title: 'Hình thức học',
      key: 'learning_mode',
      width: 200,
      render: (_, record) => renderLearningModeTag(record),
    },
    {
      title: 'Sĩ số dự kiến',
      dataIndex: 'capacity',
      align: 'center',
      key: 'capacity',
      width: 120,
    },
    {
      title: 'Khối lượng tuần',
      key: 'schedule_load',
      width: 220,
      render: (_, record) => {
        const schedule = resolveSectionScheduleDisplay(record)
        if (!schedule?.stPerWeek) {
          return '—'
        }

        return (
          <span className="section-group-tags">
            <Tag color="blue">
              {schedule.stPerWeek} tiết/tuần
              {schedule.rhythmLabel ? ' (đỉnh)' : ''}
            </Tag>
            {schedule.rhythmLabel ? (
              <Tag color="purple">{schedule.rhythmLabel}</Tag>
            ) : null}
            {schedule.actualWeeks ? (
              <Tag color="orange">
                {schedule.rhythmLabel
                  ? `Trải ${schedule.actualWeeks} tuần`
                  : `Hoàn thành trong ${schedule.actualWeeks} tuần`}
              </Tag>
            ) : null}
            {schedule.uniformActualWeeks && schedule.uniformActualWeeks < schedule.actualWeeks ? (
              <Tag color="default">Trước: ~{schedule.uniformActualWeeks} tuần (đều)</Tag>
            ) : null}
          </span>
        )
      },
    },
    {
      title: 'Lớp sinh viên',
      key: 'student_groups',
      width: 180,
      render: (_, record) => {
        const groups = record.student_groups || []
        if (groups.length === 0) {
          return <Tag className="section-group-tag section-group-tag--free">Tự do</Tag>
        }
        return (
          <span className="section-group-tags">
            {groups.map((group) => (
              <Tag key={group.group_id} color="cyan" className="section-group-tag">
                {group.group_name || group.group_id}
              </Tag>
            ))}
          </span>
        )
      },
    },
    {
      title: 'Giảng viên',
      key: 'lecturer',
      ellipsis: true,
      render: (_, record) =>
        formatLecturerParen(record.lecturer, record.lecturer_id) || '—',
    },
    ...(readOnly
      ? []
      : [
          {
            title: 'Hành động',
            key: 'actions',
            width: 80,
            fixed: 'right',
            render: (_, record) => (
              <Popconfirm
                title="Xóa lớp học phần"
                description="Bạn có chắc chắn muốn xóa lớp học phần này?"
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(record.section_id)}
              >
                <Tooltip title="Xóa">
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            ),
          },
        ]),
  ]

  return (
    <Spin spinning={loading || generating}>
      <PageHeader
        title="Lớp học phần"
        subtitle={
          readOnly
            ? 'Chỉ xem danh sách lớp học phần. Phân công giảng viên tại mục Phân công giảng viên.'
            : 'Sinh lớp tự động từ lộ trình CTĐT hoặc nhập file TKB chính thức — không thêm/sửa thủ công.'
        }
        filters={
          <>
            <Select
              allowClear
              placeholder="Chọn học kỳ"
              style={{ minWidth: 220 }}
              options={semesterOptions}
              value={effectiveSemesterFilter}
              onChange={setSemesterFilter}
            />
            <Input.Search
              allowClear
              placeholder="Tìm kiếm mã lớp, học phần, nhóm KS, giảng viên..."
              style={{ minWidth: 420 }}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </>
        }
        actions={
          readOnly ? (
            <Button size="middle" icon={<ExportOutlined />} onClick={handleExport}>
              Xuất Excel
            </Button>
          ) : (
            <>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handleOpenAutoGenerate}
              >
                Sinh lớp tự động
              </Button>
              <Button size="middle" icon={<ExportOutlined />} onClick={handleExport}>
                Xuất Excel
              </Button>
              <ImportToolbarActions onImportClick={handleOpenImport} />
            </>
          )
        }
      />

      <Table
        rowKey="section_id"
        columns={columns}
        dataSource={filteredSections}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} lớp học phần` }}
        scroll={getTableScroll(1280)}
        sticky
      />

      <ExcelImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={fetchSections}
        title="Nhập lớp học phần từ Excel"
        uploadUrl="/imports/course-sections"
        templateUrl={importTemplate?.url}
        templateFileName={importTemplate?.fileName}
        extraData={{ semester_id: effectiveSemesterFilter }}
      />

      <Modal
        title="Sinh lớp tự động"
        open={autoGenOpen}
        onCancel={() => setAutoGenOpen(false)}
        onOk={handleAutoGenerate}
        okText="Sinh lớp"
        cancelText="Hủy"
        confirmLoading={generating}
        destroyOnHidden
      >
        <p>
          Hệ thống sẽ dựa vào Lộ trình chuẩn của CTĐT để tính toán và tự động mở các lớp
          học phần cho học kỳ này. Bạn có chắc chắn muốn thực hiện?
        </p>
        <Alert
          type="warning"
          showIcon
          message="Lưu ý"
          description="Các lớp học phần cũ (cùng Nhóm KS) trong học kỳ đã chọn sẽ bị thay thế trước khi sinh lại."
        />
      </Modal>
    </Spin>
  )
}

export default CourseSections
