import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  Form,
  InputNumber,
  Progress,
  Select,
  Spin,
  Steps,
  Table,
  Tag,
  message,
} from 'antd'
import PageHeader from '../../components/Common/PageHeader'
import { saveSchedulerResult } from '../../utils/timetableGrid'
import { useAppContext } from '../../contexts/AppContext'
import {
  getCourseSections,
  getRooms,
  getSchedulerJobStatus,
  getSchedulingSettings,
  triggerAiScheduler,
  updateSchedulingSettings,
} from '../../services/api'

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
  default_lt_capacity: 80,
  default_th_capacity: 40,
  default_eln_capacity: 800,
  shift_duration: 3,
  allowed_start_periods: [1, 4, 7, 10, 13],
  allowed_days: [2, 3, 4, 5, 6, 7],
  evening_start_periods: [13],
}

const WORKFLOW_STEPS = [
  {
    key: 'sections',
    title: 'Sinh lớp học phần',
    path: '/course-sections',
  },
  {
    key: 'lecturers',
    title: 'Phân công giảng viên',
    path: '/academic/lecturer-assignment',
  },
  {
    key: 'solver',
    title: 'Chạy thuật toán AI',
    path: '/ai-scheduler',
  },
  {
    key: 'timetables',
    title: 'Xem thời khóa biểu',
    path: '/timetables',
  },
]

