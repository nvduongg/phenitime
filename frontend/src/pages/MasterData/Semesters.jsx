import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { DatePicker, Form, Input, Switch, Tag, Button, Typography, message } from 'antd'
import { CalendarOutlined } from '@ant-design/icons'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import SemesterWavesModal from './SemesterWavesModal'
import { useAppContext } from '../../contexts/AppContext'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createSemester,
  deleteSemester,
  getSemesters,
  getSchedulingSettings,
  updateSemester,
} from '../../services/api'
import { formatDate } from '../../utils/formatters'
import {
  DEFAULT_TEACHING_WEEKS,
  formatSemesterEndPreview,
} from '../../utils/semesterDates'

function Semesters() {
  const { refreshSemesters } = useAppContext()
  const [togglingId, setTogglingId] = useState(null)
  const [wavesModalOpen, setWavesModalOpen] = useState(false)
  const [wavesSemester, setWavesSemester] = useState(null)
  const [teachingWeeks, setTeachingWeeks] = useState(DEFAULT_TEACHING_WEEKS)

  useEffect(() => {
    getSchedulingSettings()
      .then((result) => {
        const weeks = Number(result.data?.max_teaching_weeks)
        if (weeks > 0) setTeachingWeeks(weeks)
      })
      .catch(() => {})
  }, [])

  const crud = useCrudPage({
    listFn: getSemesters,
    createFn: createSemester,
    updateFn: updateSemester,
    deleteFn: deleteSemester,
    getId: (record) => record.semester_id,
    searchFields: ['semester_id', 'semester_name', 'academic_year'],
    transformPayload: (values, editingRecord) => {
      const payload = {
        semester_name: values.semester_name,
        academic_year: values.academic_year,
        start_date: values.start_date?.format('YYYY-MM-DD'),
      }

      if (!editingRecord) {
        payload.semester_id = values.semester_id
      }

      return payload
    },
  })

  const openEdit = (record) => {
    crud.openEdit({
      ...record,
      start_date: record.start_date ? dayjs(record.start_date) : null,
    })
  }

  const closeWavesModal = (saved) => {
    setWavesModalOpen(false)
    setWavesSemester(null)
    if (saved) {
      crud.fetchData()
      refreshSemesters()
    }
  }

  const handleToggleActive = async (record, checked) => {
    setTogglingId(record.semester_id)
    try {
      await updateSemester(record.semester_id, { is_active: checked })
      message.success(checked ? 'Đã kích hoạt học kỳ' : 'Đã tắt trạng thái học kỳ hiện hành')
      await Promise.all([crud.fetchData(), refreshSemesters()])
    } catch {
      // Error handled by axios interceptor
    } finally {
      setTogglingId(null)
    }
  }

  const openWavesModal = (record) => {
    setWavesSemester(record)
    setWavesModalOpen(true)
  }

  const columns = [
    {
      title: 'Mã học kỳ',
      dataIndex: 'semester_id',
      key: 'semester_id',
      ellipsis: true,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Tên học kỳ',
      dataIndex: 'semester_name',
      key: 'semester_name',
      ellipsis: true,
    },
    {
      title: 'Niên khóa',
      dataIndex: 'academic_year',
      key: 'academic_year',
      width: 120,
    },
    {
      title: 'Ngày bắt đầu',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 130,
      render: formatDate,
    },
    {
      title: 'Ngày kết thúc',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 130,
      render: formatDate,
    },
    {
      title: 'Trạng thái',
      key: 'is_active',
      width: 150,
      render: (_, record) => (
        <Switch
          checked={Boolean(record.is_active)}
          checkedChildren="Hiện hành"
          unCheckedChildren="Không HH"
          loading={togglingId === record.semester_id}
          onChange={(checked) => handleToggleActive(record, checked)}
        />
      ),
    },
    {
      title: 'Ghi chú',
      key: 'status_tag',
      width: 150,
      render: (_, record) =>
        record.is_active ? <Tag color="green">Học kỳ hiện hành</Tag> : null,
    },
  ]

  return (
    <>
      <MasterDataCrudPage
        title="Học kỳ"
        subtitle="Quản lý danh sách học kỳ và niên khóa"
        rowKey="semester_id"
        columns={columns}
        dataSource={crud.data}
        loading={crud.loading}
        submitting={crud.submitting}
        modalOpen={crud.modalOpen}
        editingRecord={crud.editingRecord}
        searchText={crud.searchText}
        onSearchChange={crud.setSearchText}
        onCreate={crud.openCreate}
        onEdit={openEdit}
        onDelete={crud.handleDelete}
        onCloseModal={crud.closeModal}
        onSubmit={crud.handleSubmit}
        modalTitleCreate="Thêm học kỳ mới"
        modalTitleEdit="Cập nhật học kỳ"
        form={crud.form}
        scrollX={1100}
        actionColumnWidth={160}
        renderRowActions={(record) => (
          <Button
            type="text"
            size="middle"
            icon={<CalendarOutlined />}
            onClick={() => openWavesModal(record)}
            title="Cấu hình đợt xếp lịch"
          />
        )}
        formContent={(editingRecord) => (
        <>
          <Form.Item
            name="semester_id"
            label="Mã học kỳ"
            rules={[{ required: true, message: 'Vui lòng nhập mã học kỳ' }]}
          >
            <Input placeholder="VD: 2025_2026_3_1" disabled={Boolean(editingRecord)} />
          </Form.Item>
          <Form.Item
            name="semester_name"
            label="Tên học kỳ"
            rules={[{ required: true, message: 'Vui lòng nhập tên học kỳ' }]}
          >
            <Input placeholder="VD: Học kỳ 3 năm 2025-2026" />
          </Form.Item>
          <Form.Item
            name="academic_year"
            label="Niên khóa"
            rules={[{ required: true, message: 'Vui lòng nhập niên khóa' }]}
          >
            <Input placeholder="VD: 2025-2026" />
          </Form.Item>
          <Form.Item
            name="start_date"
            label="Ngày bắt đầu (Tuần 1 HK)"
            rules={[{ required: true, message: 'Vui lòng chọn ngày bắt đầu' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const startDate = crud.form.getFieldValue('start_date')
              const preview = formatSemesterEndPreview(startDate, { teachingWeeks })
              return (
                <Typography.Paragraph type="secondary" style={{ marginTop: -8, marginBottom: 16 }}>
                  Ngày kết thúc (tự tính, {teachingWeeks} tuần dạy / đợt 1): <strong>{preview}</strong>
                  . Sau khi cấu hình đợt (VD: K19 tuần 11), ngày KT sẽ được kéo dài tự động.
                </Typography.Paragraph>
              )
            }}
          </Form.Item>
        </>
      )}
      />
      <SemesterWavesModal
        open={wavesModalOpen}
        semester={wavesSemester}
        onClose={closeWavesModal}
      />
    </>
  )
}

export default Semesters
