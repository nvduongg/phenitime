import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  PieChartOutlined,
  ReloadOutlined,
  RobotOutlined,
  ScheduleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import PageHeader from '../../components/Common/PageHeader'
import { useAppContext } from '../../contexts/AppContext'
import { getRooms, getTimetables } from '../../services/api'
import {
  buildDashboardMetrics,
  DUMMY_LEARNING_MODES,
  DUMMY_ROOM_OCCUPANCY,
  DUMMY_SCHEDULING_KPIS,
  DUMMY_SUCCESS_RATE,
  SCHEDULING_STATUS_COLORS,
} from '../../utils/dashboardMetrics'
import { loadSchedulerResult } from '../../utils/timetableGrid'

const { Text, Title } = Typography

const KPI_THEMES = {
  total: {
    accent: '#1677ff',
    gradient: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
    iconBg: 'linear-gradient(135deg, #1677ff 0%, #4096ff 100%)',
  },
  strict: {
    accent: '#52c41a',
    gradient: 'linear-gradient(135deg, #f6ffed 0%, #f0fff4 100%)',
    iconBg: 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)',
  },
  relaxed: {
    accent: '#fa8c16',
    gradient: 'linear-gradient(135deg, #fff7e6 0%, #fffbe6 100%)',
    iconBg: 'linear-gradient(135deg, #fa8c16 0%, #ffc53d 100%)',
  },
  unscheduled: {
    accent: '#ff4d4f',
    gradient: 'linear-gradient(135deg, #fff1f0 0%, #fff2f0 100%)',
    iconBg: 'linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%)',
  },
}

function formatPercent(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function DonutCenterLabel({ viewBox, percent }) {
  if (!viewBox) return null
  const { cx, cy } = viewBox
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" className="dashboard-donut-value">
        {percent}%
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="dashboard-donut-label">
        Đã xếp
      </text>
    </g>
  )
}

function SchedulingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null
  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0)
  const pct = total ? Math.round((item.value / total) * 100) : 0

  return (
    <div className="dashboard-chart-tooltip">
      <span className="dashboard-chart-tooltip-dot" style={{ background: item.color }} />
      <div>
        <strong>{item.name}</strong>
        <div>{item.value} ca · {pct}%</div>
      </div>
    </div>
  )
}

function RoomOccupancyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div className="dashboard-chart-tooltip dashboard-chart-tooltip--wide">
      <strong>{label}</strong>
      <div className="dashboard-chart-tooltip-grid">
        <span>Phòng sử dụng</span>
        <strong>{row?.utilizedRooms ?? 0}</strong>
        <span>Số ca đã xếp</span>
        <strong>{row?.bookings ?? 0}</strong>
        <span>Tải phòng</span>
        <strong>{row?.utilizationPct ?? 0}%</strong>
      </div>
    </div>
  )
}

