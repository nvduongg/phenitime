import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { RobotOutlined, SendOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Input, Modal, Select, Spin, Table, Tag, Typography, message } from 'antd'

const { Text } = Typography
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import PageHeader from '../../components/Common/PageHeader'
import { useAuth } from '../../contexts/AuthContext'
import { useAppContext } from '../../contexts/AppContext'
import { isOfficeRole } from '../../config/permissions'
import {
  canSendAssignmentRequest,
  hasPendingAssignmentRequest,
  requiresAssignmentRequest,
} from '../../utils/assignmentScope'
import { getTableScroll, TABLE_SCROLL_CLASS } from '../../config/table'
import {
  autoAssignLecturers,
  bulkCreateAssignmentRequests,
  createAssignmentRequest,
  getCohorts,
  getCourseSections,
  getLecturers,
  updateCourseSection,
} from '../../services/api'
import { renderLearningModeTag } from '../../constants/learningModes'
import { sectionMatchesCohortFilter } from '../../utils/exportFormatters'
import { loadCohortFilter, saveCohortFilter } from '../../utils/cohortFilterStorage'
import { formatCohortLabel } from '../../utils/formatters'

const ASSIGNMENT_STATUS_COLORS = {
  assigned: '#52c41a',
  unassigned: '#faad14',
}

function getSectionTeachingWeight(section) {
  if (section.class_type === 'TH') {
    return section.course?.practice_credits || 1
  }
  return section.course?.theory_credits || 1
}

