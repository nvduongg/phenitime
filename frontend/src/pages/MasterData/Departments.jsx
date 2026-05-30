import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  PlusSquareOutlined,
  ShrinkOutlined,
  ExpandAltOutlined,
} from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  TreeSelect,
  message,
} from 'antd'
import PageHeader from '../../components/Common/PageHeader'
import { getTableScroll } from '../../config/table'
import {
  createOrganizationUnit,
  deleteOrganizationUnit,
  getOrganizationUnits,
  updateOrganizationUnit,
} from '../../services/api'
import { buildTreeData, toTreeSelectData } from '../../utils/buildTreeData'
import {
  UNIT_TYPE_FORM_OPTIONS,
  formatUnitType,
  getUnitTypeColor,
} from '../../constants/unitTypes'

const TREE_OPTIONS = {
  idKey: 'unit_id',
  parentKey: 'parent_id',
}

const EXPANDABLE_UNIT_TYPES = new Set([
  'UNIVERSITY',
  'TRUONG',
  'SCHOOL',
  'KHOA',
  'TRUNG_TAM',
  'FACULTY',
])

function normalizeFlatUnits(data) {
  return (data || []).map(({ unit_id, unit_name, unit_type, parent_id }) => ({
    unit_id,
    unit_name,
    parent_id: parent_id ?? null,
    unit_type,
  }))
}

function flattenTreeRecord(record) {
  const flatRecord = { ...record }
  delete flatRecord.children
  return flatRecord
}

function getAutoExpandIds(units) {
  return units
    .filter((unit) => EXPANDABLE_UNIT_TYPES.has(unit.unit_type))
    .map((unit) => unit.unit_id)
}

function collectExpandableKeys(nodes) {
  const keys = []
  nodes.forEach((node) => {
    if (node.children?.length) {
      keys.push(node.unit_id)
      keys.push(...collectExpandableKeys(node.children))
    }
  })
  return keys
}

