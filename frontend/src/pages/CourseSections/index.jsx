import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeleteOutlined, ExportOutlined, ThunderboltOutlined, PlusOutlined } from '@ant-design/icons'
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
import CreateSectionModal from '../../components/CourseSections/CreateSectionModal'
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
  getSchedulingSettings,
  getSemesterWaves,
} from '../../services/api'
import { formatCohortLabel } from '../../utils/formatters'
import { loadCohortFilter, saveCohortFilter } from '../../utils/cohortFilterStorage'
import { findWaveForCohorts } from '../../utils/semesterWaves'

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

function pickSectionCaps(config = {}) {
  return {
    default_lt_capacity: config.default_lt_capacity,
    default_th_capacity: config.default_th_capacity,
    default_eln_capacity: config.default_eln_capacity,
    default_cour_capacity: config.default_cour_capacity,
  }
}

function normalizeSectionCaps(config = {}, fallback = DEFAULT_SECTION_CAPS) {
  return Object.fromEntries(
    Object.entries(DEFAULT_SECTION_CAPS).map(([key, defaultValue]) => {
      const parsed = Number(config[key])
      return [key, Number.isFinite(parsed) && parsed > 0 ? parsed : fallback[key] ?? defaultValue]
    }),
  )
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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [cohortOptions, setCohortOptions] = useState([])
  const [selectedCohortIds, setSelectedCohortIds] = useState([])
  const [semesterWaves, setSemesterWaves] = useState([])
  const [loadingWaves, setLoadingWaves] = useState(false)
  const [selectedWaveId, setSelectedWaveId] = useState(undefined)
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

  const displaySections = useMemo(
    () => sortCourseSectionsForExport(filteredSections),
    [filteredSections],
  )

  const selectedWave = useMemo(
    () =>
      semesterWaves.find(
        (wave) =>
          wave.wave_id === selectedWaveId
          || String(wave.wave_order) === String(selectedWaveId),
      ) || null,
    [semesterWaves, selectedWaveId],
  )

  const waveDriven = semesterWaves.length > 0

  const effectiveCohortIds = useMemo(() => {
    if (selectedWave?.cohort_ids?.length) {
      return selectedWave.cohort_ids
    }
    return selectedCohortIds
  }, [selectedWave, selectedCohortIds])

  const waveOptions = useMemo(
    () =>
      semesterWaves.map((wave) => ({
        value: wave.wave_id,
        label: `${wave.wave_name || `Đợt ${wave.wave_order}`} — tuần ${wave.start_week} (${(wave.cohort_ids || []).join(', ')})`,
      })),
    [semesterWaves],
  )

  const cohortLabelLookup = useMemo(
    () => new Map(cohortOptions.map((option) => [option.value, option.label])),
    [cohortOptions],
  )

  const canSubmitAutoGenerate = waveDriven
    ? Boolean(selectedWaveId && effectiveCohortIds.length)
    : effectiveCohortIds.length > 0

  useEffect(() => {
    if (!autoGenOpen || !effectiveSemesterFilter) {
      return
    }

    setLoadingWaves(true)
    getSemesterWaves(effectiveSemesterFilter)
      .then((result) => {
        const waves = result.data || []
        setSemesterWaves(waves)

        const savedCohorts = cohortFilter.length ? cohortFilter : loadCohortFilter()
        const matched = findWaveForCohorts(waves, savedCohorts)
        if (matched?.wave_id) {
          setSelectedWaveId(matched.wave_id)
          setSelectedCohortIds(matched.cohort_ids || [])
        } else if (waves.length === 0) {
          setSelectedWaveId(undefined)
          setSelectedCohortIds(savedCohorts)
        } else {
          setSelectedWaveId(undefined)
          setSelectedCohortIds([])
        }
      })
      .catch(() => {
        setSemesterWaves([])
        setSelectedWaveId(undefined)
        setSelectedCohortIds(cohortFilter.length ? cohortFilter : loadCohortFilter())
      })
      .finally(() => setLoadingWaves(false))
  }, [autoGenOpen, effectiveSemesterFilter, cohortFilter])

  const handleWaveChange = (waveId) => {
    setSelectedWaveId(waveId)
    if (!waveId) {
      setSelectedCohortIds([])
      return
    }

    const wave = semesterWaves.find(
      (item) => item.wave_id === waveId || String(item.wave_order) === String(waveId),
    )
    setSelectedCohortIds(wave?.cohort_ids || [])
  }

  const handleOpenImport = () => {
    if (!effectiveSemesterFilter) {
      message.warning('Vui lòng chọn học kỳ trước khi nhập Excel')
      return
    }
    setImportOpen(true)
  }

  const handleOpenAutoGenerate = async () => {
    if (!effectiveSemesterFilter) {
      message.warning('Vui lòng chọn học kỳ trước khi sinh lớp tự động')
      return
    }
    const savedCaps = loadSectionCaps()
    setSectionCaps(savedCaps)
    setAutoGenOpen(true)

    try {
      const result = await getSchedulingSettings()
      const settingsCaps = normalizeSectionCaps(pickSectionCaps(result.data || result), savedCaps)
      setSectionCaps(settingsCaps)
    } catch {
      // Axios interceptor already shows the error; keep local caps as a fallback.
    }
  }

  const handleAutoGenerate = async () => {
    if (waveDriven && !selectedWaveId) {
      message.warning('Vui lòng chọn đợt sinh lớp')
      return
    }

    if (effectiveCohortIds.length === 0) {
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
        cohort_ids: effectiveCohortIds,
        wave_id: selectedWaveId || null,
        default_lt_capacity: sectionCaps.default_lt_capacity,
        default_th_capacity: sectionCaps.default_th_capacity,
        default_eln_capacity: sectionCaps.default_eln_capacity,
        default_cour_capacity: sectionCaps.default_cour_capacity,
      })
      const createdCount = result.created_count ?? result.data?.length ?? 0

      await fetchSections()

      setCohortFilter([...effectiveCohortIds])

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
                icon={<PlusOutlined />}
                onClick={() => {
                  if (!effectiveSemesterFilter) {
                    message.warning('Vui lòng chọn học kỳ trước')
                    return
                  }
                  setCreateModalOpen(true)
                }}
              >
                Thêm thủ công
              </Button>
              <Button
                type="dashed"
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
        dataSource={displaySections}
        pagination={{
          defaultPageSize: 50,
          pageSizeOptions: ['10', '25', '50', '100', '200'],
          showSizeChanger: true,
          showTotal: (total) => `${total} lớp học phần`,
        }}
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

      <CreateSectionModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false)
          fetchSections()
        }}
        semesterId={effectiveSemesterFilter}
      />

      <Modal
        title="Sinh lớp tự động"
        className="auto-gen-modal"
        width={820}
        open={autoGenOpen}
        onCancel={() => setAutoGenOpen(false)}
        onOk={handleAutoGenerate}
        okText="Sinh lớp"
        cancelText="Hủy"
        confirmLoading={generating}
        okButtonProps={{ disabled: !canSubmitAutoGenerate || loadingWaves }}
        destroyOnHidden
        centered
      >
        <div className="auto-gen-modal__header">
          <p className="auto-gen-modal__lead">
            Sinh lớp theo lộ trình CTĐT. Chọn đợt trước để đồng bộ với xếp lịch AI.
          </p>
          {effectiveSemesterFilter ? (
            <Tag color="blue" className="auto-gen-modal__semester-tag">
              {semesterLookup.get(effectiveSemesterFilter)?.semester_name || effectiveSemesterFilter}
            </Tag>
          ) : null}
        </div>

        <div className="auto-gen-modal__wave-panel">
          <div className="auto-gen-modal__field">
            <label className="auto-gen-modal__field-label" htmlFor="auto-gen-wave">
              Đợt sinh lớp{waveDriven ? ' *' : ''}
            </label>
            <Select
              id="auto-gen-wave"
              allowClear={!waveDriven}
              loading={loadingWaves}
              placeholder={
                loadingWaves
                  ? 'Đang tải đợt...'
                  : waveDriven
                    ? 'Chọn đợt (VD: Đ1 K16-K17, Đ2 K18...)'
                    : 'Chưa có đợt — chọn niên khóa thủ công bên dưới'
              }
              value={selectedWaveId}
              onChange={handleWaveChange}
              options={waveOptions}
              disabled={loadingWaves || !waveDriven}
              notFoundContent="Chưa có đợt nào"
              className="auto-gen-modal__wave-select"
            />
          </div>

          {!loadingWaves && waveDriven && selectedWave ? (
            <div className="auto-gen-modal__wave-meta">
              <div className="auto-gen-modal__wave-meta-row">
                <Tag color="purple" className="auto-gen-modal__wave-meta-tag">
                  Tuần HK {selectedWave.start_week}
                </Tag>
                <span className="auto-gen-modal__wave-meta-label">Niên khóa:</span>
                <div className="auto-gen-modal__cohort-tags">
                  {effectiveCohortIds.map((cohortId) => (
                    <Tag key={cohortId} color="cyan" className="auto-gen-modal__cohort-tag">
                      {cohortLabelLookup.get(cohortId) || cohortId}
                    </Tag>
                  ))}
                </div>
              </div>
              <p className="auto-gen-modal__wave-meta-note">
                Lớp cũ của các niên khóa trên sẽ bị thay thế khi sinh lại.
              </p>
            </div>
          ) : null}

          {!loadingWaves && effectiveSemesterFilter && !waveDriven ? (
            <Alert
              type="warning"
              showIcon
              className="auto-gen-modal__wave-summary"
              message="Học kỳ chưa có đợt"
              description={
                <>
                  Vào <Link to="/master-data/semesters">Danh mục → Học kỳ</Link>, bấm biểu tượng lịch
                  để cấu hình đợt (khuyến nghị). Tạm thời chọn niên khóa thủ công bên dưới.
                </>
              }
            />
          ) : null}
        </div>

        <div className="auto-gen-modal__stack">
          <section className="auto-gen-modal__section">
            <div className="auto-gen-modal__panel-title">Trần ghép lớp</div>
            <p className="auto-gen-modal__hint">
              Sĩ số tối đa mỗi lớp khi tách LT, TH/PM và ONLINE. TH/PM luôn dùng trần an toàn 40
              (phòng máy không đồng nhất).
            </p>

            <div className="auto-gen-modal__caps auto-gen-modal__caps--grid">
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
                  Tách PM/PC: min(giá trị này, 40).
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
                  Thường 200–280 SV / COUR01; tách track khi vượt.
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
                  E-learning thuần; Coursera dùng trần riêng.
                </span>
              </div>
            </div>
          </section>

          {!waveDriven ? (
            <section className="auto-gen-modal__section">
              <div className="auto-gen-modal__panel-head">
                <div>
                  <div className="auto-gen-modal__panel-title">Niên khóa áp dụng</div>
                  {effectiveCohortIds.length > 0 ? (
                    <span className="auto-gen-modal__selected-count">
                      Đã chọn {effectiveCohortIds.length}
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
                    className="auto-gen-cohort-grid auto-gen-cohort-grid--wide"
                  >
                    {cohortOptions.map((option) => (
                      <Checkbox key={option.value} value={option.value}>
                        {option.label}
                      </Checkbox>
                    ))}
                  </Checkbox.Group>
                )}
              </div>
            </section>
          ) : null}

          <Alert
            type="warning"
            showIcon
            className="auto-gen-modal__warn"
            message={
              waveDriven
                ? 'Chỉ thay thế lớp của niên khóa thuộc đợt đã chọn'
                : 'Lớp cũ của niên khóa đã chọn sẽ bị thay thế'
            }
            description={
              waveDriven
                ? 'Lớp trùng mã học phần từ niên khóa khác (ngoài đợt) không bị ảnh hưởng.'
                : 'Lớp trùng mã (cùng học phần) từ niên khóa khác cũng được ghi đè.'
            }
          />
        </div>
      </Modal>
    </Spin>
  )
}

export default CourseSections
