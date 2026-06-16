import { useEffect, useMemo, useState } from 'react'
import { Form, Input, InputNumber, Select, Tag, Tooltip } from 'antd'
import ExcelImportModal from '../../components/Common/ExcelImportModal'
import ImportToolbarActions from '../../components/Common/ImportToolbarActions'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { getImportTemplate } from '../../config/importTemplates'
import { filterFacultyUnits } from '../../constants/unitTypes'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createLecturer,
  deleteLecturer,
  getCourses,
  getLecturers,
  getOrganizationUnits,
  updateLecturer,
} from '../../services/api'

function getSpecialtyCourseIds(record) {
  return (record?.specialties || []).map((item) => item.course_id)
}

function Lecturers() {
  const [importOpen, setImportOpen] = useState(false)
  const [unitFilter, setUnitFilter] = useState(null)
  const [unitOptions, setUnitOptions] = useState([])
  const [courseOptions, setCourseOptions] = useState([])
  const importTemplate = getImportTemplate('lecturers')

  const crud = useCrudPage({
    listFn: getLecturers,
    createFn: createLecturer,
    updateFn: updateLecturer,
    deleteFn: deleteLecturer,
    getId: (record) => record.lecturer_id,
    searchFields: [
      'lecturer_id',
      'lecturer_name',
      (record) => record.unit?.unit_name,
      (record) =>
        (record.specialties || [])
          .map((item) => item.course?.course_name || item.course_id)
          .join(' '),
    ],
    transformPayload: (values, editingRecord) => {
      const payload = {
        lecturer_name: values.lecturer_name,
        unit_id: values.unit_id,
        max_quota: values.max_quota,
        course_ids: values.course_ids || [],
      }
      if (!editingRecord) {
        payload.lecturer_id = values.lecturer_id
      }
      return payload
    },
  })

  useEffect(() => {
    Promise.all([getOrganizationUnits(), getCourses()])
      .then(([unitsRes, coursesRes]) => {
        setUnitOptions(
          filterFacultyUnits(unitsRes.data || [])
            .map((unit) => ({
              value: unit.unit_id,
              label: unit.unit_name,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
        )
        setCourseOptions(
          (coursesRes.data || []).map((course) => ({
            value: course.course_id,
            label: `${course.course_id} — ${course.course_name}`,
          })),
        )
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
  }, [])

  const openEdit = (record) => {
    crud.openEdit({
      ...record,
      course_ids: getSpecialtyCourseIds(record),
    })
  }

  const displayData = useMemo(() => {
    if (!unitFilter) return crud.data
    return crud.data.filter((record) => record.unit_id === unitFilter)
  }, [crud.data, unitFilter])

  const columns = useMemo(
    () => [
      {
        title: 'Họ tên',
        dataIndex: 'lecturer_name',
        width: 260,
        key: 'lecturer_name',
        ellipsis: true,
      },
      {
        title: 'Mã giảng viên',
        dataIndex: 'lecturer_id',
        key: 'lecturer_id',
        width: 140,
        render: (value) => <Tag color="geekblue">{value}</Tag>,
      },
      {
        title: 'Chuyên môn giảng dạy',
        key: 'specialties',
        width: 320,
        render: (_, record) => {
          const specialties = record.specialties || []
          if (specialties.length === 0) return '—'

          return (
            <span className="section-group-tags">
              {specialties.slice(0, 3).map((item) => (
                <Tag key={item.course_id} color="blue" className="section-group-tag">
                  {item.course_id}
                </Tag>
              ))}
              {specialties.length > 3 ? (
                <Tag className="section-group-tag">+{specialties.length - 3} môn</Tag>
              ) : null}
            </span>
          )
        },
      },
      {
        title: 'Khoa',
        key: 'unit_name',
        width: 240,
        ellipsis: true,
        render: (_, record) => {
          const unitName = record.unit?.unit_name
          if (!unitName) return '—'
          return (
            <Tooltip title={unitName}>
              <Tag color="purple" className="section-group-tag">
                {unitName}
              </Tag>
            </Tooltip>
          )
        },
      },
      {
        title: 'Định mức',
        dataIndex: 'max_quota',
        key: 'max_quota',
        width: 100,
        render: (value) => <Tag>{value ?? 15}</Tag>,
      },
    ],
    [],
  )

  return (
    <>
    <MasterDataCrudPage
      title="Giảng viên"
      subtitle="Quản lý giảng viên, chuyên môn và ma trận giảng viên – học phần"
      rowKey="lecturer_id"
      columns={columns}
      dataSource={displayData}
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
      modalTitleCreate="Thêm giảng viên mới"
      modalTitleEdit="Cập nhật giảng viên"
      form={crud.form}
      scrollX={1280}
      extraActions={
        <ImportToolbarActions onImportClick={() => setImportOpen(true)} />
      }
      extraFilters={
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Lọc theo khoa"
          style={{ minWidth: 220 }}
          options={unitOptions}
          value={unitFilter}
          onChange={setUnitFilter}
        />
      }
      formContent={(editingRecord) => (
        <>
          <Form.Item
            name="lecturer_id"
            label="Mã giảng viên"
            rules={[{ required: true, message: 'Vui lòng nhập mã giảng viên' }]}
          >
            <Input placeholder="VD: PU1459" disabled={Boolean(editingRecord)} />
          </Form.Item>
          <Form.Item
            name="lecturer_name"
            label="Họ tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input placeholder="VD: Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="unit_id"
            label="Khoa / Bộ môn"
            rules={[{ required: true, message: 'Vui lòng chọn khoa' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={unitOptions}
              placeholder="Chọn khoa quản lý"
            />
          </Form.Item>
          <Form.Item
            name="course_ids"
            label="Chuyên môn giảng dạy"
            tooltip="Chọn các học phần giảng viên có thể dạy — dùng cho ma trận phân công"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={courseOptions}
              placeholder="Chọn học phần (có thể chọn nhiều)"
            />
          </Form.Item>
          <Form.Item
            name="max_quota"
            label="Định mức giảng dạy"
            rules={[{ required: true, message: 'Vui lòng nhập định mức' }]}
            initialValue={15}
          >
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
        </>
      )}
    />

    <ExcelImportModal
      open={importOpen}
      onCancel={() => setImportOpen(false)}
      onSuccess={crud.fetchData}
      title="Nhập giảng viên từ Excel"
      uploadUrl="/imports/lecturers"
      templateUrl={importTemplate?.url}
      templateFileName={importTemplate?.fileName}
    >
      Cột <strong>Chuyên môn</strong> ghi nhiều mã học phần cách nhau bằng dấu phẩy và khoảng trắng
      (VD: <code>CSE702003, CSE703008</code>).
    </ExcelImportModal>
    </>
  )
}

export default Lecturers
