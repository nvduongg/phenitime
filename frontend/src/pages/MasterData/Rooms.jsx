import { useMemo, useState } from 'react'
import { Form, Input, InputNumber, Select, Tag } from 'antd'
import ExcelImportModal from '../../components/Common/ExcelImportModal'
import ImportToolbarActions from '../../components/Common/ImportToolbarActions'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { getImportTemplate } from '../../config/importTemplates'
import { ROOM_TYPE_OPTIONS } from '../../constants/roomTypes'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createRoom,
  deleteRoom,
  getRooms,
  updateRoom,
} from '../../services/api'
import { formatRoomType, getRoomTypeColor } from '../../utils/formatters'

function Rooms() {
  const [importOpen, setImportOpen] = useState(false)
  const [roomTypeFilter, setRoomTypeFilter] = useState(null)
  const importTemplate = getImportTemplate('rooms')

  const crud = useCrudPage({
    listFn: getRooms,
    createFn: createRoom,
    updateFn: updateRoom,
    deleteFn: deleteRoom,
    getId: (record) => record.room_id,
    searchFields: ['room_id', 'room_type'],
  })

  const roomTypeFilterOptions = useMemo(() => {
    const options = new Map(
      ROOM_TYPE_OPTIONS.map((option) => [option.value, option.label]),
    )
    crud.data.forEach((record) => {
      const roomType = String(record.room_type || '').trim().toUpperCase()
      if (roomType && !options.has(roomType)) {
        options.set(roomType, `${roomType} — ${formatRoomType(roomType)}`)
      }
    })
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }))
  }, [crud.data])

  const displayData = useMemo(() => {
    if (!roomTypeFilter) {
      return crud.data
    }
    return crud.data.filter(
      (record) => String(record.room_type || '').trim().toUpperCase() === roomTypeFilter,
    )
  }, [crud.data, roomTypeFilter])

  const columns = [
    {
      title: 'Mã phòng',
      dataIndex: 'room_id',
      key: 'room_id',
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Sức chứa',
      dataIndex: 'capacity',
      key: 'capacity',
      width: 120,
    },
    {
      title: 'Loại phòng / địa điểm',
      dataIndex: 'room_type',
      key: 'room_type',
      width: 260,
      render: (value) => (
        <Tag color={getRoomTypeColor(value)}>
          {value} — {formatRoomType(value)}
        </Tag>
      ),
    },
  ]

  return (
    <>
    <MasterDataCrudPage
      title="Phòng học"
      subtitle="Quản lý phòng học và các địa điểm thực hành, thực tập"
      rowKey="room_id"
      columns={columns}
      dataSource={displayData}
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
      modalTitleCreate="Thêm phòng học mới"
      modalTitleEdit="Cập nhật phòng học"
      form={crud.form}
      scrollX={900}
      extraActions={
        <ImportToolbarActions onImportClick={() => setImportOpen(true)} />
      }
      extraFilters={
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Lọc theo loại phòng"
          style={{ minWidth: 260 }}
          options={roomTypeFilterOptions}
          value={roomTypeFilter}
          onChange={setRoomTypeFilter}
        />
      }
      formContent={(editingRecord) => (
        <>
          <Form.Item
            name="room_id"
            label="Mã phòng"
            rules={[{ required: true, message: 'Vui lòng nhập mã phòng' }]}
          >
            <Input placeholder="VD: A2-102" disabled={Boolean(editingRecord)} />
          </Form.Item>
          <Form.Item
            name="capacity"
            label="Sức chứa"
            rules={[{ required: true, message: 'Vui lòng nhập sức chứa' }]}
          >
            <InputNumber min={1} max={1000} style={{ width: '100%' }} placeholder="VD: 80" />
          </Form.Item>
          <Form.Item
            name="room_type"
            label="Loại phòng / địa điểm học"
            rules={[{ required: true, message: 'Vui lòng chọn loại phòng / địa điểm học' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={ROOM_TYPE_OPTIONS}
              placeholder="Chọn loại phòng / địa điểm học"
            />
          </Form.Item>
        </>
      )}
    />

    <ExcelImportModal
      open={importOpen}
      onCancel={() => setImportOpen(false)}
      onSuccess={crud.fetchData}
      title="Nhập phòng học từ Excel"
      uploadUrl="/imports/rooms"
      templateUrl={importTemplate?.url}
      templateFileName={importTemplate?.fileName}
    />
    </>
  )
}

export default Rooms
