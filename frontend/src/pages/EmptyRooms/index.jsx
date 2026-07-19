import { useState, useMemo, useEffect } from 'react'
import { Card, Table, Tag, DatePicker, Button, Space, Spin, Select } from 'antd'
import { LeftOutlined, RightOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(isoWeek)

import PageHeader from '../../components/Common/PageHeader'
import { useAppContext } from '../../contexts/AppContext'
import { getTimetables, getRooms } from '../../services/api'
import { TABLE_SCROLL_CLASS } from '../../config/table'

const DAYS = [2, 3, 4, 5, 6, 7, 8]
const DAY_LABELS = {
  2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN'
}

function EmptyRooms() {
  const { semesters, activeSemesterId } = useAppContext()
  const [currentWeekStart, setCurrentWeekStart] = useState(() => dayjs().startOf('isoWeek'))
  const [semesterFilter, setSemesterFilter] = useState(activeSemesterId)
  const [timetables, setTimetables] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(false)

  const semesterOptions = useMemo(
    () => semesters.map((s) => ({ value: s.semester_id, label: s.semester_name || s.semester_id })),
    [semesters],
  )

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [ttRes, roomsRes] = await Promise.all([
          getTimetables(),
          getRooms()
        ])
        setTimetables(ttRes.data || [])
        setRooms(roomsRes.data || [])
      } catch (e) {
        // error handled by interceptor
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const semesterTimetables = useMemo(() => {
    return timetables.filter((item) => {
      const matchSemester = semesterFilter
        ? item.section?.semester_id === semesterFilter
        : true
      return matchSemester
    })
  }, [timetables, semesterFilter])

  const timeFilteredTimetables = useMemo(() => {
    return semesterTimetables.filter((item) => {
      let matchDate = true
      const startOfWeek = currentWeekStart.format('YYYY-MM-DD')
      const endOfWeek = currentWeekStart.endOf('isoWeek').format('YYYY-MM-DD')
      
      if (item.start_date && item.end_date) {
          matchDate = !(item.end_date < startOfWeek || item.start_date > endOfWeek)
      }
      return matchDate
    })
  }, [semesterTimetables, currentWeekStart])

  const busyLookup = useMemo(() => {
    const lookup = {}
    const safeRooms = rooms || []
    safeRooms.forEach(r => {
      lookup[r.room_id] = {}
      DAYS.forEach(d => {
        lookup[r.room_id][d] = Array(12).fill(false)
      })
    })

    const safeTimetables = timeFilteredTimetables || []
    safeTimetables.forEach(t => {
      if (!t.room_id || !lookup[t.room_id]) return
      const d = t.day_of_week
      if (!lookup[t.room_id][d]) return

      const tStart = t.start_period
      const tEnd = t.start_period + t.period_count - 1
      
      for (let p = tStart; p <= tEnd; p++) {
        if (p >= 1 && p <= 12) {
          lookup[t.room_id][d][p - 1] = true
        }
      }
    })
    return lookup
  }, [rooms, timeFilteredTimetables])

  const renderStatus = (isBusy) => {
    return isBusy ? (
      <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: '16px' }} title="Có tiết" />
    ) : (
      <CheckCircleFilled style={{ color: '#52c41a', fontSize: '16px' }} title="Trống" />
    )
  }

  const columns = [
    {
      title: 'Phòng',
      dataIndex: 'room_id',
      key: 'room_id',
      fixed: 'left',
      width: 100,
    },
    {
      title: 'Sức chứa',
      dataIndex: 'capacity',
      key: 'capacity',
      width: 90,
      align: 'center',
    },
    {
      title: 'Loại',
      dataIndex: 'room_type',
      key: 'room_type',
      width: 100,
      render: (val) => <Tag>{val}</Tag>
    },
  ]

  DAYS.forEach(d => {
    columns.push({
      title: DAY_LABELS[d],
      children: Array.from({ length: 12 }, (_, i) => ({
        title: `${i + 1}`,
        key: `${d}_${i}`,
        align: 'center',
        width: 40,
        render: (_, record) => renderStatus(busyLookup[record.room_id]?.[d]?.[i])
      }))
    })
  })

  return (
    <Spin spinning={loading}>
      <PageHeader
        title="Thống kê phòng trống"
        subtitle="Xem trạng thái tất cả các phòng theo ca trong tuần."
        filters={
          <>
            <Select
              allowClear
              placeholder="Chọn học kỳ"
              style={{ minWidth: 220 }}
              options={semesterOptions}
              value={semesterFilter}
              onChange={setSemesterFilter}
            />
            <Space.Compact>
              <Button icon={<LeftOutlined />} onClick={() => setCurrentWeekStart(prev => prev.subtract(1, 'week'))} />
              <DatePicker 
                picker="week" 
                format="Tuần wo - YYYY"
                allowClear={false}
                value={currentWeekStart} 
                onChange={(date) => date && setCurrentWeekStart(date.startOf('isoWeek'))}
                style={{ width: 180, textAlign: 'center' }}
              />
              <Button icon={<RightOutlined />} onClick={() => setCurrentWeekStart(prev => prev.add(1, 'week'))} />
            </Space.Compact>
          </>
        }
      />
      <Card bordered={false} bodyStyle={{ padding: 0 }}>
        <Table
          className={TABLE_SCROLL_CLASS}
          dataSource={rooms || []}
          columns={columns}
          rowKey="room_id"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content', y: 'calc(100vh - 280px)' }}
          bordered
        />
      </Card>
    </Spin>
  )
}

export default EmptyRooms
