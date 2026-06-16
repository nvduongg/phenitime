import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Form,
  InputNumber,
  Select,
  Spin,
  Table,
  Tag,
  message,
} from 'antd'
import PageHeader from '../../components/Common/PageHeader'
import { saveSchedulerResult } from '../../utils/timetableGrid'
import { useAppContext } from '../../contexts/AppContext'
import {
  getCourseSections,
  getCohorts,
  getRooms,
  getSchedulerJobStatus,
  getSchedulingSettings,
  triggerAiScheduler,
  updateSchedulingSettings,
} from '../../services/api'
import { getTableScroll, TABLE_SCROLL_CLASS } from '../../config/table'
import { sectionMatchesCohortFilter } from '../../utils/exportFormatters'
import { loadCohortFilter, saveCohortFilter } from '../../utils/cohortFilterStorage'
import { formatCohortLabel } from '../../utils/formatters'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_DURATION_MS = 65 * 60 * 1000
const MAX_POLL_NETWORK_ERRORS = 8

const PERIOD_OPTIONS = Array.from({ length: 15 }, (_, index) => ({
  value: index + 1,
  label: `Tiết ${index + 1}`,
}))

const DAY_OPTIONS = [
  { value: 2, label: 'Thứ 2' },
  { value: 3, label: 'Thứ 3' },
  { value: 4, label: 'Thứ 4' },
  { value: 5, label: 'Thứ 5' },
  { value: 6, label: 'Thứ 6' },
  { value: 7, label: 'Thứ 7' },
]

const DEFAULT_SCHEDULING = {
  shift_duration: 3,
  allowed_start_periods: [1, 4, 7, 10, 13],
  allowed_days: [2, 3, 4, 5, 6, 7],
  evening_start_periods: [13],
}