function AiScheduler() {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { semesters, activeSemesterId } = useAppContext()
  const [running, setRunning] = useState(false)
  const [jobState, setJobState] = useState(null)
  const [successResult, setSuccessResult] = useState(null)
  const [loadingReadiness, setLoadingReadiness] = useState(true)
  const [sections, setSections] = useState([])
  const [roomCount, setRoomCount] = useState(0)
  const [savingSettings, setSavingSettings] = useState(false)
  const [pollElapsedSec, setPollElapsedSec] = useState(0)
  const pollTimerRef = useRef(null)
  const pollStartedAtRef = useRef(null)
  const pollErrorCountRef = useRef(0)

  const selectedSemesterId = Form.useWatch('semester_id', form)

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
    let cancelled = false

    ;(async () => {
      try {
        const [sectionsRes, roomsRes] = await Promise.all([getCourseSections(), getRooms()])
        if (cancelled) return
        setSections(sectionsRes.data || [])
        setRoomCount(roomsRes.data?.length || 0)
      } catch {
        // Error handled by axios interceptor
      } finally {
        if (!cancelled) setLoadingReadiness(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

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
    [fetchReadinessData, selectedSemesterId, stopPolling],
  )

  const jobStateLabel = useMemo(() => {
    const elapsed =
      pollElapsedSec >= 60
        ? `${Math.floor(pollElapsedSec / 60)} phút ${pollElapsedSec % 60}s`
        : `${pollElapsedSec}s`
    if (jobState === 'active') {
      return `Đang chạy thuật toán tối ưu (${elapsed}) — ~400 buổi có thể 10–30+ phút...`
    }
    if (jobState === 'waiting' || jobState === 'delayed' || jobState === 'paused') {
      return `Đang chờ trong hàng đợi (${elapsed})...`
    }
    return `AI đang xử lý (${elapsed}) — vui lòng không đóng trang...`
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
    return sections.filter((section) => section.semester_id === selectedSemesterId)
  }, [sections, selectedSemesterId])

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
          ? `${totalSections} lớp trong học kỳ`
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
  }, [semesterSections, roomCount])

  const workflowProgress = useMemo(() => {
    const hasSections = readiness.checks.find((item) => item.key === 'sections')?.ok
    const hasLecturers = readiness.checks.find((item) => item.key === 'lecturers')?.ok
    const hasRooms = readiness.checks.find((item) => item.key === 'rooms')?.ok
    const isReady = readiness.isReady

    const getStepStatus = (index) => {
      if (index === 0) {
        if (!selectedSemesterId) return 'wait'
        return hasSections ? 'finish' : 'error'
      }
      if (index === 1) {
        if (!hasSections) return 'wait'
        return hasLecturers ? 'finish' : 'error'
      }
      if (index === 2) {
        if (!isReady) return 'wait'
        return 'process'
      }
      return 'wait'
    }

    const current = !selectedSemesterId
      ? 0
      : !hasSections
        ? 0
        : !hasLecturers || !hasRooms
          ? 1
          : 2

    const getStepDescription = (step) => {
      if (step.key === 'solver') {
        if (!hasRooms && hasLecturers) return 'Thiếu phòng học'
        return isReady ? 'Sẵn sàng' : 'Chưa đủ điều kiện'
      }
      if (step.key === 'timetables') return 'Sau khi xếp lịch'
      const check = readiness.checks.find((item) => item.key === step.key)
      if (!check?.ok && check?.link) {
        return check.detail.length > 28 ? `${check.detail.slice(0, 26)}…` : check.detail
      }
      return check?.ok ? 'OK' : 'Chưa xong'
    }

    const items = WORKFLOW_STEPS.map((step, index) => {
      const title =
        step.key === 'solver' ? (
          step.title
        ) : (
          <Link to={step.path} className="ai-workflow-step-link">
            {step.title}
          </Link>
        )

      return {
        title,
        description: getStepDescription(step),
        status: getStepStatus(index),
      }
    })

    return { current, items }
  }, [readiness, selectedSemesterId])

  const completedWorkflow = useMemo(() => {
    const items = WORKFLOW_STEPS.map((step, index) => ({
      title:
        step.key === 'solver' ? (
          step.title
        ) : (
          <Link to={step.path} className="ai-workflow-step-link">
            {step.title}
          </Link>
        ),
      description:
        index === 2
          ? 'Đã chạy xếp lịch thành công'
          : index === 3
            ? 'Xem kết quả trên trang Thời khóa biểu'
            : 'Hoàn thành',
      status: index < 3 ? 'finish' : 'process',
    }))

    return { current: 3, items }
  }, [])

  const unscheduledClasses = successResult?.unscheduled_classes || []
  const hasUnscheduled = unscheduledClasses.length > 0
  const scheduledCount =
    successResult?.total_scheduled || successResult?.total_events || successResult?.created_count || 0
  const deletedCount = successResult?.deleted_count
  const createdCount = successResult?.created_count ?? scheduledCount

  const handleSaveSettings = async () => {
    try {
      const values = await form.validateFields([
        'default_lt_capacity',
        'default_th_capacity',
        'default_eln_capacity',
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
            <Progress
              percent={
                pollElapsedSec > 0
                  ? Math.min(95, 15 + Math.floor((pollElapsedSec / 1800) * 80))
                  : jobState === 'active'
                    ? 35
                    : 15
              }
              status="active"
              showInfo={false}
              strokeColor={{ from: '#1677ff', to: '#722ed1' }}
              style={{ width: '100%', marginTop: 16 }}
            />
            <p className="ai-loading-subtext">
              Xếp lịch chạy nền (queue + solver). ~400 buổi có thể 10–30+ phút — không đóng trang.
            </p>
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
                  {hasUnscheduled ? 'Xếp lịch hoàn tất một phần' : 'Xếp lịch thành công'}
                </h2>
                <p className="ai-result-message">
                  {successResult.message ||
                    `Hệ thống đã lưu ${createdCount} buổi học vào cơ sở dữ liệu.`}
                </p>
              </div>
              <Tag color={hasUnscheduled ? 'warning' : 'success'} className="ai-result-tag">
                {hasUnscheduled ? 'Cần xếp tay' : 'Hoàn tất'}
              </Tag>
            </div>

            <div className="ai-result-stats">
              <div className="ai-result-stat">
                <div className="ai-result-stat-value">{createdCount}</div>
                <div className="ai-result-stat-label">Buổi đã xếp & lưu</div>
              </div>
              <div className="ai-result-stat">
                <div className="ai-result-stat-value">{unscheduledClasses.length}</div>
                <div className="ai-result-stat-label">Buổi chưa xếp được</div>
              </div>
              {successResult.phase3_scheduled > 0 ? (
                <div className="ai-result-stat">
                  <div className="ai-result-stat-value">{successResult.phase3_scheduled}</div>
                  <div className="ai-result-stat-label">Buổi xếp thêm (LNS)</div>
                </div>
              ) : null}
              {deletedCount !== undefined ? (
                <div className="ai-result-stat">
                  <div className="ai-result-stat-value">{deletedCount}</div>
                  <div className="ai-result-stat-label">Lịch cũ đã xóa</div>
                </div>
              ) : (
                <div className="ai-result-stat">
                  <div className="ai-result-stat-value">{successResult.semester_id || '—'}</div>
                  <div className="ai-result-stat-label">Học kỳ đã xếp</div>
                </div>
              )}
            </div>
          </Card>
        ) : null}

        <Spin spinning={loadingReadiness}>
          <Card className="ai-workflow-card ai-workflow-card--compact" bordered={false}>
            <div className="ai-workflow-header ai-workflow-header--compact">
              <div className="ai-workflow-heading">
                <span className="ai-workflow-icon ai-workflow-icon--compact">
                  <RobotOutlined />
                </span>
                <div>
                  <h2 className="ai-workflow-title">Tiến độ chuẩn bị</h2>
                </div>
              </div>
              <Tag
                color={
                  successResult ? 'success' : readiness.isReady ? 'success' : 'warning'
                }
              >
                {successResult
                  ? 'Đã xếp lịch'
                  : selectedSemesterId
                    ? readiness.isReady
                      ? 'Sẵn sàng'
                      : 'Chưa đủ điều kiện'
                    : 'Chưa chọn học kỳ'}
              </Tag>
            </div>

            <Steps
              className="ai-workflow-steps ai-workflow-steps--compact"
              size="small"
              responsive={false}
              current={successResult ? completedWorkflow.current : workflowProgress.current}
              items={successResult ? completedWorkflow.items : workflowProgress.items}
            />
          </Card>
        </Spin>

        {successResult && hasUnscheduled ? (
          <>
            <Alert
              type="warning"
              showIcon
              className="ai-unscheduled-alert"
              message="Các lớp không thể xếp tự động"
              description="Hệ thống đã chạy 3 bước: xếp cứng, nới lỏng, rồi sửa cục bộ (LNS — dời một phần lịch lân cận để nhét buổi còn thiếu). Các buổi dưới đây vẫn không có ô trống hợp lệ — kiểm tra phòng/GV/nhóm SV hoặc xếp tay trên lưới TKB."
            />
            <Card title="Danh sách buổi cần xếp tay" className="ai-unscheduled-card">
              <Table
                className="ai-unscheduled-table"
                size="middle"
                pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} buổi` }}
                rowKey="event_id"
                dataSource={unscheduledClasses}
                scroll={{ x: 720 }}
                columns={[
                  {
                    title: 'Mã lớp học phần',
                    dataIndex: 'section_id',
                    key: 'section_id',
                    ellipsis: true,
                  },
                  {
                    title: 'Mã sự kiện',
                    dataIndex: 'event_id',
                    key: 'event_id',
                    ellipsis: true,
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
              <Card title="Xếp lịch" className="ai-config-card">
                <div className="ai-config-top-row">
                  <Form.Item
                    name="semester_id"
                    label="Học kỳ cần xếp lịch"
                    rules={[{ required: true, message: 'Vui lòng chọn học kỳ' }]}
                    className="ai-config-semester"
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Chọn học kỳ"
                      options={semesterOptions}
                    />
                  </Form.Item>
                  <Button
                    type="primary"
                    size="middle"
                    icon={<PlayCircleOutlined />}
                    loading={running}
                    disabled={!selectedSemesterId || !readiness.isReady}
                    onClick={handleRunSolver}
                    className="ai-run-button-inline"
                  >
                    Chạy thuật toán AI
                  </Button>
                </div>

                <Alert
                  type="warning"
                  showIcon
                  className="ai-config-alert"
                  message="Mỗi lần chạy sẽ xóa hết thời khóa biểu cũ"
                  description="Toàn bộ TKB của học kỳ đã chọn sẽ bị xóa trước khi lưu kết quả xếp lịch mới."
                />
              </Card>

              <Card title="Cấu hình hệ thống" className="ai-settings-card">
                <div className="settings-form-grid settings-form-grid--panel">
                  <Form.Item
                    name="default_lt_capacity"
                    label="Sĩ số chuẩn LT"
                    rules={[{ required: true, message: 'Bắt buộc' }]}
                  >
                    <InputNumber min={1} max={500} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    name="default_th_capacity"
                    label="Sĩ số chuẩn TH/PM"
                    rules={[{ required: true, message: 'Bắt buộc' }]}
                  >
                    <InputNumber min={1} max={500} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    name="default_eln_capacity"
                    label="Sĩ số tối đa / lớp E-Learning"
                    tooltip="Ghép tối đa các nhóm SV vào một lớp ONLINE; vượt ngưỡng này mới tách ELN02, ELN03… (môn đại cương toàn trường có thể để 800)."
                    rules={[{ required: true, message: 'Bắt buộc' }]}
                  >
                    <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    name="shift_duration"
                    label="Số tiết / ca"
                    rules={[{ required: true, message: 'Bắt buộc' }]}
                  >
                    <InputNumber min={1} max={6} style={{ width: '100%' }} />
                  </Form.Item>
                </div>
                <Form.Item
                  name="allowed_start_periods"
                  label="Tiết bắt đầu hợp lệ (Ca học)"
                  rules={[{ required: true, message: 'Chọn ít nhất một tiết' }]}
                >
                  <Select
                    mode="multiple"
                    allowClear
                    options={PERIOD_OPTIONS}
                    placeholder="Chọn tiết bắt đầu ca"
                  />
                </Form.Item>
                <Form.Item
                  name="allowed_days"
                  label="Ngày học trong tuần"
                  rules={[{ required: true, message: 'Chọn ít nhất một ngày' }]}
                >
                  <Select
                    mode="multiple"
                    allowClear
                    options={DAY_OPTIONS}
                    placeholder="Chọn ngày học"
                  />
                </Form.Item>
                <Form.Item
                  name="evening_start_periods"
                  label="Tiết bắt đầu ca tối / E-learning"
                  rules={[{ required: true, message: 'Chọn ít nhất một tiết' }]}
                >
                  <Select
                    mode="multiple"
                    allowClear
                    options={PERIOD_OPTIONS}
                    placeholder="Chọn tiết ca tối"
                  />
                </Form.Item>
                <Button
                  type="default"
                  size="middle"
                  icon={<SaveOutlined />}
                  loading={savingSettings}
                  onClick={handleSaveSettings}
                >
                  Lưu cấu hình
                </Button>
              </Card>
            </div>
          </Form>
        ) : null}
      </div>
    </>
  )
}

export default AiScheduler
