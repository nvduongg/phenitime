import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'
import PageHeader from '../../components/Common/PageHeader'
import { useAppContext } from '../../contexts/AppContext'
import { getTableScroll, TABLE_SCROLL_CLASS } from '../../config/table'
import {
  cancelAssignmentRequest,
  fulfillAssignmentRequest,
  getLecturers,
  listAssignmentRequests,
  rejectAssignmentRequest,
} from '../../services/api'

const STATUS_COLORS = {
  PENDING: 'processing',
  COMPLETED: 'success',
  CANCELLED: 'default',
  REJECTED: 'error',
}

const STATUS_LABELS = {
  PENDING: 'Chờ xử lý',
  COMPLETED: 'Đã phân công',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Từ chối',
}

export default function AssignmentRequests() {
  const { semesters, activeSemesterId } = useAppContext()
  const [box, setBox] = useState('incoming')
  const [semesterFilter, setSemesterFilter] = useState(undefined)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [lecturers, setLecturers] = useState([])
  const [fulfillOpen, setFulfillOpen] = useState(null)
  const [fulfillLecturerId, setFulfillLecturerId] = useState(undefined)
  const [fulfillNote, setFulfillNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const effectiveSemester =
    semesterFilter !== undefined ? semesterFilter : activeSemesterId

  const semesterOptions = useMemo(
    () =>
      semesters.map((s) => ({
        value: s.semester_id,
        label: s.semester_name || s.semester_id,
      })),
    [semesters],
  )

  const lecturerOptions = useMemo(
    () =>
      lecturers.map((l) => ({
        value: l.lecturer_id,
        label: `${l.lecturer_name} (${l.lecturer_id})`,
      })),
    [lecturers],
  )

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listAssignmentRequests({
        box,
        semester_id: effectiveSemester,
      })
      setRows(res.data || [])
    } finally {
      setLoading(false)
    }
  }, [box, effectiveSemester])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  useEffect(() => {
    getLecturers()
      .then((res) => setLecturers(res.data || []))
      .catch(() => {})
  }, [])

  const openFulfill = (record) => {
    setFulfillOpen(record)
    setFulfillLecturerId(record.section?.lecturer_id || undefined)
    setFulfillNote('')
  }

  const handleFulfill = async () => {
    if (!fulfillOpen || !fulfillLecturerId) {
      message.warning('Chọn giảng viên')
      return
    }
    setSubmitting(true)
    try {
      await fulfillAssignmentRequest(fulfillOpen.request_id, {
        lecturer_id: fulfillLecturerId,
        response_note: fulfillNote || undefined,
      })
      message.success('Đã phân công theo yêu cầu')
      setFulfillOpen(null)
      loadRows()
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = (record) => {
    Modal.confirm({
      title: 'Hủy yêu cầu phân công?',
      onOk: async () => {
        await cancelAssignmentRequest(record.request_id)
        message.success('Đã hủy yêu cầu')
        loadRows()
      },
    })
  }

  const handleReject = (record) => {
    let note = ''
    Modal.confirm({
      title: 'Từ chối yêu cầu?',
      content: (
        <Input.TextArea
          rows={3}
          placeholder="Lý do (tùy chọn)"
          onChange={(e) => {
            note = e.target.value
          }}
        />
      ),
      onOk: async () => {
        await rejectAssignmentRequest(record.request_id, { response_note: note })
        message.success('Đã từ chối yêu cầu')
        loadRows()
      },
    })
  }

  const incomingColumns = [
    {
      title: 'Lớp HP',
      dataIndex: ['section', 'section_id'],
      ellipsis: true,
      render: (v) => <strong>{v}</strong>,
    },
    {
      title: 'Học phần',
      key: 'course',
      ellipsis: true,
      render: (_, r) => r.section?.course?.course_name || r.section?.course_id,
    },
    {
      title: 'Đơn vị gửi',
      key: 'from',
      render: (_, r) => r.requester_unit?.unit_name || '—',
    },
    {
      title: 'Ghi chú',
      dataIndex: 'message',
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 200,
      render: (_, record) =>
        record.status === 'PENDING' ? (
          <Space size="small">
            <Button type="link" onClick={() => openFulfill(record)}>
              Phân công
            </Button>
            <Button type="link" danger onClick={() => handleReject(record)}>
              Từ chối
            </Button>
          </Space>
        ) : (
          record.section?.lecturer?.lecturer_name || '—'
        ),
    },
  ]

  const outgoingColumns = [
    {
      title: 'Lớp HP',
      dataIndex: ['section', 'section_id'],
      ellipsis: true,
    },
    {
      title: 'Học phần',
      key: 'course',
      ellipsis: true,
      render: (_, r) => r.section?.course?.course_name,
    },
    {
      title: 'Gửi tới',
      key: 'target',
      render: (_, r) => r.target_unit?.unit_name || '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_, record) =>
        record.status === 'PENDING' ? (
          <Button type="link" danger onClick={() => handleCancel(record)}>
            Hủy
          </Button>
        ) : (
          record.response_note || '—'
        ),
    },
  ]

  const pendingIncoming = rows.filter((r) => r.status === 'PENDING').length

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Yêu cầu phân công giảng dạy"
        description="Khi lớp học phần do đơn vị khác quản lý chuyên môn (không thuộc khoa/trường bạn), bạn gửi yêu cầu — đơn vị quản lý học phần sẽ phân công giảng viên của họ."
      />

      <PageHeader
        title="Yêu cầu phân công"
        subtitle={
          box === 'incoming'
            ? 'Các yêu cầu gửi tới đơn vị bạn (quản lý chuyên môn học phần)'
            : 'Các yêu cầu bạn đã gửi đi'
        }
        filters={
          <Select
            allowClear
            placeholder="Học kỳ"
            style={{ minWidth: 220 }}
            options={semesterOptions}
            value={effectiveSemester}
            onChange={setSemesterFilter}
          />
        }
      />

      <Tabs
        activeKey={box}
        onChange={setBox}
        items={[
          {
            key: 'incoming',
            label: `Cần xử lý${pendingIncoming ? ` (${pendingIncoming})` : ''}`,
          },
          { key: 'outgoing', label: 'Đã gửi' },
        ]}
      />

      <Table
        className={TABLE_SCROLL_CLASS}
        rowKey="request_id"
        loading={loading}
        columns={box === 'incoming' ? incomingColumns : outgoingColumns}
        dataSource={rows}
        pagination={{
          defaultPageSize: 50,
          pageSizeOptions: ['10', '25', '50', '100', '200'],
          showSizeChanger: true,
          showTotal: (total) => `${total} yêu cầu`,
        }}
        scroll={getTableScroll(1280)}
        sticky
      />

      <Modal
        title="Phân công theo yêu cầu"
        open={Boolean(fulfillOpen)}
        onCancel={() => setFulfillOpen(null)}
        onOk={handleFulfill}
        okText="Xác nhận phân công"
        confirmLoading={submitting}
        destroyOnHidden
      >
        {fulfillOpen ? (
          <>
            <p>
              <strong>{fulfillOpen.section?.section_id}</strong>
              <br />
              {fulfillOpen.section?.course?.course_name}
              <br />
              Từ: {fulfillOpen.requester_unit?.unit_name}
            </p>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn giảng viên (thuộc đơn vị bạn)"
              style={{ width: '100%', marginBottom: 12 }}
              options={lecturerOptions}
              value={fulfillLecturerId}
              onChange={setFulfillLecturerId}
            />
            <Input.TextArea
              rows={2}
              placeholder="Ghi chú phản hồi (tùy chọn)"
              value={fulfillNote}
              onChange={(e) => setFulfillNote(e.target.value)}
            />
          </>
        ) : null}
      </Modal>
    </div>
  )
}
