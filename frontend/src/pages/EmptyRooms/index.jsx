import { useState, useMemo, useEffect } from 'react'
import { Card, DatePicker, Button, Space, Spin, Select, Tag, Tooltip, Segmented, Input } from 'antd'
import { LeftOutlined, RightOutlined, UserOutlined, HomeOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(isoWeek)

import PageHeader from '../../components/Common/PageHeader'
import { useAppContext } from '../../contexts/AppContext'
import { getTimetables, getRooms, getLecturers } from '../../services/api'

const DAYS = [2, 3, 4, 5, 6, 7, 8]
const DAY_LABELS = {
  2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN'
}
const PERIOD_LABELS = Array.from({ length: 12 }, (_, i) => `Tiết ${i + 1}`)

/* ──────────────────── Mini horizontal bar chart ──────────────────── */
function PeriodBar({ daySlots }) {
  // daySlots: boolean[12], true = bận
  return (
    <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
      {daySlots.map((busy, i) => (
        <Tooltip
          key={i}
          title={`${PERIOD_LABELS[i]} — ${busy ? 'Có tiết' : 'Trống'}`}
          placement="top"
          mouseEnterDelay={0}
        >
          <div
            style={{
              flex: 1,
              background: busy
                ? 'linear-gradient(135deg,#ff6b6b,#ee5a24)'
                : 'linear-gradient(135deg,#55efc4,#00b894)',
              borderRadius: 2,
              cursor: 'default',
              transition: 'opacity .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          />
        </Tooltip>
      ))}
    </div>
  )
}

/* ──────────────────── Legend chip ──────────────────── */
function Legend() {
  return (
    <Space size={12} style={{ fontSize: 12, color: '#64748b' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          display: 'inline-block', width: 28, height: 10, borderRadius: 3,
          background: 'linear-gradient(135deg,#55efc4,#00b894)'
        }} />
        Trống
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          display: 'inline-block', width: 28, height: 10, borderRadius: 3,
          background: 'linear-gradient(135deg,#ff6b6b,#ee5a24)'
        }} />
        Có tiết
      </span>
      <span style={{ color: '#94a3b8' }}>| Hover để xem chi tiết từng tiết</span>
    </Space>
  )
}

/* ──────────────────── Free-slots summary badge ──────────────────── */
function FreeBadge({ slots }) {
  const free = slots.filter(v => !v).length
  const total = slots.length
  const pct = Math.round((free / total) * 100)
  const color = pct >= 70 ? '#00b894' : pct >= 40 ? '#f39c12' : '#ee5a24'
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color,
      background: color + '18',
      borderRadius: 20,
      padding: '1px 6px',
      minWidth: 36,
      display: 'inline-block',
      textAlign: 'center'
    }}>
      {free}/{total}
    </span>
  )
}

