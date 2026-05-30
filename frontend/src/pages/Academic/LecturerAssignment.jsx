import { useCallback, useEffect, useMemo, useState } from 'react'
import { RobotOutlined } from '@ant-design/icons'
import { Button, Empty, Select, Spin, Table, message } from 'antd'
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
import { useAppContext } from '../../contexts/AppContext'
import { getTableScroll } from '../../config/table'
import {
  autoAssignLecturers,
  getCourseSections,
  getLecturers,
  updateCourseSection,
} from '../../services/api'
import { renderLearningModeTag } from '../../constants/learningModes'

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
  const { semesters, activeSemesterId } = useAppContext()
  const [lecturers, setLecturers] = useState([])
  const [sections, setSections] = useState([])
  const [selectedSemester, setSelectedSemester] = useState(undefined)
  const [loading, setLoading] = useState(false)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [updatingSectionId, setUpdatingSectionId] = useState(null)

  const effectiveSemester =
    selectedSemester !== undefined ? selectedSemester : activeSemesterId

  const lecturerOptions = useMemo(
    () =>
      lecturers.map((lecturer) => ({
        value: lecturer.lecturer_id,
        label: `${lecturer.lecturer_name} (${lecturer.lecturer_id})`,
      })),
    [lecturers],
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
      .then((lecturersRes) => {
        setLecturers(lecturersRes.data || [])
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
  }, [])

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
  }, [effectiveSemester, fetchSections])

  const assignmentStats = useMemo(() => {
    const totalSections = sections.length
    const assignedSections = sections.filter((section) => section.lecturer_id).length
    const unassignedSections = totalSections - assignedSections
    const completionRate = totalSections
      ? Math.round((assignedSections / totalSections) * 100)
      : 0
    const totalCredits = sections.reduce(
      (sum, section) => sum + getSectionTeachingWeight(section),
      0,
    )
    const assignedCredits = sections
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
    for (const section of sections) {
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
  }, [sections, lecturers])

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
      ellipsis: true,
      render: (value) => <strong>{value}</strong>,
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
      title: 'Sĩ số',
      dataIndex: 'capacity',
      key: 'capacity',
      width: 90,
    },
    {
      title: 'Giảng viên phụ trách',
      key: 'lecturer_assignment',
      width: 320,
      render: (_, record) => (
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
      ),
    },
  ]

  return (
    <>
      <PageHeader
          title="Phân công giảng viên"
          subtitle="Gán giảng viên cho từng lớp học phần theo học kỳ"
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
              <Button
                type="primary"
                size="middle"
                icon={<RobotOutlined />}
                loading={autoAssigning}
                disabled={!effectiveSemester}
                onClick={handleAutoAssign}
              >
                Phân công tự động bằng AI
              </Button>
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
            rowKey="section_id"
            columns={columns}
            dataSource={sections}
            pagination={{ pageSize: 12, showSizeChanger: true, showTotal: (total) => `${total} lớp học phần` }}
            scroll={getTableScroll(960)}
            sticky
            locale={{
              emptyText: effectiveSemester
                ? 'Không có lớp học phần trong học kỳ này'
                : 'Vui lòng chọn học kỳ để phân công giảng viên',
            }}
          />
        </Spin>
    </>
  )
}

export default LecturerAssignment
