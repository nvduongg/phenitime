import { useCallback, useEffect, useMemo, useState } from 'react'
import { DeleteOutlined, ExportOutlined, ThunderboltOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
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
import { getTableScroll, TABLE_SCROLL_CLASS } from '../../config/table'
import { buildCourseSectionExportColumns } from '../../config/exportColumns'
import { renderLearningModeTag } from '../../constants/learningModes'
import { sortCourseSectionsForExport, resolveExpectedEnrollment, sectionMatchesCohortFilter } from '../../utils/exportFormatters'
import {
  buildExportFilename,
  exportToExcel,
  formatLecturerParen,
} from '../../utils/formatters'
import { resolveSectionScheduleDisplay } from '../../utils/periodCalculator'
import {
  autoGenerateSections,
  deleteCourseSection,
  getCohorts,
  getCourseSections,
} from '../../services/api'
import { formatCohortLabel } from '../../utils/formatters'
import { loadCohortFilter, saveCohortFilter } from '../../utils/cohortFilterStorage'

const SECTION_CAPS_STORAGE_KEY = 'phenitime:sectionGenerationCaps'

const DEFAULT_SECTION_CAPS = {
  default_lt_capacity: 80,
  default_th_capacity: 40,
  default_eln_capacity: 800,
  default_cour_capacity: 240,
}

function loadSectionCaps() {
  try {
    const raw = localStorage.getItem(SECTION_CAPS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SECTION_CAPS }
    return { ...DEFAULT_SECTION_CAPS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SECTION_CAPS }
  }
}

function saveSectionCaps(caps) {
  try {
    localStorage.setItem(SECTION_CAPS_STORAGE_KEY, JSON.stringify(caps))
  } catch {
    // ignore quota / private mode
  }
}

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
  const [cohortOptions, setCohortOptions] = useState([])
  const [selectedCohortIds, setSelectedCohortIds] = useState([])
  const [cohortFilter, setCohortFilterState] = useState(() => loadCohortFilter())
  const [sectionCaps, setSectionCaps] = useState(DEFAULT_SECTION_CAPS)

  const setCohortFilter = useCallback((value) => {
    setCohortFilterState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveCohortFilter(next)
      return next
    })
  }, [])

  const effectiveSemesterFilter =
    semesterFilter !== undefined ? semesterFilter : activeSemesterId

  const importTemplate = getImportTemplate('courseSections')

  const fetchSections = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCourseSections()
      const data = result.data || []
      setSections(data)
      return data
    } catch {
      // Error handled by axios interceptor
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getCohorts()
      .then((result) => {
        setCohortOptions(
          (result.data || [])
            .map((cohort) => ({
              value: cohort.cohort_id,
              label: formatCohortLabel(cohort),
            }))
            .sort((a, b) => b.value.localeCompare(a.value, 'vi')),
        )
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
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
      const matchCohort = sectionMatchesCohortFilter(item, cohortFilter)
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
      return matchSemester && matchCohort && matchSearch
    })
  }, [sections, effectiveSemesterFilter, cohortFilter, searchText])

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
    setSectionCaps(loadSectionCaps())
    setAutoGenOpen(true)
  }

  const handleAutoGenerate = async () => {
    if (selectedCohortIds.length === 0) {
      message.warning('Vui lòng chọn ít nhất một niên khóa')
      return
    }

    setAutoGenOpen(false)
    setGenerating(true)

    const loadingKey = 'auto-generate-sections'
    message.loading({
      content: 'Đang phân tích lộ trình và sinh lớp...',
      key: loadingKey,
      duration: 0,
    })

    try {
      saveSectionCaps(sectionCaps)
      const result = await autoGenerateSections({
        semester_id: effectiveSemesterFilter,
        cohort_ids: selectedCohortIds,
        default_lt_capacity: sectionCaps.default_lt_capacity,
        default_th_capacity: sectionCaps.default_th_capacity,
        default_eln_capacity: sectionCaps.default_eln_capacity,
        default_cour_capacity: sectionCaps.default_cour_capacity,
      })
      const createdCount = result.created_count ?? result.data?.length ?? 0

      await fetchSections()

      setCohortFilter([...selectedCohortIds])

      message.success({
        content: result.message || `Đã sinh thành công ${createdCount} lớp học phần!`,
        key: loadingKey,
      })
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
    if (loading || generating) {
      message.warning('Đang tải dữ liệu mới, vui lòng đợi vài giây rồi xuất lại')
      return
    }

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
    message.success(
      cohortFilter.length
        ? `Đã xuất ${filteredSections.length} lớp (${cohortFilter.join(', ')}) — ${filename}`
        : `Đã xuất ${filteredSections.length} lớp — ${filename}`,
    )
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
      minWidth: 280,
      render: (value) => <span className="section-id-cell">{value}</span>,
    },
    {
      title: 'Tên học phần',
      key: 'course_name',
      minWidth: 220,
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
      key: 'expected_enrollment',
      align: 'center',
      width: 120,
      render: (_, record) => resolveExpectedEnrollment(record) || '—',
    },
    {
      title: 'Khối lượng tuần',
      key: 'schedule_load',
      minWidth: 240,
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
      minWidth: 200,
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
      minWidth: 180,
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
            <Select
              allowClear
              mode="multiple"
              placeholder="Lọc niên khóa (xuất Excel)"
              style={{ minWidth: 240 }}
              options={cohortOptions}
              value={cohortFilter}
              onChange={setCohortFilter}
              maxTagCount="responsive"
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
            <Button
              size="middle"
              icon={<ExportOutlined />}
              onClick={handleExport}
              disabled={loading || generating}
            >
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
              <Button
                size="middle"
                icon={<ExportOutlined />}
                onClick={handleExport}
                disabled={loading || generating}
              >
                Xuất Excel
              </Button>
              <ImportToolbarActions onImportClick={handleOpenImport} />
            </>
          )
        }
      />

      <Table
        className={TABLE_SCROLL_CLASS}
        rowKey="section_id"
        columns={columns}
        dataSource={filteredSections}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} lớp học phần` }}
        scroll={getTableScroll(1680)}
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
        className="auto-gen-modal"
        width={780}
        open={autoGenOpen}
        onCancel={() => setAutoGenOpen(false)}
        onOk={handleAutoGenerate}
        okText="Sinh lớp"
        cancelText="Hủy"
        confirmLoading={generating}
        okButtonProps={{ disabled: selectedCohortIds.length === 0 }}
        destroyOnHidden
        centered
      >
        <p className="auto-gen-modal__lead">
          Sinh lớp theo lộ trình CTĐT cho học kỳ đang chọn trên toolbar.
        </p>

        <div className="auto-gen-modal__body">
          <div className="auto-gen-modal__panel auto-gen-modal__panel--config">
            <div className="auto-gen-modal__panel-title">Trần ghép lớp</div>
            <p className="auto-gen-modal__hint">
              Sĩ số tối đa mỗi lớp khi tách LT, TH/PM và ONLINE. Phòng máy thực tế 40–45 chỗ;
              hệ thống lập kế hoạch theo trần an toàn 40 cho TH/PM (dù bạn nhập 45).
            </p>

            <div className="auto-gen-modal__caps">
              <div className="auto-gen-modal__field">
                <label className="auto-gen-modal__field-label" htmlFor="auto-gen-lt-cap">
                  Sĩ số chuẩn LT
                </label>
                <InputNumber
                  id="auto-gen-lt-cap"
                  min={1}
                  max={500}
                  className="auto-gen-modal__field-input"
                  value={sectionCaps.default_lt_capacity}
                  onChange={(value) =>
                    setSectionCaps((prev) => ({
                      ...prev,
                      default_lt_capacity: value ?? DEFAULT_SECTION_CAPS.default_lt_capacity,
                    }))}
                />
              </div>
              <div className="auto-gen-modal__field">
                <label className="auto-gen-modal__field-label" htmlFor="auto-gen-th-cap">
                  Sĩ số chuẩn TH/PM
                </label>
                <InputNumber
                  id="auto-gen-th-cap"
                  min={1}
                  max={500}
                  className="auto-gen-modal__field-input"
                  value={sectionCaps.default_th_capacity}
                  onChange={(value) =>
                    setSectionCaps((prev) => ({
                      ...prev,
                      default_th_capacity: value ?? DEFAULT_SECTION_CAPS.default_th_capacity,
                    }))}
                />
                <span className="auto-gen-modal__field-hint">
                  Trần tham chiếu; tách lớp PM/PC dùng min(giá trị này, 40) vì phòng máy không đồng nhất.
                </span>
              </div>
              <div className="auto-gen-modal__field">
                <label className="auto-gen-modal__field-label" htmlFor="auto-gen-cour-cap">
                  Sĩ số tối đa / track Coursera
                </label>
                <InputNumber
                  id="auto-gen-cour-cap"
                  min={1}
                  max={9999}
                  className="auto-gen-modal__field-input"
                  value={sectionCaps.default_cour_capacity}
                  onChange={(value) =>
                    setSectionCaps((prev) => ({
                      ...prev,
                      default_cour_capacity: value ?? DEFAULT_SECTION_CAPS.default_cour_capacity,
                    }))}
                />
                <span className="auto-gen-modal__field-hint">
                  TKB thực thường 200–280 SV / COUR01; tách COUR02… khi vượt.
                </span>
              </div>
              <div className="auto-gen-modal__field">
                <label className="auto-gen-modal__field-label" htmlFor="auto-gen-eln-cap">
                  Sĩ số tối đa / lớp ONLINE (ELN)
                </label>
                <InputNumber
                  id="auto-gen-eln-cap"
                  min={1}
                  max={9999}
                  className="auto-gen-modal__field-input"
                  value={sectionCaps.default_eln_capacity}
                  onChange={(value) =>
                    setSectionCaps((prev) => ({
                      ...prev,
                      default_eln_capacity: value ?? DEFAULT_SECTION_CAPS.default_eln_capacity,
                    }))}
                />
                <span className="auto-gen-modal__field-hint">
                  Chỉ áp dụng học phần e-learning thuần; Coursera dùng trần riêng ở trên.
                </span>
              </div>
            </div>

            <Alert
              type="warning"
              showIcon
              className="auto-gen-modal__warn"
              message="Lớp cũ của niên khóa đã chọn sẽ bị thay thế. Lớp trùng mã (cùng học phần) từ niên khóa khác cũng được ghi đè."
            />
          </div>

          <div className="auto-gen-modal__panel auto-gen-modal__panel--cohorts">
            <div className="auto-gen-modal__panel-head">
              <div>
                <div className="auto-gen-modal__panel-title">Niên khóa áp dụng</div>
                {selectedCohortIds.length > 0 ? (
                  <span className="auto-gen-modal__selected-count">
                    Đã chọn {selectedCohortIds.length}
                  </span>
                ) : (
                  <span className="auto-gen-modal__selected-count auto-gen-modal__selected-count--empty">
                    Chưa chọn niên khóa
                  </span>
                )}
              </div>
              <span className="auto-gen-modal__panel-actions">
                <Button
                  type="link"
                  size="small"
                  onClick={() => setSelectedCohortIds(cohortOptions.map((item) => item.value))}
                  disabled={cohortOptions.length === 0}
                >
                  Tất cả
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setSelectedCohortIds([])}
                  disabled={selectedCohortIds.length === 0}
                >
                  Bỏ chọn
                </Button>
              </span>
            </div>

            <div className="auto-gen-cohort-list auto-gen-cohort-list--grid">
              {cohortOptions.length === 0 ? (
                <span className="auto-gen-modal__empty">Chưa có niên khóa</span>
              ) : (
                <Checkbox.Group
                  value={selectedCohortIds}
                  onChange={setSelectedCohortIds}
                  className="auto-gen-cohort-grid"
                >
                  {cohortOptions.map((option) => (
                    <Checkbox key={option.value} value={option.value}>
                      {option.label}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </Spin>
  )
}

export default CourseSections