function LecturerAssignment() {
  const { user } = useAuth()
  const location = useLocation()
  const { semesters, activeSemesterId } = useAppContext()
  const scopedOffice = isOfficeRole(user?.role)
  const [lecturers, setLecturers] = useState([])
  const [sections, setSections] = useState([])
  const [cohortOptions, setCohortOptions] = useState([])
  const [cohortFilter, setCohortFilterState] = useState(() => loadCohortFilter())
  const [selectedSemester, setSelectedSemester] = useState(undefined)
  const [loading, setLoading] = useState(false)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [updatingSectionId, setUpdatingSectionId] = useState(null)
  const [requestModal, setRequestModal] = useState(null)
  const [requestMessage, setRequestMessage] = useState('')
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [bulkRequestOpen, setBulkRequestOpen] = useState(false)
  const [bulkRequestMessage, setBulkRequestMessage] = useState('')
  const [bulkRequestSubmitting, setBulkRequestSubmitting] = useState(false)

  const effectiveSemester =
    selectedSemester !== undefined ? selectedSemester : activeSemesterId

  const setCohortFilter = useCallback((value) => {
    setCohortFilterState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      saveCohortFilter(next)
      return next
    })
  }, [])

  const filteredSections = useMemo(
    () => sections.filter((section) => sectionMatchesCohortFilter(section, cohortFilter)),
    [sections, cohortFilter],
  )

  const lecturerOptions = useMemo(
    () =>
      lecturers.map((lecturer) => ({
        value: lecturer.lecturer_id,
        label: `${lecturer.lecturer_name} (${lecturer.lecturer_id})`,
      })),
    [lecturers],
  )

  const externalSectionCount = useMemo(
    () => filteredSections.filter((s) => requiresAssignmentRequest(s)).length,
    [filteredSections],
  )

  const bulkRequestEligibleCount = useMemo(
    () => filteredSections.filter((s) => canSendAssignmentRequest(s)).length,
    [filteredSections],
  )

  const semesterOptions = useMemo(
    () =>
      semesters.map((semester) => ({
        value: semester.semester_id,
        label: semester.semester_name || semester.semester_id,
      })),
    [semesters],
  )

  useEffect(() => {
    getLecturers()
      .then((res) => setLecturers(res.data || []))
      .catch(() => {})
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

  const fetchSections = useCallback(async (semesterId) => {
    if (!semesterId) {
      setSections([])
      return
    }

    setLoading(true)
    try {
      const result = await getCourseSections()
      const filtered = (result.data || []).filter(
        (section) => section.semester_id === semesterId,
      )
      setSections(filtered)
    } catch {
      // Error handled by axios interceptor
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSections(effectiveSemester)
  }, [effectiveSemester, fetchSections, location.pathname])

  const assignmentStats = useMemo(() => {
    const totalSections = filteredSections.length
    const assignedSections = filteredSections.filter((section) => section.lecturer_id).length
    const unassignedSections = totalSections - assignedSections
    const completionRate = totalSections
      ? Math.round((assignedSections / totalSections) * 100)
      : 0
    const totalCredits = filteredSections.reduce(
      (sum, section) => sum + getSectionTeachingWeight(section),
      0,
    )
    const assignedCredits = filteredSections
      .filter((section) => section.lecturer_id)
      .reduce((sum, section) => sum + getSectionTeachingWeight(section), 0)

    const statusChartData = [
      {
        name: 'Đã phân công',
        value: assignedSections,
        color: ASSIGNMENT_STATUS_COLORS.assigned,
      },
      {
        name: 'Chưa phân công',
        value: unassignedSections,
        color: ASSIGNMENT_STATUS_COLORS.unassigned,
      },
    ].filter((item) => item.value > 0)

    const lecturerLoadMap = new Map()
    for (const section of filteredSections) {
      if (!section.lecturer_id) continue

      const lecturerName =
        section.lecturer?.lecturer_name ||
        lecturers.find((item) => item.lecturer_id === section.lecturer_id)?.lecturer_name ||
        section.lecturer_id

      const current = lecturerLoadMap.get(section.lecturer_id) || {
        lecturerId: section.lecturer_id,
        name: lecturerName,
        sections: 0,
        credits: 0,
      }

      current.sections += 1
      current.credits += getSectionTeachingWeight(section)
      lecturerLoadMap.set(section.lecturer_id, current)
    }

    const lecturerLoadChartData = [...lecturerLoadMap.values()]
      .sort((a, b) => b.sections - a.sections || b.credits - a.credits)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        sections: item.sections,
        credits: item.credits,
      }))

    return {
      totalSections,
      assignedSections,
      unassignedSections,
      completionRate,
      totalCredits,
      assignedCredits,
      statusChartData,
      lecturerLoadChartData,
    }
  }, [filteredSections, lecturers])

  const handleLecturerChange = async (sectionId, lecturerId) => {
    setUpdatingSectionId(sectionId)
    try {
      await updateCourseSection(sectionId, { lecturer_id: lecturerId || null })
      message.success('Đã cập nhật giảng viên')

      setSections((prev) =>
        prev.map((section) => {
          if (section.section_id !== sectionId) return section
          const lecturer = lecturers.find((item) => item.lecturer_id === lecturerId) || null
          return {
            ...section,
            lecturer_id: lecturerId || null,
            lecturer,
          }
        }),
      )
    } catch {
      // Error handled by axios interceptor
    } finally {
      setUpdatingSectionId(null)
    }
  }

  const handleCreateRequest = async () => {
    if (!requestModal) return
    setRequestSubmitting(true)
    try {
      await createAssignmentRequest({
        section_id: requestModal.section_id,
        message: requestMessage.trim() || undefined,
      })
      message.success('Đã gửi yêu cầu phân công')
      setRequestModal(null)
      setRequestMessage('')
      await fetchSections(effectiveSemester)
    } finally {
      setRequestSubmitting(false)
    }
  }

  const handleBulkCreateRequests = async () => {
    if (!effectiveSemester) {
      message.warning('Chọn học kỳ trước')
      return
    }
    setBulkRequestSubmitting(true)
    try {
      const res = await bulkCreateAssignmentRequests({
        semester_id: effectiveSemester,
        message: bulkRequestMessage.trim() || undefined,
      })
      message.success(res.message || 'Đã gửi yêu cầu hàng loạt')
      setBulkRequestOpen(false)
      setBulkRequestMessage('')
      await fetchSections(effectiveSemester)
    } catch {
      // interceptor
    } finally {
      setBulkRequestSubmitting(false)
    }
  }

  const handleAutoAssign = async () => {
    if (!effectiveSemester) {
      message.warning('Vui lòng chọn học kỳ trước khi phân công tự động')
      return
    }

    setAutoAssigning(true)
    const hideLoading = message.loading('Đang chạy AI phân công giảng viên...', 0)

    try {
      const result = await autoAssignLecturers(effectiveSemester)
      message.success(result.message || 'Phân công tự động thành công')
      await fetchSections(effectiveSemester)
    } catch {
      // Error handled by axios interceptor
    } finally {
      hideLoading()
      setAutoAssigning(false)
    }
  }

  const columns = [
    {
      title: 'Mã lớp HP',
      dataIndex: 'section_id',
      key: 'section_id',
      minWidth: 280,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Tên học phần',
      key: 'course_name',
      minWidth: 220,
      render: (_, record) => (
        <span>
          {record.course?.course_name || record.course_id}
          {requiresAssignmentRequest(record) ? (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              Cần yêu cầu
            </Tag>
          ) : null}
          {hasPendingAssignmentRequest(record) ? (
            <Tag color="blue" style={{ marginLeft: 8 }}>
              Đã gửi YC
            </Tag>
          ) : null}
        </span>
      ),
    },
    ...(scopedOffice
      ? [
          {
            title: 'Khoa quản lý HP',
            key: 'managing_unit',
            minWidth: 160,
            render: (_, record) =>
              record.assignment_meta?.course_managing_unit_name ||
              record.course?.unit?.unit_name ||
              '—',
          },
        ]
      : []),
    {
      title: 'Hình thức học',
      key: 'learning_mode',
      width: 200,
      render: (_, record) => renderLearningModeTag(record),
    },
    {
      title: 'Sĩ số',
      dataIndex: 'capacity',
      key: 'capacity',
      width: 90,
    },
    {
      title: 'Giảng viên phụ trách',
      key: 'lecturer_assignment',
      width: 320,
      render: (_, record) => {
        if (requiresAssignmentRequest(record)) {
          const targetName =
            record.assignment_meta?.course_managing_unit_name ||
            record.course?.unit?.unit_name
          if (hasPendingAssignmentRequest(record)) {
            return (
              <span>
                <Text type="secondary">Chờ {targetName} phân công</Text>
                <Link to="/academic/assignment-requests" style={{ marginLeft: 8 }}>
                  Xem yêu cầu
                </Link>
              </span>
            )
          }
          return (
            <Button
              size="small"
              icon={<SendOutlined />}
              onClick={() => {
                setRequestModal(record)
                setRequestMessage('')
              }}
            >
              Gửi yêu cầu → {targetName}
            </Button>
          )
        }

        return (
          <Select
            showSearch
            allowClear
            optionFilterProp="label"
            placeholder="Chọn giảng viên"
            style={{ width: '100%' }}
            options={lecturerOptions}
            value={record.lecturer_id || undefined}
            loading={updatingSectionId === record.section_id}
            disabled={updatingSectionId === record.section_id || autoAssigning}
            onChange={(value) => handleLecturerChange(record.section_id, value)}
          />
        )
      },
    },
  ]

  return (
    <>
      {scopedOffice ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Học phần do đơn vị khác quản lý chuyên môn"
          description={
            externalSectionCount > 0
              ? `Có ${externalSectionCount} lớp không thuộc khoa/trường bạn quản lý chuyên môn — không tự phân công được. Dùng «Gửi yêu cầu» để nhờ VP trường/khoa quản lý học phần phân công giảng viên của họ. Theo dõi tại mục Yêu cầu phân công.`
              : 'Chỉ phân công giảng viên thuộc phạm vi đơn vị bạn. Lớp học phần do đơn vị khác quản lý sẽ hiển thị nút gửi yêu cầu.'
          }
        />
      ) : null}

      <PageHeader
          title="Phân công giảng viên"
          subtitle={
            scopedOffice
              ? 'Tự phân công trong phạm vi; học phần ngoài phạm vi — gửi yêu cầu'
              : 'Gán giảng viên cho từng lớp học phần theo học kỳ'
          }
          filters={
            <>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn học kỳ"
                style={{ minWidth: 280 }}
                options={semesterOptions}
                value={effectiveSemester}
                onChange={setSelectedSemester}
                allowClear
              />
              <Select
                allowClear
                mode="multiple"
                placeholder="Lọc niên khóa"
                style={{ minWidth: 220 }}
                options={cohortOptions}
                value={cohortFilter}
                onChange={setCohortFilter}
                maxTagCount="responsive"
              />
              <Button
                type="primary"
                size="middle"
                icon={<RobotOutlined />}
                loading={autoAssigning}
                disabled={!effectiveSemester || autoAssigning}
                onClick={handleAutoAssign}
              >
                Phân công tự động bằng AI
              </Button>
              {scopedOffice ? (
                <Button
                  size="middle"
                  icon={<SendOutlined />}
                  disabled={!effectiveSemester || bulkRequestEligibleCount === 0}
                  onClick={() => {
                    setBulkRequestMessage('')
                    setBulkRequestOpen(true)
                  }}
                >
                  Gửi yêu cầu hàng loạt
                  {bulkRequestEligibleCount > 0 ? ` (${bulkRequestEligibleCount})` : ''}
                </Button>
              ) : null}
            </>
          }
        />

        <div className="chart-grid chart-grid--assignment">
          <div className="chart-panel">
            <div className="chart-panel-title">Tình trạng phân công giảng viên</div>
            {assignmentStats.statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <PieChart>
                  <Pie
                    data={assignmentStats.statusChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={96}
                    paddingAngle={3}
                    label={({ name, value, percent }) =>
                      `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {assignmentStats.statusChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} lớp`, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  effectiveSemester
                    ? 'Chưa có lớp học phần trong học kỳ này'
                    : 'Chọn học kỳ để xem thống kê'
                }
              />
            )}
          </div>

          <div className="chart-panel">
            <div className="chart-panel-title">Khối lượng giảng dạy theo giảng viên (top 10)</div>
            {assignmentStats.lecturerLoadChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={assignmentStats.lecturerLoadChartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={72}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, name) => [
                      value,
                      name === 'sections' ? 'Số lớp' : 'Tín chỉ',
                    ]}
                  />
                  <Legend
                    formatter={(value) => (value === 'sections' ? 'Số lớp' : 'Tín chỉ giảng dạy')}
                  />
                  <Bar
                    dataKey="sections"
                    name="sections"
                    fill="#1677ff"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="credits"
                    name="credits"
                    fill="#722ed1"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  effectiveSemester
                    ? 'Chưa có giảng viên nào được phân công'
                    : 'Chọn học kỳ để xem thống kê'
                }
              />
            )}
          </div>
        </div>

        <Spin spinning={loading || autoAssigning}>
          <Table
            className={TABLE_SCROLL_CLASS}
            rowKey="section_id"
            columns={columns}
            dataSource={filteredSections}
            pagination={{
              pageSize: 12,
              showSizeChanger: true,
              showTotal: (total) =>
                cohortFilter.length
                  ? `${total} lớp (${cohortFilter.join(', ')})`
                  : `${total} lớp học phần`,
            }}
            scroll={getTableScroll(1280)}
            sticky
            locale={{
              emptyText: effectiveSemester
                ? 'Không có lớp học phần trong học kỳ này'
                : 'Vui lòng chọn học kỳ để phân công giảng viên',
            }}
          />
        </Spin>

      <Modal
        title="Gửi yêu cầu phân công hàng loạt"
        open={bulkRequestOpen}
        onCancel={() => setBulkRequestOpen(false)}
        onOk={handleBulkCreateRequests}
        okText={`Gửi ${bulkRequestEligibleCount} yêu cầu`}
        confirmLoading={bulkRequestSubmitting}
        destroyOnHidden
        okButtonProps={{ disabled: bulkRequestEligibleCount === 0 }}
      >
        <p>
          Gửi yêu cầu phân công cho <strong>{bulkRequestEligibleCount}</strong> lớp học phần do đơn
          vị khác quản lý chuyên môn (chưa có yêu cầu đang chờ) trong học kỳ đã chọn.
        </p>
        <Input.TextArea
          rows={3}
          placeholder="Ghi chú chung (tùy chọn) — áp dụng cho tất cả yêu cầu"
          value={bulkRequestMessage}
          onChange={(e) => setBulkRequestMessage(e.target.value)}
        />
      </Modal>

      <Modal
        title="Gửi yêu cầu phân công giảng dạy"
        open={Boolean(requestModal)}
        onCancel={() => setRequestModal(null)}
        onOk={handleCreateRequest}
        okText="Gửi yêu cầu"
        confirmLoading={requestSubmitting}
        destroyOnHidden
      >
        {requestModal ? (
          <>
            <p>
              Lớp <strong>{requestModal.section_id}</strong> — học phần do{' '}
              <strong>
                {requestModal.assignment_meta?.course_managing_unit_name ||
                  requestModal.course?.unit?.unit_name}
              </strong>{' '}
              quản lý chuyên môn. Đơn vị đó sẽ phân công giảng viên thay bạn.
            </p>
            <Input.TextArea
              rows={3}
              placeholder="Ghi chú (tùy chọn): lý do, thời hạn, lớp ghép..."
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
            />
          </>
        ) : null}
      </Modal>
    </>
  )
}

export default LecturerAssignment
