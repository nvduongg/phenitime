import dayjs from 'dayjs'
import { useState } from 'react'
import { DatePicker, Form, Input, Switch, Tag, message } from 'antd'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { useAppContext } from '../../contexts/AppContext'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createSemester,
  deleteSemester,
  getSemesters,
  updateSemester,
} from '../../services/api'
import { formatDate } from '../../utils/formatters'

function Semesters() {
  const { refreshSemesters } = useAppContext()
  const [togglingId, setTogglingId] = useState(null)

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
        end_date: values.end_date?.format('YYYY-MM-DD'),
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
      end_date: record.end_date ? dayjs(record.end_date) : null,
    })
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
        </>
      )}
    />
  )
}

export default Semesters
