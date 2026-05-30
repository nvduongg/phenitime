import { useEffect, useState } from 'react'
import { Form, Input, Select } from 'antd'
import ExcelImportModal from '../../components/Common/ExcelImportModal'
import ImportToolbarActions from '../../components/Common/ImportToolbarActions'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { getImportTemplate } from '../../config/importTemplates'
import { filterFacultyUnits } from '../../constants/unitTypes'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createMajor,
  deleteMajor,
  getMajors,
  getOrganizationUnits,
  updateMajor,
} from '../../services/api'

function Majors() {
  const [importOpen, setImportOpen] = useState(false)
  const [unitOptions, setUnitOptions] = useState([])
  const importTemplate = getImportTemplate('majors')

  const crud = useCrudPage({
    listFn: getMajors,
    createFn: createMajor,
    updateFn: updateMajor,
    deleteFn: deleteMajor,
    getId: (record) => record.major_id,
    searchFields: [
      'major_id',
      'major_code',
      'major_name',
      (record) => record.unit?.unit_name,
    ],
    transformPayload: (values) => ({
      major_code: values.major_code?.trim(),
      major_name: values.major_name,
      unit_id: values.unit_id,
    }),
  })

  useEffect(() => {
    getOrganizationUnits()
      .then((result) => {
        setUnitOptions(
          filterFacultyUnits(result.data || []).map((unit) => ({
            value: unit.unit_id,
            label: unit.unit_name,
          })),
        )
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
  }, [])

  const columns = [
    {
      title: 'Mã ngành',
      dataIndex: 'major_code',
      key: 'major_code',
      width: 120,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Mã nội bộ',
      dataIndex: 'major_id',
      key: 'major_id',
      width: 180,
      render: (value, record) =>
        record.major_code === value ? '—' : <span style={{ color: '#666' }}>{value}</span>,
    },
    {
      title: 'Tên ngành',
      dataIndex: 'major_name',
      key: 'major_name',
      ellipsis: true,
    },
    {
      title: 'Khoa quản lý',
      key: 'unit_name',
      ellipsis: true,
      render: (_, record) => record.unit?.unit_name || '—',
    },
  ]

  return (
    <>
      <MasterDataCrudPage
        title="Ngành đào tạo"
        subtitle="Nhập mã ngành + tên — mã nội bộ tự sinh để phân biệt các CTĐT cùng mã quốc gia"
        rowKey="major_id"
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
        modalTitleCreate="Thêm ngành đào tạo"
        modalTitleEdit="Cập nhật ngành đào tạo"
        form={crud.form}
        scrollX={900}
        extraActions={
          <ImportToolbarActions onImportClick={() => setImportOpen(true)} />
        }
        formContent={(editingRecord) => (
        <>
          <Form.Item
            name="major_code"
            label="Mã ngành"
            rules={[{ required: true, message: 'Vui lòng nhập mã ngành' }]}
            extra="Mã ngành quốc gia (VD: 7480201) — nhiều CTĐT có thể dùng chung"
          >
            <Input placeholder="VD: 7480201" />
          </Form.Item>
          {editingRecord ? (
            <Form.Item label="Mã nội bộ">
              <Input value={editingRecord.major_id} disabled />
            </Form.Item>
          ) : null}
          <Form.Item
            name="major_name"
            label="Tên ngành"
            rules={[{ required: true, message: 'Vui lòng nhập tên ngành' }]}
            extra="Gợi ý ghi rõ hệ đào tạo trong tên — VD: CNTT (Chính quy), CNTT (Liên thông)"
          >
            <Input placeholder="VD: Công nghệ thông tin (Chính quy)" />
          </Form.Item>
          <Form.Item
            name="unit_id"
            label="Khoa quản lý"
            rules={[{ required: true, message: 'Vui lòng chọn khoa quản lý' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={unitOptions}
              placeholder="Chọn khoa quản lý ngành"
            />
          </Form.Item>
        </>
      )}
      />

      <ExcelImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={crud.fetchData}
        title="Nhập ngành đào tạo từ Excel"
        uploadUrl="/imports/majors"
        templateUrl={importTemplate?.url}
        templateFileName={importTemplate?.fileName}
      />
    </>
  )
}

export default Majors
