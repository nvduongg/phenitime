import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  PlusOutlined,
  TableOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import PageHeader from '../../components/Common/PageHeader'
import TimetableGrid from '../../components/Timetable/TimetableGrid'
import UnscheduledDragPanel from '../../components/Timetable/UnscheduledDragPanel'
import TimetableDropConfirmModal from '../../components/Timetable/TimetableDropConfirmModal'
import { useAppContext } from '../../contexts/AppContext'
import { getTableScroll } from '../../config/table'
import { buildTimetableExportColumns } from '../../config/exportColumns'
import { prepareTimetablesForExport } from '../../utils/exportFormatters'
import {
  buildFilterOptions,
  filterGridEvents,
  buildTimetableRowFromCreate,
  loadSchedulerResult,
  mergeGridEventsWithPins,
  normalizeGridEvent,
  saveSchedulerResult,
} from '../../utils/timetableGrid'
import {
  buildManualTimetablePayload,
  getCompatibleRooms,
  removeUnscheduledEvent,
  validateDropPlacement,
} from '../../utils/timetableManualSchedule'
import {
  createTimetable,
  deleteTimetable,
  getCourseSections,
  getRooms,
  getTimetables,
  updateTimetable,
} from '../../services/api'
import {
  DAY_LABELS,
  DAY_TAG_COLORS,
  buildExportFilename,
  exportToExcel,
  formatDate,
  formatDayOfWeek,
  formatTimetableRoom,
} from '../../utils/formatters'

const DAY_OPTIONS = Object.entries(DAY_LABELS).map(([value, label]) => ({
  value: Number(value),
  label,
}))

