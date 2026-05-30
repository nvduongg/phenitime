import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tooltip,
} from 'antd'
import PageHeader from './PageHeader'
import { getTableScroll } from '../../config/table'

function CrudActions({ record, onEdit, onDelete, renderRowActions }) {
  return (
    <Space size="small">
      {renderRowActions ? renderRowActions(record) : null}
      <Tooltip title="Chỉnh sửa">
        <Button type="text" size="middle" icon={<EditOutlined />} onClick={() => onEdit(record)} />
      </Tooltip>
      <Popconfirm
        title="Xóa bản ghi"
        description="Bạn có chắc chắn muốn xóa bản ghi này?"
        okText="Xóa"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
        onConfirm={() => onDelete(record)}
      >
        <Tooltip title="Xóa">
          <Button type="text" size="middle" danger icon={<DeleteOutlined />} />
        </Tooltip>
      </Popconfirm>
    </Space>
  )
}

function MasterDataCrudPage({
  title,
  subtitle,
  rowKey,
  columns,
  dataSource,
  loading,
  submitting,
  modalOpen,
  editingRecord,
  searchText,
  onSearchChange,
  onCreate,
  onEdit,
  onDelete,
  onCloseModal,
  onSubmit,
  modalTitleCreate,
  modalTitleEdit,
  form,
  formContent,
  scrollX = 900,
  extraActions,
  extraFilters,
  renderRowActions,
  actionColumnWidth = 120,
}) {
  const actionColumn = {
    title: 'Hành động',
    key: 'actions',
    width: actionColumnWidth,
    fixed: 'right',
    render: (_, record) => (
      <CrudActions
        record={record}
        onEdit={onEdit}
        onDelete={onDelete}
        renderRowActions={renderRowActions}
      />
    ),
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        filters={
          <>
            {extraFilters}
            <Input.Search
              allowClear
              placeholder="Tìm kiếm..."
              style={{ minWidth: 280 }}
              value={searchText}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </>
        }
        actions={
          <>
            {extraActions}
            <Button type="primary" size="middle" icon={<PlusOutlined />} onClick={onCreate}>
              Thêm mới
            </Button>
          </>
        }
      />

      <Spin spinning={loading}>
        <Table
          rowKey={rowKey}
          columns={[...columns, actionColumn]}
          dataSource={dataSource}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} bản ghi` }}
          scroll={getTableScroll(scrollX)}
          sticky
        />
      </Spin>

      <Modal
        title={editingRecord ? modalTitleEdit : modalTitleCreate}
        open={modalOpen}
        onCancel={onCloseModal}
        onOk={onSubmit}
        confirmLoading={submitting}
        okText={editingRecord ? 'Cập nhật' : 'Thêm mới'}
        cancelText="Hủy"
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical">
          {typeof formContent === 'function' ? formContent(editingRecord) : formContent}
        </Form>
      </Modal>
    </>
  )
}

export default MasterDataCrudPage