function Dashboard() {
  const { activeSemesterId, semesters } = useAppContext()
  const [loading, setLoading] = useState(true)
  const [timetables, setTimetables] = useState([])
  const [rooms, setRooms] = useState([])
  const [schedulerSnapshot, setSchedulerSnapshot] = useState(null)
  const [useDemoLayout, setUseDemoLayout] = useState(false)

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    try {
      const [timetableRes, roomsRes] = await Promise.all([getTimetables(), getRooms()])
      setTimetables(timetableRes.data || [])
      setRooms(roomsRes.data || [])
    } catch {
      setTimetables([])
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
    setSchedulerSnapshot(loadSchedulerResult())
  }, [fetchDashboardData])

  const refreshSnapshot = () => {
    setSchedulerSnapshot(loadSchedulerResult())
  }

  const activeSemesterLabel = useMemo(() => {
    const match = semesters.find((item) => item.semester_id === activeSemesterId)
    return match?.semester_name || activeSemesterId || '—'
  }, [activeSemesterId, semesters])

  const metrics = useMemo(() => {
    const snapshotSemester = schedulerSnapshot?.semester_id
    const semesterId = snapshotSemester || activeSemesterId || null

    return buildDashboardMetrics({
      timetableSnapshot: schedulerSnapshot?.timetable_snapshot || [],
      timetables,
      unscheduledClasses: schedulerSnapshot?.unscheduled_classes || [],
      rooms,
      semesterId,
    })
  }, [activeSemesterId, rooms, schedulerSnapshot, timetables])

  useEffect(() => {
    setUseDemoLayout(!metrics.hasLiveData)
  }, [metrics.hasLiveData])

  const displayKpis = useDemoLayout ? DUMMY_SCHEDULING_KPIS : metrics.kpis
  const successRateData = useDemoLayout ? DUMMY_SUCCESS_RATE : metrics.successRateData
  const learningModesData = useDemoLayout ? DUMMY_LEARNING_MODES : metrics.learningModesData
  const roomOccupancyData = useDemoLayout ? DUMMY_ROOM_OCCUPANCY : metrics.roomOccupancyByDay

  const totalForCharts = displayKpis.total || 0
  const scheduledTotal = displayKpis.strict + displayKpis.relaxed
  const successRatePct = formatPercent(scheduledTotal, totalForCharts)

  const kpiCards = [
    {
      key: 'total',
      title: 'Tổng số ca học',
      value: displayKpis.total,
      icon: <CalendarOutlined />,
      hint: 'Tổng buổi cần xếp trong kỳ',
    },
    {
      key: 'strict',
      title: 'Xếp chuẩn',
      value: displayKpis.strict,
      icon: <CheckCircleOutlined />,
      hint: 'Thỏa toàn bộ ràng buộc cứng',
    },
    {
      key: 'relaxed',
      title: 'Linh động',
      value: displayKpis.relaxed,
      icon: <WarningOutlined />,
      hint: 'Có điều chỉnh mềm — cần rà soát',
    },
    {
      key: 'unscheduled',
      title: 'Chưa xếp được',
      value: displayKpis.unscheduled,
      icon: <AlertOutlined />,
      hint: 'Cần xử lý thủ công',
    },
  ]

  const peakDay = useMemo(() => {
    if (!roomOccupancyData?.length) return null
    return [...roomOccupancyData].sort((a, b) => b.utilizationPct - a.utilizationPct)[0]
  }, [roomOccupancyData])

  return (
    <div className="dashboard-page">
      <Spin spinning={loading} wrapperClassName="dashboard-spin">
        <div className="dashboard-stack">
        <PageHeader
          title="Bảng điều khiển điều hành"
          subtitle="Tổng quan hiệu quả xếp lịch AI, tải phòng học và phân bổ hình thức giảng dạy"
          actions={(
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => { fetchDashboardData(); refreshSnapshot() }}>
                Làm mới
              </Button>
              <Link to="/ai-scheduler">
                <Button type="primary" icon={<RobotOutlined />}>
                  Xếp lịch AI
                </Button>
              </Link>
              <Link to="/timetables">
                <Button icon={<ScheduleOutlined />}>Lưới TKB</Button>
              </Link>
            </Space>
          )}
        />

        <Card bordered={false} className="dashboard-hero">
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} lg={14}>
              <div className="dashboard-hero-copy">
                <Tag className="dashboard-hero-tag" color="processing">
                  {activeSemesterLabel}
                </Tag>
                <Title level={3} className="dashboard-hero-title">
                  Tình hình xếp thời khóa biểu
                </Title>
                <Text type="secondary" className="dashboard-hero-desc">
                  {useDemoLayout
                    ? 'Chưa có dữ liệu xếp lịch trong phiên này. Chạy thuật toán AI để kích hoạt số liệu thật.'
                    : `Trong ${totalForCharts} ca cần xếp: ${scheduledTotal} ca đã có lịch (${displayKpis.strict} đúng quy định, ${displayKpis.relaxed} linh động), ${displayKpis.unscheduled} ca chưa xếp được.`}
                </Text>
                <div className="dashboard-hero-meta">
                  {schedulerSnapshot?.saved_at ? (
                    <span>
                      Cập nhật: {new Date(schedulerSnapshot.saved_at).toLocaleString('vi-VN')}
                    </span>
                  ) : null}
                  {useDemoLayout ? (
                    <Tag color="gold">Dữ liệu minh họa</Tag>
                  ) : (
                    <Tag color="success">Dữ liệu thật</Tag>
                  )}
                </div>
              </div>
            </Col>
            <Col xs={24} lg={10}>
              <div className="dashboard-hero-metric">
                <div className="dashboard-hero-metric-ring">
                  <Progress
                    type="dashboard"
                    percent={successRatePct}
                    strokeColor={{
                      '0%': '#1677ff',
                      '100%': '#722ed1',
                    }}
                    trailColor="rgba(255,255,255,0.35)"
                    size={148}
                    format={() => (
                      <div className="dashboard-hero-ring-inner">
                        <span className="dashboard-hero-ring-value">{successRatePct}%</span>
                        <span className="dashboard-hero-ring-label">Ca đã có lịch</span>
                      </div>
                    )}
                  />
                </div>
                <div className="dashboard-hero-stats">
                  <div>
                    <Text type="secondary">Phòng khả dụng</Text>
                    <div className="dashboard-hero-stat-value">
                      {metrics.physicalRoomTotal || rooms.length || '—'}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Ngày cao điểm</Text>
                    <div className="dashboard-hero-stat-value">
                      {peakDay ? `${peakDay.label} (${peakDay.utilizationPct}%)` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        {!useDemoLayout && displayKpis.relaxed > 0 ? (
          <Alert
            type="warning"
            showIcon
            className="dashboard-alert"
            message={`${displayKpis.relaxed} ca học xếp linh động — nên kiểm tra trên Lưới TKB (màu cảnh báo).`}
            action={<Link to="/timetables">Mở TKB</Link>}
          />
        ) : null}

        {useDemoLayout ? (
          <Alert
            type="info"
            showIcon
            className="dashboard-alert"
            message="Dashboard đang dùng bố cục mẫu. Chạy Xếp lịch AI để hiển thị kết quả 96%+ như lần chạy gần đây."
            action={<Link to="/ai-scheduler">Chạy ngay</Link>}
          />
        ) : null}

        <Row gutter={[24, 24]} className="dashboard-kpi-row">
          {kpiCards.map((card) => {
            const theme = KPI_THEMES[card.key]
            const percent = formatPercent(card.value, totalForCharts)

            return (
              <Col xs={24} sm={12} xl={6} key={card.key}>
                <Card
                  bordered={false}
                  className={`dashboard-kpi-card dashboard-kpi-card--${card.key}`}
                  style={{ background: theme.gradient }}
                >
                  <div className="dashboard-kpi-layout">
                    <div
                      className="dashboard-kpi-icon"
                      style={{ background: theme.iconBg }}
                    >
                      {card.icon}
                    </div>
                    <div className="dashboard-kpi-body">
                      <Text type="secondary" className="dashboard-kpi-label">
                        {card.title}
                      </Text>
                      <div className="dashboard-kpi-value" style={{ color: theme.accent }}>
                        {card.value}
                        {card.key !== 'total' && totalForCharts > 0 ? (
                          <span className="dashboard-kpi-pct">{percent}%</span>
                        ) : null}
                      </div>
                      <Text type="secondary" className="dashboard-kpi-hint">
                        {card.hint}
                      </Text>
                      {card.key !== 'total' ? (
                        <Progress
                          percent={percent}
                          showInfo={false}
                          strokeColor={theme.accent}
                          trailColor="rgba(0,0,0,0.06)"
                          size="small"
                        />
                      ) : null}
                    </div>
                  </div>
                </Card>
              </Col>
            )
          })}
        </Row>

        <Row gutter={[24, 24]} className="dashboard-chart-row">
          <Col xs={24} xl={12}>
            <Card bordered={false} className="dashboard-chart-card">
              <div className="dashboard-chart-card-header">
                <div className="dashboard-chart-title-wrap">
                  <span className="dashboard-chart-icon dashboard-chart-icon--pie">
                    <PieChartOutlined />
                  </span>
                  <div>
                    <Text strong className="dashboard-chart-title">
                      Tỷ lệ thành công xếp lịch
                    </Text>
                    <Text type="secondary" className="dashboard-chart-subtitle">
                      Chuẩn · Linh động · Chưa xếp
                    </Text>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={successRateData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={108}
                    paddingAngle={3}
                    stroke="#fff"
                    strokeWidth={2}
                    label={false}
                  >
                    {successRateData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                    <Label content={<DonutCenterLabel percent={successRatePct} />} position="center" />
                  </Pie>
                  <Tooltip content={<SchedulingTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    formatter={(value) => <span className="dashboard-legend-item">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="dashboard-chart-legend-row">
                {successRateData.map((item) => (
                  <div key={item.name} className="dashboard-mini-legend">
                    <span style={{ background: item.color }} />
                    <Text>{item.name}</Text>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card bordered={false} className="dashboard-chart-card">
              <div className="dashboard-chart-card-header">
                <div className="dashboard-chart-title-wrap">
                  <span className="dashboard-chart-icon dashboard-chart-icon--bar">
                    <CalendarOutlined />
                  </span>
                  <div>
                    <Text strong className="dashboard-chart-title">
                      Phân bổ hình thức học
                    </Text>
                    <Text type="secondary" className="dashboard-chart-subtitle">
                      Lý thuyết · Thực hành · Trực tuyến
                    </Text>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={learningModesData}
                  margin={{ top: 12, right: 8, left: -8, bottom: 0 }}
                  barCategoryGap="28%"
                >
                  <defs>
                    {learningModesData.map((entry) => (
                      <linearGradient key={entry.key} id={`barGrad-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={entry.fill} stopOpacity={1} />
                        <stop offset="100%" stopColor={entry.fill} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(22, 119, 255, 0.06)' }}
                    formatter={(value) => [`${value} ca`, 'Số lượng']}
                  />
                  <Bar dataKey="count" name="Số ca học" radius={[8, 8, 0, 0]} maxBarSize={48}>
                    {learningModesData.map((entry) => (
                      <Cell key={entry.key} fill={`url(#barGrad-${entry.key})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        <Row gutter={[24, 24]} className="dashboard-chart-row--bottom">
          <Col span={24}>
            <Card bordered={false} className="dashboard-chart-card dashboard-chart-card--wide">
              <div className="dashboard-chart-card-header dashboard-chart-card-header--row">
                <div className="dashboard-chart-title-wrap">
                  <span className="dashboard-chart-icon dashboard-chart-icon--line">
                    <ScheduleOutlined />
                  </span>
                  <div>
                    <Text strong className="dashboard-chart-title">
                      Lấp đầy phòng học theo ngày
                    </Text>
                    <Text type="secondary" className="dashboard-chart-subtitle">
                      Thứ 2 – Thứ 7
                      {!useDemoLayout && metrics.physicalRoomTotal
                        ? ` · ${metrics.physicalRoomTotal} phòng vật lý`
                        : ''}
                    </Text>
                  </div>
                </div>
                <div className="dashboard-chart-badges">
                  <Tag color="blue">Phòng sử dụng</Tag>
                  <Tag color="cyan">Số ca</Tag>
                  <Tag color="orange">% lấp đầy</Tag>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={roomOccupancyData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="roomBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1677ff" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#1677ff" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="bookingBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#69b1ff" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#69b1ff" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip content={<RoomOccupancyTooltip />} />
                  <Legend iconType="circle" />
                  <Bar
                    yAxisId="left"
                    dataKey="utilizedRooms"
                    name="Phòng sử dụng"
                    fill="url(#roomBarGrad)"
                    radius={[6, 6, 0, 0]}
                    barSize={22}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="bookings"
                    name="Số ca đã xếp"
                    fill="url(#bookingBarGrad)"
                    radius={[6, 6, 0, 0]}
                    barSize={22}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="utilizationPct"
                    name="Tỷ lệ lấp đầy"
                    stroke={SCHEDULING_STATUS_COLORS.relaxed}
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#fff', stroke: SCHEDULING_STATUS_COLORS.relaxed, strokeWidth: 2 }}
                    activeDot={{ r: 7 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
        </div>
      </Spin>
    </div>
  )
}

export default Dashboard