/* ──────────────────── Main page ──────────────────── */
function EmptyRooms() {
  const { semesters, activeSemesterId } = useAppContext()
  const [currentWeekStart, setCurrentWeekStart] = useState(() => dayjs().startOf('isoWeek'))
  const [semesterFilter, setSemesterFilter] = useState(activeSemesterId)
  const [viewMode, setViewMode] = useState('rooms') // 'rooms' | 'lecturers'
  const [searchText, setSearchText] = useState('')
  const [timetables, setTimetables] = useState([])
  const [rooms, setRooms] = useState([])
  const [lecturers, setLecturers] = useState([])
  const [loading, setLoading] = useState(false)

  const semesterOptions = useMemo(
    () => semesters.map((s) => ({ value: s.semester_id, label: s.semester_name || s.semester_id })),
    [semesters],
  )

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [ttRes, roomsRes, lecRes] = await Promise.all([
          getTimetables(),
          getRooms(),
          getLecturers(),
        ])
        setTimetables(ttRes.data || [])
        setRooms(roomsRes.data || [])
        setLecturers(lecRes.data || [])
      } catch (e) {
        // error handled by interceptor
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const semesterTimetables = useMemo(() => {
    return timetables.filter((item) =>
      semesterFilter ? item.section?.semester_id === semesterFilter : true,
    )
  }, [timetables, semesterFilter])

  const timeFilteredTimetables = useMemo(() => {
    return semesterTimetables.filter((item) => {
      const startOfWeek = currentWeekStart.format('YYYY-MM-DD')
      const endOfWeek = currentWeekStart.endOf('isoWeek').format('YYYY-MM-DD')
      if (item.start_date && item.end_date) {
        return !(item.end_date < startOfWeek || item.start_date > endOfWeek)
      }
      return true
    })
  }, [semesterTimetables, currentWeekStart])

  // busyLookupRoom[room_id][day] = boolean[12]
  const busyLookupRoom = useMemo(() => {
    const lookup = {}
    ;(rooms || []).forEach(r => {
      lookup[r.room_id] = {}
      DAYS.forEach(d => { lookup[r.room_id][d] = Array(12).fill(false) })
    })
    ;(timeFilteredTimetables || []).forEach(t => {
      if (!t.room_id || !lookup[t.room_id]) return
      const d = t.day_of_week
      if (!lookup[t.room_id][d]) return
      const tEnd = t.start_period + t.period_count - 1
      for (let p = t.start_period; p <= tEnd; p++) {
        if (p >= 1 && p <= 12) lookup[t.room_id][d][p - 1] = true
      }
    })
    return lookup
  }, [rooms, timeFilteredTimetables])

  // busyLookupLecturer[lecturer_id][day] = boolean[12]
  const busyLookupLecturer = useMemo(() => {
    const lookup = {}
    ;(lecturers || []).forEach(l => {
      lookup[l.lecturer_id] = {}
      DAYS.forEach(d => { lookup[l.lecturer_id][d] = Array(12).fill(false) })
    })
    ;(timeFilteredTimetables || []).forEach(t => {
      const lecturerId = t.section?.lecturer_id
      if (!lecturerId || !lookup[lecturerId]) return
      const d = t.day_of_week
      if (!lookup[lecturerId][d]) return
      const tEnd = t.start_period + t.period_count - 1
      for (let p = t.start_period; p <= tEnd; p++) {
        if (p >= 1 && p <= 12) lookup[lecturerId][d][p - 1] = true
      }
    })
    return lookup
  }, [lecturers, timeFilteredTimetables])

  const filteredRooms = useMemo(() => {
    if (!searchText) return rooms || []
    const kw = searchText.trim().toLowerCase()
    return (rooms || []).filter(r =>
      String(r.room_id || '').toLowerCase().includes(kw) ||
      String(r.room_type || '').toLowerCase().includes(kw)
    )
  }, [rooms, searchText])

  const filteredLecturers = useMemo(() => {
    if (!searchText) return lecturers || []
    const kw = searchText.trim().toLowerCase()
    return (lecturers || []).filter(l =>
      String(l.lecturer_id || '').toLowerCase().includes(kw) ||
      String(l.lecturer_name || '').toLowerCase().includes(kw) ||
      String(l.unit?.unit_name || '').toLowerCase().includes(kw)
    )
  }, [lecturers, searchText])

  return (
    <Spin spinning={loading}>
      <PageHeader
        title={viewMode === 'rooms' ? 'Thống kê phòng trống' : 'Thống kê giảng viên rảnh/bận'}
        subtitle={viewMode === 'rooms' ? 'Xem trạng thái tất cả các phòng theo ca trong tuần.' : 'Xem lịch giảng dạy và thời gian rảnh của giảng viên trong tuần.'}
        filters={
          <>
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[
                { label: 'Phòng học', value: 'rooms', icon: <HomeOutlined /> },
                { label: 'Giảng viên', value: 'lecturers', icon: <UserOutlined /> },
              ]}
            />
            <Input
              placeholder={viewMode === 'rooms' ? 'Tìm phòng...' : 'Tìm giảng viên...'}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              style={{ width: 180 }}
              allowClear
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <Select
              allowClear
              placeholder="Chọn học kỳ"
              style={{ minWidth: 200 }}
              options={semesterOptions}
              value={semesterFilter}
              onChange={setSemesterFilter}
            />
            <Space.Compact>
              <Button
                icon={<LeftOutlined />}
                onClick={() => setCurrentWeekStart(prev => prev.subtract(1, 'week'))}
              />
              <DatePicker
                picker="week"
                format="Tuần wo - YYYY"
                allowClear={false}
                value={currentWeekStart}
                onChange={date => date && setCurrentWeekStart(date.startOf('isoWeek'))}
                style={{ width: 160, textAlign: 'center' }}
              />
              <Button
                icon={<RightOutlined />}
                onClick={() => setCurrentWeekStart(prev => prev.add(1, 'week'))}
              />
            </Space.Compact>
            <Legend />
          </>
        }
      />

      {/* Grid layout: 3 columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(560px, 1fr))',
          gap: 12,
          padding: '4px 0 16px',
        }}
      >
        {viewMode === 'rooms' ? (
          filteredRooms.map(room => {
            const roomSlots = busyLookupRoom[room.room_id] || {}
            const allSlots = DAYS.flatMap(d => roomSlots[d] || Array(12).fill(false))
            const totalFree = allSlots.filter(v => !v).length
            const totalSlots = allSlots.length

            return (
              <Card
                key={room.room_id}
                size="small"
                style={{ borderRadius: 10 }}
                bodyStyle={{ padding: '10px 14px' }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                    {room.room_id}
                  </span>
                  {room.room_type && (
                    <Tag style={{ margin: 0, fontSize: 11 }}>{room.room_type}</Tag>
                  )}
                  {room.capacity && (
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>
                      {room.capacity} chỗ
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>
                    Trống tuần:{' '}
                    <strong style={{ color: totalFree / totalSlots >= 0.5 ? '#00b894' : '#ee5a24' }}>
                      {totalFree}/{totalSlots}
                    </strong>
                  </span>
                </div>

                {/* Per-day bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {DAYS.map(d => {
                    const slots = roomSlots[d] || Array(12).fill(false)
                    return (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 26, fontSize: 11, fontWeight: 600,
                          color: '#475569', flexShrink: 0, textAlign: 'right'
                        }}>
                          {DAY_LABELS[d]}
                        </span>
                        <div style={{ flex: 1 }}>
                          <PeriodBar daySlots={slots} />
                        </div>
                        <FreeBadge slots={slots} />
                      </div>
                    )
                  })}
                </div>

                {/* Period ruler */}
                <div style={{
                  display: 'flex', marginTop: 4, paddingLeft: 34, paddingRight: 44,
                  fontSize: 10, color: '#cbd5e1', justifyContent: 'space-between'
                }}>
                  {[1, 3, 5, 7, 9, 11].map(p => (
                    <span key={p}>T{p}</span>
                  ))}
                  <span>T12</span>
                </div>
              </Card>
            )
          })
        ) : (
          filteredLecturers.map(lecturer => {
            const lecSlots = busyLookupLecturer[lecturer.lecturer_id] || {}
            const allSlots = DAYS.flatMap(d => lecSlots[d] || Array(12).fill(false))
            const totalFree = allSlots.filter(v => !v).length
            const totalBusy = allSlots.filter(v => v).length
            const totalSlots = allSlots.length

            return (
              <Card
                key={lecturer.lecturer_id}
                size="small"
                style={{ borderRadius: 10 }}
                bodyStyle={{ padding: '10px 14px' }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                    {lecturer.lecturer_name}
                  </span>
                  <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{lecturer.lecturer_id}</Tag>
                  {lecturer.unit?.unit_name && (
                    <Tag style={{ margin: 0, fontSize: 11 }}>{lecturer.unit.unit_name}</Tag>
                  )}
                  {lecturer.max_quota && (
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>
                      Tải max: {lecturer.max_quota} tiết
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>
                    Trống tuần:{' '}
                    <strong style={{ color: totalFree / totalSlots >= 0.5 ? '#00b894' : '#ee5a24' }}>
                      {totalFree}/{totalSlots}
                    </strong>
                    <span style={{ color: '#94a3b8', marginLeft: 4 }}>(Dạy {totalBusy} tiết)</span>
                  </span>
                </div>

                {/* Per-day bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {DAYS.map(d => {
                    const slots = lecSlots[d] || Array(12).fill(false)
                    return (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 26, fontSize: 11, fontWeight: 600,
                          color: '#475569', flexShrink: 0, textAlign: 'right'
                        }}>
                          {DAY_LABELS[d]}
                        </span>
                        <div style={{ flex: 1 }}>
                          <PeriodBar daySlots={slots} />
                        </div>
                        <FreeBadge slots={slots} />
                      </div>
                    )
                  })}
                </div>

                {/* Period ruler */}
                <div style={{
                  display: 'flex', marginTop: 4, paddingLeft: 34, paddingRight: 44,
                  fontSize: 10, color: '#cbd5e1', justifyContent: 'space-between'
                }}>
                  {[1, 3, 5, 7, 9, 11].map(p => (
                    <span key={p}>T{p}</span>
                  ))}
                  <span>T12</span>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </Spin>
  )
}

export default EmptyRooms
