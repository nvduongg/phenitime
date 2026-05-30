import { Form, Input, InputNumber } from 'antd'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createCohort,
  deleteCohort,
  getCohorts,
  updateCohort,
} from '../../services/api'

function Cohorts() {
  const crud = useCrudPage({
    listFn: getCohorts,
    createFn: createCohort,
    updateFn: updateCohort,
    deleteFn: deleteCohort,
    getId: (record) => record.cohort_id,
    searchFields: ['cohort_id', 'training_type'],
    transformPayload: (values, editingRecord) => {
      const payload = {
        start_year: values.start_year,
        training_type: values.training_type || null,
      }
      if (!editingRecord) {
        payload.cohort_id = values.cohort_id
      }
      return payload
    },
  })

  const columns = [
    {
      title: 'Mã niên khóa',
      dataIndex: 'cohort_id',
      key: 'cohort_id',
      width: 140,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Năm nhập học',
      dataIndex: 'start_year',
      key: 'start_year',
      width: 130,
    },
    {
      title: 'Hệ đào tạo',
      dataIndex: 'training_type',
      key: 'training_type',
      ellipsis: true,
      render: (value) => value || '—',
    },
  ]

  return (
    <MasterDataCrudPage
      title="Niên khóa"
      subtitle="Quản lý niên khóa sinh viên và hệ đào tạo"
      rowKey="cohort_id"
      columns={columns}
      dataSource={crud.data}
      loading={crud.loading}
      submitting={crud.submitting}
      modalOpen={crud.modalOpen}
      editingRecord={crud.editingRecord}
      searchText={crud.searchText}
      onSearchChange={crud.setSearchText}
      onCreate={crud.openCreate}
      onEdit={crud.openEdit}
      onDelete={crud.handleDelete}
      onCloseModal={crud.closeModal}
      onSubmit={crud.handleSubmit}
      modalTitleCreate="Thêm niên khóa mới"
      modalTitleEdit="Cập nhật niên khóa"
      form={crud.form}
      formContent={(editingRecord) => (
        <>
          <Form.Item
            name="cohort_id"
            label="Mã niên khóa"
            rules={[{ required: true, message: 'Vui lòng nhập mã niên khóa' }]}
          >
            <Input placeholder="VD: K17" disabled={Boolean(editingRecord)} />
          </Form.Item>
          <Form.Item
            name="start_year"
            label="Năm nhập học"
            rules={[{ required: true, message: 'Vui lòng nhập năm nhập học' }]}
            extra="Năm nhập học (tháng 10) — VD: K17 nhập học 2023 thì Kỳ 1 Năm 1 là 2023, Kỳ 2 Năm 1 là 2024"
          >
            <InputNumber min={2000} max={2100} style={{ width: '100%' }} placeholder="VD: 2023" />
          </Form.Item>
          <Form.Item name="training_type" label="Hệ đào tạo">
            <Input placeholder="VD: Chính quy" />
          </Form.Item>
        </>
      )}
    />
  )
}

export default Cohorts
