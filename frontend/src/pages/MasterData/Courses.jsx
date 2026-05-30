import { useEffect, useState } from 'react'
import { Form, Input, InputNumber, Select, Tag } from 'antd'
import ExcelImportModal from '../../components/Common/ExcelImportModal'
import ImportToolbarActions from '../../components/Common/ImportToolbarActions'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { getImportTemplate } from '../../config/importTemplates'
import { filterFacultyUnits } from '../../constants/unitTypes'
import { CLASS_TYPE_OPTIONS, formatClassType, getClassTypeColor, normalizeDeliveryChannel } from '../../constants/classTypes'
import { ROOM_TYPE_OPTIONS } from '../../constants/roomTypes'
import {
  SECTIONING_TEMPLATE_OPTIONS,
  renderSectioningTemplateTag,
} from '../../constants/sectioningTemplates'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createCourse,
  deleteCourse,
  getCourses,
  getOrganizationUnits,
  updateCourse,
} from '../../services/api'
import {
  formatCredits,
  formatRoomType,
  getRoomTypeColor,
} from '../../utils/formatters'

function Courses() {
  const [importOpen, setImportOpen] = useState(false)
  const [unitOptions, setUnitOptions] = useState([])
  const importTemplate = getImportTemplate('courses')

  const crud = useCrudPage({
    listFn: getCourses,
    createFn: createCourse,
    updateFn: updateCourse,
    deleteFn: deleteCourse,
    getId: (record) => record.course_id,
    searchFields: ['course_id', 'course_name', (record) => record.unit?.unit_name],
    transformPayload: (values) => ({
      ...values,
      default_room_type: values.room_type,
      room_type: values.room_type,
    }),
  })

  useEffect(() => {
    getOrganizationUnits()
      .then((result) => {
        setUnitOptions(
          filterFacultyUnits(result.data).map((unit) => ({
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
      title: 'Mã HP',
      dataIndex: 'course_id',
      key: 'course_id',
      width: 120,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Tên học phần',
      dataIndex: 'course_name',
      key: 'course_name',
      ellipsis: true,
    },
    {
      title: 'TC LT',
      dataIndex: 'theory_credits',
      key: 'theory_credits',
      width: 80,
      render: formatCredits,
    },
    {
      title: 'TC TH',
      dataIndex: 'practice_credits',
      key: 'practice_credits',
      width: 80,
      render: formatCredits,
    },
    {
      title: 'Kênh học',
      dataIndex: 'class_type',
      key: 'class_type',
      width: 140,
      render: (value) => (
        <Tag color={getClassTypeColor(value)}>{formatClassType(value)}</Tag>
      ),
    },
    {
      title: 'Mẫu sinh lớp',
      dataIndex: 'template_code',
      key: 'template_code',
      width: 140,
      render: (value) => renderSectioningTemplateTag(value),
    },
    {
      title: 'Loại phòng mặc định',
      dataIndex: 'default_room_type',
      key: 'default_room_type',
      render: (value, record) => {
        const roomType = value || record.room_type
        return (
          <Tag color={getRoomTypeColor(roomType)}>{formatRoomType(roomType)}</Tag>
        )
      },
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
        title="Học phần"
        subtitle="Quản lý danh mục học phần, tín chỉ và yêu cầu phòng học"
        rowKey="course_id"
        columns={columns}
        dataSource={crud.data}
        loading={crud.loading}
        submitting={crud.submitting}
        modalOpen={crud.modalOpen}
        editingRecord={crud.editingRecord}
        searchText={crud.searchText}
        onSearchChange={crud.setSearchText}
        onCreate={crud.openCreate}
        onEdit={(record) =>
          crud.openEdit({
            ...record,
            class_type: normalizeDeliveryChannel(record.class_type),
            room_type: record.default_room_type || record.room_type,
          })
        }
        onDelete={crud.handleDelete}
        onCloseModal={crud.closeModal}
        onSubmit={crud.handleSubmit}
        modalTitleCreate="Thêm học phần mới"
        modalTitleEdit="Cập nhật học phần"
        form={crud.form}
        scrollX={1250}
        extraActions={
          <ImportToolbarActions onImportClick={() => setImportOpen(true)} />
        }
        formContent={(editingRecord) => (
          <>
            <Form.Item
              name="course_id"
              label="Mã học phần"
              rules={[{ required: true, message: 'Vui lòng nhập mã học phần' }]}
            >
              <Input placeholder="VD: INT3306" disabled={Boolean(editingRecord)} />
            </Form.Item>
            <Form.Item
              name="course_name"
              label="Tên học phần"
              rules={[{ required: true, message: 'Vui lòng nhập tên học phần' }]}
            >
              <Input placeholder="VD: Cơ sở dữ liệu" />
            </Form.Item>
            <Form.Item
              name="credits"
              label="Tổng tín chỉ"
              rules={[{ required: true, message: 'Vui lòng nhập tổng tín chỉ' }]}
            >
              <InputNumber min={0} max={10} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="theory_credits"
              label="Tín chỉ lý thuyết"
              rules={[{ required: true, message: 'Vui lòng nhập tín chỉ lý thuyết' }]}
            >
              <InputNumber min={0} max={10} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="practice_credits"
              label="Tín chỉ thực hành"
              rules={[{ required: true, message: 'Vui lòng nhập tín chỉ thực hành' }]}
            >
              <InputNumber min={0} max={10} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="class_type"
              label="Kênh học"
              rules={[{ required: true, message: 'Vui lòng chọn kênh học' }]}
              initialValue="FACE"
              extra="Quyết định sinh lớp và có đưa vào xếp lịch AI hay không. LT/TH/ELN0 được suy ra ở cấp lớp học phần."
            >
              <Select options={CLASS_TYPE_OPTIONS} placeholder="Chọn kênh học" />
            </Form.Item>
            <Form.Item
              name="template_code"
              label="Mẫu sinh lớp"
              rules={[{ required: true, message: 'Vui lòng chọn mẫu sinh lớp' }]}
              initialValue="STANDARD"
              extra="Quy tắc sinh lớp tự động. Chọn SPECIAL cho Đồ án/Thực tập/Khóa luận (không sinh lớp tự động)."
            >
              <Select
                options={SECTIONING_TEMPLATE_OPTIONS}
                placeholder="Chọn mẫu sinh lớp"
              />
            </Form.Item>
            <Form.Item
              name="room_type"
              label="Loại phòng mặc định"
              rules={[{ required: true, message: 'Vui lòng chọn loại phòng mặc định' }]}
              initialValue="LT"
              extra="Dùng khi sinh lớp tự động: PM cho phòng máy, SB cho thể dục, BV cho lâm sàng..."
            >
              <Select options={ROOM_TYPE_OPTIONS} placeholder="Chọn loại phòng mặc định" />
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
                placeholder="Chọn khoa quản lý"
              />
            </Form.Item>
          </>
        )}
      />

      <ExcelImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={crud.fetchData}
        title="Nhập học phần từ Excel"
        uploadUrl="/imports/courses"
        templateUrl={importTemplate?.url}
        templateFileName={importTemplate?.fileName}
      >
        Cột <strong>Mã khoa quản lý</strong> phải là mã khoa hiện hành (FIS, FCS, FAD, FL, FBA, EIB…).
        Không dùng mã cũ CSE/FBE/FEL/FTS hay tiền tố mã học phần — mỗi học phần có thể thuộc khoa khác nhau sau tái cơ cấu.
      </ExcelImportModal>
    </>
  )
}

export default Courses