function ReadinessChecklist({ checks, successResult }) {
  return (
    <div className="ai-readiness-grid">
      {checks.map((check) => {
        const isOk = successResult || check.ok
        return (
          <div
            key={check.key}
            className={`ai-readiness-item ${isOk ? 'is-ok' : 'is-pending'}`}
          >
            <span className="ai-readiness-icon">
              {isOk ? <CheckCircleFilled /> : <CloseCircleFilled />}
            </span>
            <div className="ai-readiness-copy">
              <div className="ai-readiness-label">{check.label}</div>
              <div className="ai-readiness-detail">{check.detail}</div>
            </div>
            {!isOk && check.link ? (
              <Link to={check.link} className="ai-readiness-link">
                Xử lý →
              </Link>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function AiScheduler() {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const location = useLocation()
  const { semesters, activeSemesterId } = useAppContext()
  const [running, setRunning] = useState(false)
  const [jobState, setJobState] = useState(null)
  const [successResult, setSuccessResult] = useState(null)
  const [loadingReadiness, setLoadingReadiness] = useState(true)
  const [sections, setSections] = useState([])
  const [roomCount, setRoomCount] = useState(0)
  const [cohortOptions, setCohortOptions] = useState([])
  const [cohortFilter, setCohortFilterState] = useState(() => loadCohortFilter())
  const [savingSettings, setSavingSettings] = useState(false)
  const [pollElapsedSec, setPollElapsedSec] = useState(0)
  const pollTimerRef = useRef(null)
  const pollStartedAtRef = useRef(null)
  const pollErrorCountRef = useRef(0)

  const selectedSemesterId = Form.useWatch('semester_id', form)

  const setCohortFilter = useCallback((value) => {
    setCohortFilterState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveCohortFilter(next)
      return next
    })
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
      .catch(() => {})
  }, [])

  useEffect(() => {
    setCohortFilterState(loadCohortFilter())
  }, [location.pathname])

  useEffect(() => {
    if (activeSemesterId) {
      form.setFieldsValue({ semester_id: activeSemesterId })
    }
  }, [activeSemesterId, form])

  useEffect(() => {
    getSchedulingSettings()
      .then((result) => {
        const config = { ...DEFAULT_SCHEDULING, ...(result.data || {}) }
        form.setFieldsValue(config)
      })
      .catch(() => {
        form.setFieldsValue(DEFAULT_SCHEDULING)
      })
  }, [form])

  const fetchReadinessData = useCallback(async () => {
    setLoadingReadiness(true)
    try {
      const [sectionsRes, roomsRes] = await Promise.all([getCourseSections(), getRooms()])
      setSections(sectionsRes.data || [])
      setRoomCount(roomsRes.data?.length || 0)
    } catch {
      // Error handled by axios interceptor
    } finally {
      setLoadingReadiness(false)
    }
  }, [])

  useEffect(() => {
    fetchReadinessData()
  }, [fetchReadinessData, location.pathname])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
      }
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollJobStatus = useCallback(
    (jobId) => {
      stopPolling()
      pollStartedAtRef.current = Date.now()
      pollErrorCountRef.current = 0
      setPollElapsedSec(0)

      const checkStatus = async () => {
        const elapsedMs = Date.now() - (pollStartedAtRef.current || Date.now())
        setPollElapsedSec(Math.floor(elapsedMs / 1000))

        if (elapsedMs > MAX_POLL_DURATION_MS) {
          stopPolling()
          setRunning(false)
          setJobState(null)
          message.error(
            'Xếp lịch quá lâu (>65 phút). Kiểm tra log backend/solver — có thể chạy lại.',
          )
          return
        }

        try {
          const statusResponse = await getSchedulerJobStatus(jobId)
          pollErrorCountRef.current = 0
          const state = statusResponse.state
          setJobState(state)

          if (state === 'completed') {
            stopPolling()
            setRunning(false)
            setJobState(null)
            setPollElapsedSec(0)
            const result = statusResponse.result || { message: 'Xếp lịch thành công' }
            setSuccessResult(result)
            saveSchedulerResult({
              semester_id: result.semester_id || selectedSemesterId,
              cohort_ids: result.cohort_ids || cohortFilter,
              unscheduled_classes: result.unscheduled_classes || [],
              timetable_snapshot: result.timetable_snapshot || [],
              total_scheduled: result.total_scheduled,
              total_unscheduled: result.total_unscheduled,
              phase1_scheduled: result.phase1_scheduled,
              phase2_scheduled: result.phase2_scheduled,
              phase3_scheduled: result.phase3_scheduled,
              phase3_relocated: result.phase3_relocated,
              saved_at: new Date().toISOString(),
            })
            const unscheduledCount = result.total_unscheduled || 0
            if (unscheduledCount > 0) {
              message.warning(
                statusResponse.result?.message ||
                  `Đã xếp xong nhưng còn ${unscheduledCount} buổi cần xếp tay.`,
              )
            } else {
              message.success(statusResponse.result?.message || 'Chạy thuật toán AI thành công')
            }
            await fetchReadinessData()
          }

          if (state === 'failed') {
            stopPolling()
            setRunning(false)
            setJobState(null)
            setPollElapsedSec(0)
            message.error(statusResponse.error || 'Thuật toán AI thất bại')
          }
        } catch (error) {
          pollErrorCountRef.current += 1
          if (pollErrorCountRef.current >= MAX_POLL_NETWORK_ERRORS) {
            stopPolling()
            setRunning(false)
            setJobState(null)
            setPollElapsedSec(0)
            message.error(
              error?.message?.includes('timeout')
                ? 'Mất kết nối khi kiểm tra tiến độ. Đảm bảo backend (port 5000) vẫn chạy — job có thể vẫn đang xử lý.'
                : 'Không thể kiểm tra tiến độ xếp lịch. Kiểm tra backend và Redis.',
            )
          }
        }
      }

      checkStatus()
      pollTimerRef.current = setInterval(checkStatus, POLL_INTERVAL_MS)
    },
    [fetchReadinessData, selectedSemesterId, stopPolling, cohortFilter],
  )

  const jobStateLabel = useMemo(() => {
    const elapsed =
      pollElapsedSec >= 60
        ? `${Math.floor(pollElapsedSec / 60)} phút ${pollElapsedSec % 60}s`
        : `${pollElapsedSec}s`
    if (jobState === 'active') {
      return `Đang chạy thuật toán (${elapsed})`
    }
    if (jobState === 'waiting' || jobState === 'delayed' || jobState === 'paused') {
      return `Đang chờ trong hàng đợi (${elapsed})`
    }
    return `Đang xử lý (${elapsed})`
  }, [jobState, pollElapsedSec])

  const semesterOptions = useMemo(
    () =>
      semesters.map((semester) => ({
        value: semester.semester_id,
        label: `${semester.semester_name || semester.semester_id} (${semester.semester_id})`,
      })),
    [semesters],
  )

  const semesterSections = useMemo(() => {
    if (!selectedSemesterId) return []
    return sections.filter(
      (section) =>
        section.semester_id === selectedSemesterId
        && sectionMatchesCohortFilter(section, cohortFilter),
    )
  }, [sections, selectedSemesterId, cohortFilter])

  const hasCohortFilter = cohortFilter.length > 0

  const readiness = useMemo(() => {
    const totalSections = semesterSections.length
    const assignedSections = semesterSections.filter((section) => section.lecturer_id).length
    const unassignedSections = totalSections - assignedSections

    const hasSections = totalSections > 0
    const hasLecturers = hasSections && unassignedSections === 0
    const hasRooms = roomCount > 0
    const isReady = hasSections && hasLecturers && hasRooms

    const checks = [
      {
        key: 'sections',
        label: 'Lớp học phần',
        ok: hasSections,
        detail: hasSections
          ? hasCohortFilter
            ? `${totalSections} lớp (${cohortFilter.join(', ')})`
            : `${totalSections} lớp trong học kỳ`
          : hasCohortFilter
            ? `Không có lớp thuộc ${cohortFilter.join(', ')}`
            : 'Chưa có lớp học phần',
        link: '/course-sections',
      },
      {
        key: 'lecturers',
        label: 'Phân công giảng viên',
        ok: hasLecturers,
        detail: !hasSections
          ? 'Cần sinh lớp học phần trước'
          : unassignedSections === 0
            ? `Đã phân công đủ ${assignedSections} lớp`
            : `Còn ${unassignedSections}/${totalSections} lớp chưa có giảng viên`,
        link: '/academic/lecturer-assignment',
      },
      {
        key: 'rooms',
        label: 'Phòng học',
        ok: hasRooms,
        detail: hasRooms ? `${roomCount} phòng khả dụng` : 'Chưa có phòng học',
        link: '/master-data/rooms',
      },
    ]

    return { totalSections, assignedSections, unassignedSections, checks, isReady }
  }, [semesterSections, roomCount, cohortFilter, hasCohortFilter])

  const readinessStatus = useMemo(() => {
    if (successResult) {
      return { color: 'success', label: 'Đã xếp lịch' }
    }
    if (!selectedSemesterId) {
      return { color: 'default', label: 'Chưa chọn học kỳ' }
    }
    if (readiness.isReady) {
      return { color: 'success', label: 'Sẵn sàng chạy' }
    }
    return { color: 'warning', label: 'Chưa đủ điều kiện' }
  }, [successResult, selectedSemesterId, readiness.isReady])

  const unscheduledClasses = successResult?.unscheduled_classes || []
  const hasUnscheduled = unscheduledClasses.length > 0
  const scheduledCount =
    successResult?.total_scheduled || successResult?.total_events || successResult?.created_count || 0
  const deletedCount = successResult?.deleted_count
  const createdCount = successResult?.created_count ?? scheduledCount

  const handleSaveSettings = async () => {
    try {
      const values = await form.validateFields([
        'shift_duration',
        'allowed_start_periods',
        'allowed_days',
        'evening_start_periods',
      ])
      setSavingSettings(true)
      await updateSchedulingSettings(values)
      message.success('Đã lưu cấu hình hệ thống')
    } catch (error) {
      if (error?.errorFields) return
    } finally {
      setSavingSettings(false)
    }
  }

  const handleRunSolver = async () => {
    try {
      const values = await form.validateFields()

      if (!readiness.isReady) {
        message.warning('Học kỳ chưa đủ điều kiện. Vui lòng hoàn thành các bước chuẩn bị trước.')
        return
      }

      setRunning(true)
      setSuccessResult(null)
      setJobState('waiting')

      const queued = await triggerAiScheduler({
        semester_id: values.semester_id,
        cohort_ids: cohortFilter,
        config: {
          shift_duration: values.shift_duration,
          allowed_start_periods: values.allowed_start_periods,
          regular_starts: values.allowed_start_periods,
          evening_starts: values.evening_start_periods,
          allowed_days: values.allowed_days,
        },
      })

      if (!queued?.jobId) {
        message.error('Không thể khởi tạo job xếp lịch')
        setRunning(false)
        setJobState(null)
        return
      }

      pollJobStatus(queued.jobId)
    } catch (error) {
      if (error?.errorFields) return
      setRunning(false)
      setJobState(null)
    }
  }

  return (
    <>
      {running ? (
        <div className="ai-loading-overlay">
          <div className="ai-loading-card">
            <Spin size="large" />
            <p className="ai-loading-text">{jobStateLabel}</p>
            <p className="ai-loading-subtext">Vui lòng không đóng trang trong lúc chờ.</p>
          </div>
        </div>
      ) : null}

      <div className="ai-scheduler-page">
        <PageHeader
          title="Xếp lịch AI"
          subtitle={
            successResult
              ? successResult.message ||
                `Đã lưu ${createdCount} buổi học vào thời khóa biểu.`
              : 'Chuẩn bị dữ liệu học kỳ, chạy thuật toán và xem thời khóa biểu.'
          }
          filters={
            <Select
              allowClear
              mode="multiple"
              placeholder="Lọc niên khóa"
              style={{ minWidth: 240 }}
              options={cohortOptions}
              value={cohortFilter}
              onChange={setCohortFilter}
              maxTagCount="responsive"
            />
          }
          actions={
            successResult ? (
              <>
                <Button
                  type="primary"
                  size="middle"
                  icon={<CalendarOutlined />}
                  onClick={() => {
                    saveSchedulerResult({
                      semester_id: successResult.semester_id || selectedSemesterId,
                      cohort_ids: successResult.cohort_ids || cohortFilter,
                      unscheduled_classes: unscheduledClasses,
                    })
                    navigate('/timetables')
                  }}
                >
                  Xem thời khóa biểu
                </Button>
                <Button
                  size="middle"
                  icon={<ReloadOutlined />}
                  onClick={() => setSuccessResult(null)}
                >
                  Chạy lại
                </Button>
              </>
            ) : null
          }
        />

        {successResult ? (
          <Card className="ai-result-card" bordered={false}>
            <div className="ai-result-banner">
              <span
                className={`ai-result-icon ${hasUnscheduled ? 'is-warning' : 'is-success'}`}
              >
                {hasUnscheduled ? <CloseCircleFilled /> : <CheckCircleFilled />}
              </span>
              <div className="ai-result-copy">
                <h2 className="ai-result-title">
                  {hasUnscheduled ? 'Hoàn tất một phần' : 'Xếp lịch thành công'}
                </h2>
                <p className="ai-result-message">
                  {successResult.message ||
                    `Đã lưu ${createdCount} buổi học vào cơ sở dữ liệu.`}
                </p>
              </div>
              <div className="ai-result-stats ai-result-stats--inline">
                <div className="ai-result-stat">
                  <span className="ai-result-stat-value">{createdCount}</span>
                  <span className="ai-result-stat-label">Đã xếp</span>
                </div>
                <div className="ai-result-stat">
                  <span className="ai-result-stat-value">{unscheduledClasses.length}</span>
                  <span className="ai-result-stat-label">Chưa xếp</span>
                </div>
                {deletedCount !== undefined ? (
                  <div className="ai-result-stat">
                    <span className="ai-result-stat-value">{deletedCount}</span>
                    <span className="ai-result-stat-label">Lịch cũ xóa</span>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        <Spin spinning={loadingReadiness}>
          <section className="ai-readiness-section">
            <div className="ai-readiness-section__head">
              <div className="ai-readiness-section__title">
                <RobotOutlined className="ai-readiness-section__icon" />
                <h2>Tiến độ chuẩn bị</h2>
              </div>
              <Tag color={readinessStatus.color}>{readinessStatus.label}</Tag>
            </div>
            <ReadinessChecklist checks={readiness.checks} successResult={successResult} />
          </section>
        </Spin>

        {successResult && hasUnscheduled ? (
          <>
            <Alert
              type="warning"
              showIcon
              className="ai-unscheduled-alert"
              message={`${unscheduledClasses.length} buổi cần xếp tay`}
              description="Kiểm tra phòng, giảng viên, nhóm sinh viên hoặc xếp thủ công trên lưới TKB."
            />
            <Card
              title={`Buổi chưa xếp được (${unscheduledClasses.length})`}
              className="ai-unscheduled-card"
              size="small"
            >
              <Table
                className={`ai-unscheduled-table ${TABLE_SCROLL_CLASS}`}
                size="middle"
                pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} buổi` }}
                rowKey="event_id"
                dataSource={unscheduledClasses}
                scroll={getTableScroll(960)}
                columns={[
                  {
                    title: 'Mã lớp học phần',
                    dataIndex: 'section_id',
                    key: 'section_id',
                    minWidth: 280,
                  },
                  {
                    title: 'Mã sự kiện',
                    dataIndex: 'event_id',
                    key: 'event_id',
                    minWidth: 160,
                  },
                  {
                    title: 'Hình thức',
                    dataIndex: 'class_type',
                    key: 'class_type',
                    width: 120,
                    render: (value) => (value ? <Tag>{value}</Tag> : '—'),
                  },
                ]}
              />
            </Card>
          </>
        ) : null}

        {!successResult ? (
          <Form form={form} layout="vertical" initialValues={DEFAULT_SCHEDULING}>
            <div className="ai-scheduler-grid">
              <Card className="ai-run-card" bordered={false}>
                <Form.Item
                  name="semester_id"
                  label="Học kỳ"
                  rules={[{ required: true, message: 'Vui lòng chọn học kỳ' }]}
                  className="ai-config-semester"
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Chọn học kỳ cần xếp lịch"
                    options={semesterOptions}
                    size="large"
                  />
                </Form.Item>

                <Alert
                  type="warning"
                  showIcon
                  className="ai-config-alert"
                  message={
                    hasCohortFilter
                      ? 'Chỉ ghi đè TKB niên khóa đã chọn'
                      : 'Ghi đè toàn bộ TKB học kỳ'
                  }
                  description={
                    hasCohortFilter
                      ? `Xóa lịch cũ của ${cohortFilter.join(', ')} trước khi lưu kết quả mới.`
                      : 'Toàn bộ TKB học kỳ sẽ bị xóa trước khi lưu kết quả mới.'
                  }
                />

                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<PlayCircleOutlined />}
                  loading={running}
                  disabled={!selectedSemesterId || !readiness.isReady}
                  onClick={handleRunSolver}
                  className="ai-run-button"
                >
                  Chạy thuật toán AI
                </Button>
              </Card>

              <Collapse
                className="ai-settings-collapse"
                bordered={false}
                defaultActiveKey={['settings']}
                items={[
                  {
                    key: 'settings',
                    label: 'Cấu hình xếp lịch',
                    extra: (
                      <Button
                        type="link"
                        size="small"
                        icon={<SaveOutlined />}
                        loading={savingSettings}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleSaveSettings()
                        }}
                      >
                        Lưu
                      </Button>
                    ),
                    children: (
                      <div className="ai-settings-fields">
                        <div className="ai-settings-row-pair">
                          <Form.Item
                            name="shift_duration"
                            label="Số tiết / ca"
                            rules={[{ required: true, message: 'Bắt buộc' }]}
                          >
                            <InputNumber min={1} max={6} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item
                            name="evening_start_periods"
                            label="Tiết ca tối / E-learning"
                            rules={[{ required: true, message: 'Chọn tiết ca tối' }]}
                            getValueProps={(value) => ({
                              value:
                                Array.isArray(value) && value.length ? value[0] : (value ?? null),
                            })}
                            normalize={(value) =>
                              value == null || value === '' ? [] : [Number(value)]
                            }
                          >
                            <Select
                              options={PERIOD_OPTIONS}
                              placeholder="Chọn tiết"
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        </div>
                        <Form.Item
                          name="allowed_start_periods"
                          label="Tiết bắt đầu ca"
                          rules={[{ required: true, message: 'Chọn ít nhất một tiết' }]}
                        >
                          <Checkbox.Group
                            options={PERIOD_OPTIONS}
                            className="ai-checkbox-grid ai-checkbox-grid--periods"
                          />
                        </Form.Item>
                        <Form.Item
                          name="allowed_days"
                          label="Ngày học trong tuần"
                          rules={[{ required: true, message: 'Chọn ít nhất một ngày' }]}
                        >
                          <Checkbox.Group
                            options={DAY_OPTIONS}
                            className="ai-checkbox-grid ai-checkbox-grid--days"
                          />
                        </Form.Item>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </Form>
        ) : null}
      </div>
    </>
  )
}

export default AiScheduler