function Timetables() {
  const { semesters, activeSemesterId } = useAppContext()
  const [timetables, setTimetables] = useState([])
  const [sections, setSections] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [semesterFilter, setSemesterFilter] = useState(undefined)
  const [roomFilter, setRoomFilter] = useState(null)
  const [dayFilter, setDayFilter] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [unscheduledClasses, setUnscheduledClasses] = useState([])
  const [gridCourseFilter, setGridCourseFilter] = useState(null)
  const [gridStudentGroupFilter, setGridStudentGroupFilter] = useState(null)
  const [gridLecturerFilter, setGridLecturerFilter] = useState(null)
  const [gridRoomFilter, setGridRoomFilter] = useState(null)
  const [dropModalOpen, setDropModalOpen] = useState(false)
  const [dropTarget, setDropTarget] = useState(null)
  const [dragItem, setDragItem] = useState(null)
  const [dropValidation, setDropValidation] = useState({ errors: [], warnings: [] })
  const [dropRoomOptions, setDropRoomOptions] = useState([])
  const [pinnedGridEvents, setPinnedGridEvents] = useState([])
  const [form] = Form.useForm()

  const effectiveSemesterFilter =
    semesterFilter !== undefined ? semesterFilter : activeSemesterId

  const sortTimetableRows = useCallback(
    (rows) =>
      [...rows].sort(
        (a, b) => a.day_of_week - b.day_of_week || a.start_period - b.start_period,
      ),
    [],
  )

  const fetchTimetables = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true)
      try {
        const result = await getTimetables()
        const fetched = result.data || []
        setTimetables((prev) => {
          const fetchedIds = new Set(fetched.map((row) => row.schedule_id))
          const pending = prev.filter(
            (row) => row.schedule_id && !fetchedIds.has(row.schedule_id),
          )
          return sortTimetableRows([...fetched, ...pending])
        })
      } catch {
        // Error handled by axios interceptor
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [sortTimetableRows],
  )

  useEffect(() => {
    fetchTimetables()
  }, [fetchTimetables])

  useEffect(() => {
    const stored = loadSchedulerResult()
    if (!stored?.unscheduled_classes?.length) {
      setUnscheduledClasses([])
      return
    }

    if (stored.semester_id) {
      setSemesterFilter(stored.semester_id)
    }

    const targetSemester = stored.semester_id || effectiveSemesterFilter
    if (targetSemester && effectiveSemesterFilter && targetSemester !== effectiveSemesterFilter) {
      return
    }

    setUnscheduledClasses(stored.unscheduled_classes)
    if (stored.unscheduled_classes.length > 0) {
      setViewMode((current) => (current === 'table' ? 'grid' : current))
    }
  }, [effectiveSemesterFilter])

  useEffect(() => {
    Promise.all([getCourseSections(), getRooms()])
      .then(([sectionsRes, roomsRes]) => {
        setSections(sectionsRes.data || [])
        setRooms(roomsRes.data || [])
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
  }, [])

  useEffect(() => {
    if (!modalOpen) return

    if (editingRecord) {
      form.setFieldsValue({
        section_id: editingRecord.section_id,
        room_id: editingRecord.room_id,
        day_of_week: editingRecord.day_of_week,
        start_period: editingRecord.start_period,
        period_count: editingRecord.period_count,
        start_date: editingRecord.start_date ? dayjs(editingRecord.start_date) : null,
        end_date: editingRecord.end_date ? dayjs(editingRecord.end_date) : null,
      })
    } else {
      form.resetFields()
    }
  }, [modalOpen, editingRecord, form])

  const sectionOptions = useMemo(
    () =>
      sections.map((section) => ({
        value: section.section_id,
        label: section.section_id,
      })),
    [sections],
  )

  const roomOptions = useMemo(
    () =>
      rooms.map((room) => ({
        value: room.room_id,
        label: `${room.room_name || room.room_id} (${room.room_id})`,
      })),
    [rooms],
  )

  const semesterOptions = useMemo(
    () =>
      semesters.map((semester) => ({
        value: semester.semester_id,
        label: `${semester.semester_name || semester.semester_id} (${semester.semester_id})`,
      })),
    [semesters],
  )

  const filterRoomOptions = useMemo(() => {
    const roomIds = [...new Set(timetables.map((item) => item.room_id).filter(Boolean))]
    return roomIds.map((room) => ({ value: room, label: room }))
  }, [timetables])

  const filterDayOptions = useMemo(() => {
    const days = [...new Set(timetables.map((item) => item.day_of_week))].sort()
    return days.map((day) => ({ value: day, label: formatDayOfWeek(day) }))
  }, [timetables])

  const filteredTimetables = useMemo(() => {
    return timetables.filter((item) => {
      const matchSemester = effectiveSemesterFilter
        ? item.section?.semester_id === effectiveSemesterFilter
        : true
      const matchRoom = roomFilter ? item.room_id === roomFilter : true
      const matchDay = dayFilter ? item.day_of_week === dayFilter : true
      return matchSemester && matchRoom && matchDay
    })
  }, [timetables, effectiveSemesterFilter, roomFilter, dayFilter])

  const semesterTimetables = useMemo(() => {
    return timetables.filter((item) =>
      effectiveSemesterFilter ? item.section?.semester_id === effectiveSemesterFilter : true,
    )
  }, [timetables, effectiveSemesterFilter])

  const gridBaseEvents = useMemo(
    () => semesterTimetables.map(normalizeGridEvent),
    [semesterTimetables],
  )

  const semesterSectionsForFilter = useMemo(
    () =>
      sections.filter((section) =>
        effectiveSemesterFilter
          ? section.semester_id === effectiveSemesterFilter
          : true,
      ),
    [sections, effectiveSemesterFilter],
  )

  const gridFilterOptions = useMemo(
    () => buildFilterOptions(gridBaseEvents, { extraSections: semesterSectionsForFilter }),
    [gridBaseEvents, semesterSectionsForFilter],
  )

  const filteredUnscheduledClasses = useMemo(() => {
    if (!gridCourseFilter) return unscheduledClasses
    return unscheduledClasses.filter((item) => {
      const section = sections.find((row) => row.section_id === item.section_id)
      const courseId = section?.course_id || section?.course?.course_id
      return courseId === gridCourseFilter
    })
  }, [unscheduledClasses, gridCourseFilter, sections])

  const filteredGridEvents = useMemo(() => {
    const filtered = filterGridEvents(gridBaseEvents, {
      courseId: gridCourseFilter,
      lecturerId: gridLecturerFilter,
      roomId: gridRoomFilter,
      studentGroupId: gridStudentGroupFilter,
    })
    return mergeGridEventsWithPins(filtered, pinnedGridEvents)
  }, [
    gridBaseEvents,
    gridCourseFilter,
    gridLecturerFilter,
    gridRoomFilter,
    gridStudentGroupFilter,
    pinnedGridEvents,
  ])

  useEffect(() => {
    if (!pinnedGridEvents.length) return
    const naturallyVisible = filterGridEvents(gridBaseEvents, {
      courseId: gridCourseFilter,
      lecturerId: gridLecturerFilter,
      roomId: gridRoomFilter,
      studentGroupId: gridStudentGroupFilter,
    })
    const visibleIds = new Set(naturallyVisible.map((event) => String(event.id)))
    setPinnedGridEvents((prev) =>
      prev.filter((event) => !visibleIds.has(String(event.id))),
    )
  }, [
    gridBaseEvents,
    gridCourseFilter,
    gridLecturerFilter,
    gridRoomFilter,
    gridStudentGroupFilter,
    pinnedGridEvents.length,
  ])

  const hasUnscheduledDrag = filteredUnscheduledClasses.length > 0

  const hasGridFilters =
    Boolean(gridCourseFilter)
    || Boolean(gridStudentGroupFilter)
    || Boolean(gridLecturerFilter)
    || Boolean(gridRoomFilter)

  const clearGridFilters = () => {
    setGridCourseFilter(null)
    setGridStudentGroupFilter(null)
    setGridLecturerFilter(null)
    setGridRoomFilter(null)
  }

  const semesterLookup = useMemo(
    () => new Map(semesters.map((semester) => [semester.semester_id, semester])),
    [semesters],
  )

  const semesterSections = useMemo(
    () => sections.filter((section) =>
      effectiveSemesterFilter
        ? section.semester_id === effectiveSemesterFilter
        : true),
    [sections, effectiveSemesterFilter],
  )

  const sectionLookup = useMemo(
    () => new Map(sections.map((section) => [section.section_id, section])),
    [sections],
  )

  const activeSemester = useMemo(
    () => semesterLookup.get(effectiveSemesterFilter) || null,
    [semesterLookup, effectiveSemesterFilter],
  )

  const handleDropOnCell = useCallback(({ dragItem: item, day, shiftKey, startPeriod }) => {
    const section = sectionLookup.get(item.section_id)
    if (!section) {
      message.error('Không tìm thấy lớp học phần trong học kỳ hiện tại')
      return
    }

    const compatible = getCompatibleRooms(rooms, section)
    if (!compatible.length) {
      message.error('Không có phòng phù hợp (loại phòng / sức chứa)')
      return
    }

    const periodCount = 3
    const enrichedRooms = compatible.map((room) => {
      const validation = validateDropPlacement({
        timetables: semesterTimetables,
        section,
        day,
        startPeriod,
        periodCount,
        roomId: room.room_id,
        eventId: item.event_id,
      })
      return {
        ...room,
        validation,
        hasError: validation.errors.length > 0,
      }
    })

    enrichedRooms.sort((a, b) => {
      if (a.hasError !== b.hasError) return a.hasError ? 1 : -1
      return Number(b.capacity) - Number(a.capacity)
    })

    const preferredFilteredRoom = gridRoomFilter
      ? enrichedRooms.find((room) => room.room_id === gridRoomFilter)
      : null

    const firstOk =
      preferredFilteredRoom && !preferredFilteredRoom.hasError
        ? preferredFilteredRoom
        : enrichedRooms.find((room) => !room.hasError)

    if (firstOk) {
      enrichedRooms.forEach((room) => {
        room.recommended = room.room_id === firstOk.room_id
      })
    }

    const baseValidation = validateDropPlacement({
      timetables: semesterTimetables,
      section,
      day,
      startPeriod,
      periodCount,
      roomId: firstOk?.room_id || enrichedRooms[0]?.room_id,
      eventId: item.event_id,
    })

    setDragItem(item)
    setDropTarget({ day, shiftKey, startPeriod })
    setDropRoomOptions(enrichedRooms)
    setDropValidation(baseValidation)
    setDropModalOpen(true)
  }, [rooms, sectionLookup, semesterTimetables, gridRoomFilter])

  const closeDropModal = () => {
    setDropModalOpen(false)
    setDropTarget(null)
    setDragItem(null)
    setDropRoomOptions([])
    setDropValidation({ errors: [], warnings: [] })
  }

  const handleConfirmDrop = async ({ room_id: roomId }) => {
    if (!dragItem || !dropTarget) return

    const section = sectionLookup.get(dragItem.section_id)
    const validation = validateDropPlacement({
      timetables: semesterTimetables,
      section,
      day: dropTarget.day,
      startPeriod: dropTarget.startPeriod,
      periodCount: 3,
      roomId,
      eventId: dragItem.event_id,
    })

    if (validation.errors.length > 0) {
      setDropValidation(validation)
      message.error(validation.errors[0])
      return
    }

    const payload = buildManualTimetablePayload({
      section,
      roomId,
      day: dropTarget.day,
      startPeriod: dropTarget.startPeriod,
      semester: activeSemester,
    })

    if (!payload.start_date || !payload.end_date) {
      message.error('Học kỳ chưa có ngày bắt đầu/kết thúc — cập nhật học kỳ trước')
      return
    }

    setSubmitting(true)
    try {
      const result = await createTimetable(payload)
      const created = result?.data
      const room = rooms.find((item) => item.room_id === roomId)

      if (created) {
        const row = buildTimetableRowFromCreate({ created, section, room })
        setTimetables((prev) => {
          const withoutDup = prev.filter((item) => item.schedule_id !== row.schedule_id)
          return sortTimetableRows([...withoutDup, row])
        })
        setPinnedGridEvents((prev) => {
          const gridEvent = normalizeGridEvent(row)
          return [...prev.filter((item) => String(item.id) !== String(gridEvent.id)), gridEvent]
        })
      }

      const nextUnscheduled = removeUnscheduledEvent(unscheduledClasses, dragItem.event_id)
      setUnscheduledClasses(nextUnscheduled)

      const stored = loadSchedulerResult()
      if (stored) {
        saveSchedulerResult({
          ...stored,
          unscheduled_classes: nextUnscheduled,
        })
      }

      message.success('Đã xếp buổi học vào thời khóa biểu')
      closeDropModal()
      fetchTimetables({ silent: true })
    } catch {
      // axios interceptor
    } finally {
      setSubmitting(false)
    }
  }

  const exportColumns = useMemo(
    () => buildTimetableExportColumns({ sectionLookup }),
    [sectionLookup],
  )

  const handleExport = () => {
    const exportRows = prepareTimetablesForExport(
      filteredTimetables,
      sectionLookup,
      { semesterSections, semesterLookup },
    )

    if (exportRows.length === 0) {
      message.warning('Không có dữ liệu để xuất')
      return
    }

    const filename = buildExportFilename('TKB', { semesterId: effectiveSemesterFilter })
    exportToExcel(
      exportRows,
      exportColumns,
      filename,
      { sheetName: 'Thoi khoa bieu' },
    )
    message.success('Xuất file Excel thành công')
  }

  const openCreate = () => {
    setEditingRecord(null)
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditingRecord(record)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRecord(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        section_id: values.section_id,
        room_id: values.room_id,
        day_of_week: values.day_of_week,
        start_period: values.start_period,
        period_count: values.period_count,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date?.format('YYYY-MM-DD'),
      }

      setSubmitting(true)
      if (editingRecord) {
        await updateTimetable(editingRecord.schedule_id, payload)
        message.success('Cập nhật thành công')
      } else {
        await createTimetable(payload)
        message.success('Thêm mới thành công')
      }
      closeModal()
      fetchTimetables()
    } catch (error) {
      if (error?.errorFields) return
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await deleteTimetable(record.schedule_id)
      message.success('Xóa thành công')
      fetchTimetables()
    } catch {
      // Error handled by axios interceptor
    }
  }

  const columns = [
    {
      title: 'Mã lớp HP',
      dataIndex: 'section_id',
      key: 'section_id',
      ellipsis: true,
      render: (value) => <span className="section-id-cell">{value}</span>,
    },
    {
      title: 'Phòng học',
      dataIndex: 'room_id',
      key: 'room_id',
      width: 140,
      render: (value, record) => {
        const label = formatTimetableRoom(value, record.section)
        const isVirtual = label === 'Hệ thống LMS' || label === 'Học trực tuyến'
        return isVirtual ? (
          <Tag color="geekblue">{label}</Tag>
        ) : value ? (
          <Tag color="geekblue">{value}</Tag>
        ) : (
          <Tag>Không có phòng</Tag>
        )
      },
    },
    {
      title: 'Thứ',
      dataIndex: 'day_of_week',
      key: 'day_of_week',
      width: 120,
      defaultSortOrder: 'ascend',
      sorter: (a, b) => a.day_of_week - b.day_of_week,
      render: (value) => (
        <Tag color={DAY_TAG_COLORS[value] || 'default'}>{formatDayOfWeek(value)}</Tag>
      ),
    },
    {
      title: 'Tiết bắt đầu',
      dataIndex: 'start_period',
      key: 'start_period',
      width: 120,
      sorter: (a, b) => a.start_period - b.start_period,
    },
    {
      title: 'Số tiết',
      dataIndex: 'period_count',
      key: 'period_count',
      width: 100,
    },
    {
      title: 'Ngày bắt đầu',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 140,
      render: formatDate,
    },
    {
      title: 'Ngày kết thúc',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 140,
      render: formatDate,
    },
    {
      title: 'Hành động',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Chỉnh sửa">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Xóa buổi học"
            description="Bạn có chắc chắn muốn xóa buổi học này?"
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Tooltip title="Xóa">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Spin spinning={loading}>
      <PageHeader
          title="Thời khóa biểu"
          subtitle="Quản lý lịch học sau khi xếp lịch AI"
          filters={
            <>
              <Select
                allowClear
                placeholder="Chọn học kỳ"
                style={{ minWidth: 240 }}
                options={semesterOptions}
                value={effectiveSemesterFilter}
                onChange={setSemesterFilter}
              />
              {viewMode === 'table' ? (
                <>
                  <Select
                    allowClear
                    placeholder="Lọc theo phòng"
                    style={{ minWidth: 180 }}
                    options={filterRoomOptions}
                    value={roomFilter}
                    onChange={setRoomFilter}
                  />
                  <Select
                    allowClear
                    placeholder="Lọc theo thứ"
                    style={{ minWidth: 160 }}
                    options={filterDayOptions}
                    value={dayFilter}
                    onChange={setDayFilter}
                  />
                </>
              ) : null}
              <Segmented
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: 'grid', icon: <AppstoreOutlined />, label: 'Lưới TKB' },
                  { value: 'table', icon: <TableOutlined />, label: 'Bảng dữ liệu' },
                ]}
              />
            </>
          }
          actions={
            <>
              <Button type="primary" size="middle" icon={<PlusOutlined />} onClick={openCreate}>
                Thêm mới
              </Button>
              <Button size="middle" icon={<ExportOutlined />} onClick={handleExport}>
                Xuất Excel
              </Button>
            </>
          }
        />

        {hasUnscheduledDrag ? (
          <Alert
            type="warning"
            showIcon
            className="timetable-unscheduled-alert"
            message={`Còn ${filteredUnscheduledClasses.length} buổi chưa xếp — kéo thả vào lưới TKB`}
            description="Chọn chế độ Lưới TKB: kéo từng buổi (Part1/Part2) bên trái và thả vào ô Thứ × Ca. Hệ thống gợi ý phòng PM/PC và kiểm tra HC6 (không trùng thứ với ca khác cùng lớp)."
          />
        ) : null}

        {viewMode === 'grid' ? (
          <div className={hasUnscheduledDrag ? 'timetable-grid-layout' : ''}>
            {hasUnscheduledDrag ? (
              <UnscheduledDragPanel
                items={filteredUnscheduledClasses}
                sectionLookup={sectionLookup}
              />
            ) : null}
            <div className="timetable-grid-layout__main">
            <div className="timetable-grid-toolbar">
              <Space wrap size="middle">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Lọc theo Học phần"
                  style={{ minWidth: 280 }}
                  options={gridFilterOptions.courseOptions}
                  value={gridCourseFilter}
                  onChange={setGridCourseFilter}
                />
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Lọc theo Nhóm SV/Khóa"
                  style={{ minWidth: 220 }}
                  options={gridFilterOptions.studentGroupOptions}
                  value={gridStudentGroupFilter}
                  onChange={setGridStudentGroupFilter}
                />
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Lọc theo Giảng viên"
                  style={{ minWidth: 240 }}
                  options={gridFilterOptions.lecturerOptions}
                  value={gridLecturerFilter}
                  onChange={setGridLecturerFilter}
                />
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Lọc theo Phòng học"
                  style={{ minWidth: 180 }}
                  options={gridFilterOptions.roomOptions}
                  value={gridRoomFilter}
                  onChange={setGridRoomFilter}
                />
                {hasGridFilters ? (
                  <Button icon={<UnorderedListOutlined />} onClick={clearGridFilters}>
                    Xóa bộ lọc
                  </Button>
                ) : null}
              </Space>
              <div className="timetable-grid-toolbar__meta">
                <Tag color="blue">{filteredGridEvents.length} buổi học</Tag>
                {effectiveSemesterFilter ? (
                  <Tag>Học kỳ: {effectiveSemesterFilter}</Tag>
                ) : null}
              </div>
            </div>
            <TimetableGrid
              events={filteredGridEvents}
              dropEnabled={hasUnscheduledDrag}
              onDropOnCell={handleDropOnCell}
            />
            </div>
          </div>
        ) : (
          <Table
            rowKey="schedule_id"
            columns={columns}
            dataSource={filteredTimetables}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              showTotal: (total) => `${total} buổi học`,
            }}
            scroll={getTableScroll(1100)}
            sticky
          />
        )}

      <TimetableDropConfirmModal
        open={dropModalOpen}
        dropTarget={dropTarget}
        dragItem={dragItem}
        section={dragItem ? sectionLookup.get(dragItem.section_id) : null}
        roomOptions={dropRoomOptions}
        validation={dropValidation}
        submitting={submitting}
        activeRoomFilter={gridRoomFilter}
        onCancel={closeDropModal}
        onConfirm={handleConfirmDrop}
      />

      <Modal
        title={editingRecord ? 'Cập nhật buổi học' : 'Thêm buổi học mới'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingRecord ? 'Cập nhật' : 'Thêm mới'}
        cancelText="Hủy"
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="section_id"
            label="Lớp học phần"
            rules={[{ required: true, message: 'Vui lòng chọn lớp học phần' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={sectionOptions}
              placeholder="Chọn lớp học phần"
            />
          </Form.Item>
          <Form.Item
            name="room_id"
            label="Phòng học"
            rules={[{ required: true, message: 'Vui lòng chọn phòng học' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={roomOptions}
              placeholder="Chọn phòng học"
            />
          </Form.Item>
          <Form.Item
            name="day_of_week"
            label="Thứ"
            rules={[{ required: true, message: 'Vui lòng chọn thứ' }]}
          >
            <Select options={DAY_OPTIONS} placeholder="Chọn thứ trong tuần" />
          </Form.Item>
          <Form.Item
            name="start_period"
            label="Tiết bắt đầu"
            rules={[{ required: true, message: 'Vui lòng nhập tiết bắt đầu' }]}
          >
            <InputNumber min={1} max={15} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="period_count"
            label="Số tiết"
            rules={[{ required: true, message: 'Vui lòng nhập số tiết' }]}
            initialValue={3}
          >
            <InputNumber min={1} max={6} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="start_date"
            label="Ngày bắt đầu"
            rules={[{ required: true, message: 'Vui lòng chọn ngày bắt đầu' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            name="end_date"
            label="Ngày kết thúc"
            rules={[{ required: true, message: 'Vui lòng chọn ngày kết thúc' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}

export default Timetables
