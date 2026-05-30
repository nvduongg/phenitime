import { useEffect, useMemo, useState } from 'react'
import { Form, Input, Select, Tag } from 'antd'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createOrganizationUnit,
  deleteOrganizationUnit,
  getOrganizationUnits,
  updateOrganizationUnit,
} from '../../services/api'

const UNIT_TYPE_OPTIONS = [
  { value: 'TRUONG', label: 'Trường' },
  { value: 'KHOA', label: 'Khoa' },
  { value: 'BO_MON', label: 'Bộ môn' },
  { value: 'PHONG', label: 'Phòng/Ban' },
]

const UNIT_TYPE_COLORS = {
  TRUONG: 'purple',
  KHOA: 'blue',
  BO_MON: 'cyan',
  PHONG: 'default',
}

function OrganizationUnits() {
  const [allUnits, setAllUnits] = useState([])

  const crud = useCrudPage({
    listFn: getOrganizationUnits,
    createFn: createOrganizationUnit,
    updateFn: updateOrganizationUnit,
    deleteFn: deleteOrganizationUnit,
    getId: (record) => record.unit_id,
    searchFields: ['unit_id', 'unit_name', 'unit_type', (record) => record.parent?.unit_name],
    transformPayload: (values, editingRecord) => {
      const payload = {
        unit_name: values.unit_name,
        unit_type: values.unit_type,
        parent_id: values.parent_id || null,
      }
      if (!editingRecord) {
        payload.unit_id = values.unit_id
      }
      return payload
    },
  })

  useEffect(() => {
    getOrganizationUnits()
      .then((result) => setAllUnits(result.data || []))
      .catch(() => {
        // Error handled by axios interceptor
      })
  }, [crud.data])

  const parentOptions = useMemo(
    () =>
      allUnits.map((unit) => ({
        value: unit.unit_id,
        label: `${unit.unit_name} (${unit.unit_id})`,
      })),
    [allUnits],
  )

  const columns = [
    {
      title: 'Mã đơn vị',
      dataIndex: 'unit_id',
      key: 'unit_id',
      width: 120,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Tên đơn vị',
      dataIndex: 'unit_name',
      key: 'unit_name',
      ellipsis: true,
    },
    {
      title: 'Loại',
      dataIndex: 'unit_type',
      key: 'unit_type',
      width: 120,
      render: (value) => <Tag color={UNIT_TYPE_COLORS[value] || 'default'}>{value}</Tag>,
    },
    {
      title: 'Đơn vị cha',
      key: 'parent_name',
      ellipsis: true,
      render: (_, record) => {
        if (!record.parent_id) return '—'
        const parent = allUnits.find((unit) => unit.unit_id === record.parent_id)
        return parent?.unit_name || record.parent_id
      },
    },
  ]

  return (
    <MasterDataCrudPage
      title="Đơn vị"
      subtitle="Quản lý cơ cấu tổ chức, khoa và bộ môn"
      rowKey="unit_id"
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
      modalTitleCreate="Thêm đơn vị mới"
      modalTitleEdit="Cập nhật đơn vị"
      form={crud.form}
      scrollX={900}
      formContent={(editingRecord) => (
        <>
          <Form.Item
            name="unit_id"
            label="Mã đơn vị"
            rules={[{ required: true, message: 'Vui lòng nhập mã đơn vị' }]}
          >
            <Input placeholder="VD: K_CNTT" disabled={Boolean(editingRecord)} />
          </Form.Item>
          <Form.Item
            name="unit_name"
            label="Tên đơn vị"
            rules={[{ required: true, message: 'Vui lòng nhập tên đơn vị' }]}
          >
            <Input placeholder="VD: Khoa Công nghệ thông tin" />
          </Form.Item>
          <Form.Item
            name="unit_type"
            label="Loại đơn vị"
            rules={[{ required: true, message: 'Vui lòng chọn loại đơn vị' }]}
          >
            <Select options={UNIT_TYPE_OPTIONS} placeholder="Chọn loại đơn vị" />
          </Form.Item>
          <Form.Item name="parent_id" label="Đơn vị cấp trên">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={parentOptions.filter(
                (option) => option.value !== editingRecord?.unit_id,
              )}
              placeholder="Chọn đơn vị cha (nếu có)"
            />
          </Form.Item>
        </>
      )}
    />
  )
}

export default OrganizationUnits