function Departments() {
  const [flatUnits, setFlatUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [parentLocked, setParentLocked] = useState(false)
  const [expandedRowKeys, setExpandedRowKeys] = useState([])
  const [form] = Form.useForm()

  const treeData = useMemo(
    () => buildTreeData(flatUnits, TREE_OPTIONS),
    [flatUnits],
  )

  const collectDescendantIds = useCallback(
    (unitId) => {
      const descendants = new Set()
      const walk = (parentId) => {
        flatUnits
          .filter((unit) => unit.parent_id === parentId)
          .forEach((child) => {
            descendants.add(child.unit_id)
            walk(child.unit_id)
          })
      }
      walk(unitId)
      return descendants
    },
    [flatUnits],
  )

  const disabledParentIds = useMemo(() => {
    if (!editingRecord?.unit_id) return []
    const blocked = new Set([editingRecord.unit_id])
    collectDescendantIds(editingRecord.unit_id).forEach((id) => blocked.add(id))
    return [...blocked]
  }, [collectDescendantIds, editingRecord])

  const parentTreeSelectData = useMemo(() => {
    const applyDisabled = (nodes) =>
      nodes.map((node) => ({
        ...node,
        disabled: disabledParentIds.includes(node.value),
        children: node.children ? applyDisabled(node.children) : undefined,
      }))

    return applyDisabled(
      toTreeSelectData(treeData, { idKey: 'unit_id', titleKey: 'unit_name' }),
    )
  }, [treeData, disabledParentIds])

  const fetchUnits = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getOrganizationUnits()
      const normalized = normalizeFlatUnits(result.data)
      setFlatUnits(normalized)
      setExpandedRowKeys((prev) => [...new Set([...prev, ...getAutoExpandIds(normalized)])])
    } catch {
      setFlatUnits([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getOrganizationUnits()
      .then((result) => {
        if (cancelled) return
        const normalized = normalizeFlatUnits(result.data)
        setFlatUnits(normalized)
        setExpandedRowKeys((prev) => [...new Set([...prev, ...getAutoExpandIds(normalized)])])
      })
      .catch(() => {
        if (!cancelled) setFlatUnits([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!modalOpen) return

    if (editingRecord?.unit_id) {
      form.setFieldsValue({
        unit_id: editingRecord.unit_id,
        unit_name: editingRecord.unit_name,
        unit_type: editingRecord.unit_type,
        parent_id: editingRecord.parent_id ?? undefined,
      })
    } else if (editingRecord?.parent_id) {
      form.resetFields()
      form.setFieldsValue({ parent_id: editingRecord.parent_id })
    } else {
      form.resetFields()
    }
  }, [modalOpen, editingRecord, form])

  const openCreateTop = () => {
    setEditingRecord(null)
    setParentLocked(false)
    setModalOpen(true)
  }

  const openCreateChild = (record) => {
    setEditingRecord({ parent_id: record.unit_id })
    setParentLocked(true)
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditingRecord(flattenTreeRecord(record))
    setParentLocked(false)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRecord(null)
    setParentLocked(false)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        unit_name: values.unit_name,
        unit_type: values.unit_type,
        parent_id: values.parent_id || null,
      }

      if (editingRecord?.unit_id) {
        await updateOrganizationUnit(editingRecord.unit_id, payload)
        message.success('Cập nhật thành công')
      } else {
        await createOrganizationUnit({ unit_id: values.unit_id, ...payload })
        message.success('Thêm mới thành công')
      }

      closeModal()
      fetchUnits()
    } catch (error) {
      if (error?.errorFields) return
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (record) => {
    if (record.children?.length) {
      message.warning('Không thể xóa đơn vị còn đơn vị con. Hãy xóa cấp dưới trước.')
      return
    }

    const hasChildrenInFlat = flatUnits.some((unit) => unit.parent_id === record.unit_id)
    if (hasChildrenInFlat) {
      message.warning('Không thể xóa đơn vị còn đơn vị con. Hãy xóa cấp dưới trước.')
      return
    }

    try {
      await deleteOrganizationUnit(record.unit_id)
      message.success('Xóa thành công')
      fetchUnits()
    } catch {
      // Error handled by axios interceptor
    }
  }

  const columns = [
    {
      title: 'Tên đơn vị',
      dataIndex: 'unit_name',
      key: 'unit_name',
      ellipsis: true,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Mã đơn vị',
      dataIndex: 'unit_id',
      key: 'unit_id',
      width: 140,
      render: (value) => <Tag color="processing">{value}</Tag>,
    },
    {
      title: 'Loại đơn vị',
      dataIndex: 'unit_type',
      key: 'unit_type',
      width: 140,
      render: (value) => (
        <Tag color={getUnitTypeColor(value)}>{formatUnitType(value)}</Tag>
      ),
    },
    {
      title: 'Hành động',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Thêm đơn vị con">
            <Button
              type="text"
              icon={<PlusSquareOutlined />}
              onClick={() => openCreateChild(record)}
            />
          </Tooltip>
          <Tooltip title="Chỉnh sửa">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Xóa đơn vị"
            description={`Bạn có chắc muốn xóa "${record.unit_name}"?`}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Tooltip title="Xóa">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const isEditMode = Boolean(editingRecord?.unit_id)
  const modalTitle = isEditMode
    ? 'Cập nhật đơn vị'
    : parentLocked
      ? 'Thêm đơn vị con'
      : 'Thêm đơn vị mới'

  return (
    <>
      <PageHeader
          title="Đơn vị"
          subtitle="Cơ cấu tổ chức theo dạng cây — Khoa, Bộ môn, Trung tâm, Phòng ban"
          actions={
            <>
              <Button
                size="middle"
                icon={<ExpandAltOutlined />}
                onClick={() => setExpandedRowKeys(collectExpandableKeys(treeData))}
              >
                Mở rộng tất cả
              </Button>
              <Button size="middle" icon={<ShrinkOutlined />} onClick={() => setExpandedRowKeys([])}>
                Thu gọn tất cả
              </Button>
              <Button type="primary" size="middle" icon={<PlusOutlined />} onClick={openCreateTop}>
                Thêm mới
              </Button>
            </>
          }
        />

        <Spin spinning={loading}>
          <Table
            rowKey="unit_id"
            columns={columns}
            dataSource={treeData}
            pagination={false}
            scroll={getTableScroll(900)}
            sticky
            expandable={{
              expandedRowKeys,
              onExpandedRowsChange: setExpandedRowKeys,
            }}
            locale={{ emptyText: 'Chưa có đơn vị nào' }}
          />
        </Spin>

      <Modal
        title={modalTitle}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={isEditMode ? 'Cập nhật' : 'Thêm mới'}
        cancelText="Hủy"
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="unit_name"
            label="Tên đơn vị"
            rules={[{ required: true, message: 'Vui lòng nhập tên đơn vị' }]}
          >
            <Input placeholder="VD: Khoa Công nghệ thông tin" />
          </Form.Item>
          <Form.Item
            name="unit_id"
            label="Mã đơn vị"
            rules={[{ required: true, message: 'Vui lòng nhập mã đơn vị' }]}
          >
            <Input placeholder="VD: F_IT, D_SE" disabled={isEditMode} />
          </Form.Item>
          <Form.Item
            name="unit_type"
            label="Loại đơn vị"
            rules={[{ required: true, message: 'Vui lòng chọn loại đơn vị' }]}
          >
            <Select options={UNIT_TYPE_FORM_OPTIONS} placeholder="Chọn loại đơn vị" />
          </Form.Item>
          <Form.Item name="parent_id" label="Đơn vị cấp trên">
            <TreeSelect
              allowClear={!parentLocked}
              showSearch
              treeDefaultExpandAll
              treeData={parentTreeSelectData}
              placeholder="Chọn đơn vị cha (để trống nếu là cấp cao nhất)"
              disabled={parentLocked}
              treeNodeFilterProp="title"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default Departments
