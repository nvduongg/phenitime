import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CopyOutlined,
  DownloadOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { usePageMeta } from '../../contexts/PageMetaContext'
import { getTableScroll, TABLE_SCROLL_CLASS } from '../../config/table'
import { ROLE_LABELS, ROLES, PROVISIONABLE_ROLES } from '../../constants/roles'
import { formatUnitType } from '../../constants/unitTypes'

const { Text, Paragraph } = Typography

const ROLE_OPTIONS = PROVISIONABLE_ROLES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}))

function scopeHelpText(role) {
  if (role === ROLES.SCHOOL_OFFICE) {
    return 'Chỉ Trường/Viện thành viên trực thuộc Đại học Phenikaa (PKA) — VP trường quản lý cả Khoa con của trường đó.'
  }
  if (role === ROLES.FACULTY_OFFICE) {
    return 'Chỉ Khoa/Bộ môn trực thuộc Đại học (con PKA). Khoa thuộc Trường thành viên do VP trường quản lý, không tạo VP khoa.'
  }
  return null
}

export default function Users() {
  const { setMeta } = usePageMeta()
  const [users, setUsers] = useState([])
  const [scopeUnits, setScopeUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkPreview, setBulkPreview] = useState([])
  const [bulkExcluded, setBulkExcluded] = useState([])
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [credentialModal, setCredentialModal] = useState(null)
  const [form] = Form.useForm()
  const [bulkForm] = Form.useForm()

  const roleWatch = Form.useWatch('role', form)
  const needsScope = PROVISIONABLE_ROLES.includes(roleWatch)

  useEffect(() => {
    setMeta({ title: 'Quản lý tài khoản' })
  }, [setMeta])

  const loadUsers = useCallback(async () => {
    const usersRes = await api.get('/users')
    setUsers(usersRes.data?.data || [])
  }, [])

  const loadScopeUnits = useCallback(async (role) => {
    if (!role) {
      setScopeUnits([])
      return
    }
    const unitsRes = await api.get('/users/scope-units', { params: { role } })
    setScopeUnits(unitsRes.data?.data || [])
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      await loadUsers()
    } finally {
      setLoading(false)
    }
  }, [loadUsers])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (needsScope && roleWatch) {
      loadScopeUnits(roleWatch)
    }
  }, [roleWatch, needsScope, loadScopeUnits])

  const scopeOptions = useMemo(
    () =>
      scopeUnits.map((u) => ({
        value: u.unit_id,
        label: `${u.unit_name} (${formatUnitType(u.unit_type)})`,
      })),
    [scopeUnits],
  )

  const loadBulkPreview = useCallback(async (formValues = {}) => {
    const params = {}
    if (formValues.include_schools === false) params.include_schools = 'false'
    if (formValues.include_faculties === false) params.include_faculties = 'false'
    const res = await api.get('/users/bulk-preview', { params })
    const data = res.data?.data || {}
    setBulkPreview(data.preview || [])
    setBulkExcluded(data.excluded || [])
  }, [])

  const openBulkModal = async () => {
    const initial = {
      include_schools: true,
      include_faculties: true,
      skip_existing: true,
    }
    bulkForm.setFieldsValue(initial)
    setBulkResult(null)
    setBulkExcluded([])
    setBulkLoading(true)
    setBulkOpen(true)
    try {
      await loadBulkPreview(initial)
    } finally {
      setBulkLoading(false)
    }
  }

  const onBulkFormChange = async (_, allValues) => {
    if (bulkResult) return
    setBulkLoading(true)
    try {
      await loadBulkPreview(allValues)
    } finally {
      setBulkLoading(false)
    }
  }

  const runBulkGenerate = async () => {
    const values = await bulkForm.validateFields()
    setBulkLoading(true)
    try {
      const res = await api.post('/users/bulk-generate', values)
      setBulkResult(res.data?.data)
      message.success(res.data?.message || 'Đã sinh tài khoản')
      loadUsers()
    } finally {
      setBulkLoading(false)
    }
  }

  const exportCredentialsExcel = async () => {
    const created = bulkResult?.created || []
    if (!created.length) {
      message.warning('Không có tài khoản để xuất')
      return
    }
    try {
      const res = await api.post(
        '/users/export-credentials',
        {
          created,
          excluded: bulkResult?.excluded_by_policy || bulkExcluded,
        },
        { responseType: 'blob' },
      )
      const disposition = res.headers['content-disposition'] || ''
      const match = /filename="?([^"]+)"?/.exec(disposition)
      const filename = match?.[1] || `phenitime-tai-khoan-${new Date().toISOString().slice(0, 10)}.xlsx`
      const url = URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      message.success('Đã tải file Excel — lưu file trước khi gửi VP trường / VP khoa')
    } catch {
      message.error('Xuất Excel thất bại')
    }
  }

  const copyAllCredentials = async () => {
    const rows = bulkResult?.created || []
    if (!rows.length) return
    const lines = rows.map(
      (r) =>
        `${r.unit_name}\t${ROLE_LABELS[r.role] || r.role}\t${r.email}\t${r.password}`,
    )
    const header = 'Đơn vị\tVai trò\tEmail\tMật khẩu'
    try {
      await navigator.clipboard.writeText([header, ...lines].join('\n'))
      message.success('Đã sao chép danh sách tài khoản')
    } catch {
      message.warning('Không sao chép được')
    }
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ role: ROLES.SCHOOL_OFFICE, use_motif_password: true })
    loadScopeUnits(ROLES.SCHOOL_OFFICE)
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      full_name: record.full_name,
      role: record.role,
      scope_unit_id: record.scope_unit_id,
      is_active: record.is_active,
    })
    if (record.role !== ROLES.UNIVERSITY_TRAINING) {
      loadScopeUnits(record.role)
    }
    setModalOpen(true)
  }

  const showCredentials = (title, rows) => {
    setCredentialModal({ title, rows })
  }

  const onSubmit = async () => {
    const values = await form.validateFields()

    if (editing) {
      const payload = {
        full_name: values.full_name,
        role: values.role,
        scope_unit_id: values.scope_unit_id,
      }
      if (editing.role !== ROLES.UNIVERSITY_TRAINING) {
        payload.is_active = values.is_active
      }
      await api.put(`/users/${encodeURIComponent(editing.user_id)}`, payload)
      message.success('Đã cập nhật')
      setModalOpen(false)
      loadData()
      return
    }

    const res = await api.post('/users', {
      role: values.role,
      scope_unit_id: values.scope_unit_id,
      full_name: values.full_name,
      email: values.email,
      use_motif_password: values.use_motif_password !== false,
      password: values.use_motif_password === false ? values.password : undefined,
    })

    setModalOpen(false)
    loadData()

    const cred = res.data?.credentials
    if (cred) {
      showCredentials('Tài khoản mới', [cred])
    }
  }

  const handleResetPassword = (record) => {
    if (record.role === ROLES.UNIVERSITY_TRAINING) return
    Modal.confirm({
      title: 'Đặt lại mật khẩu theo motíp đơn vị?',
      content: `Tạo lại mật khẩu dạng vpt…@123 / vk…@123 cho ${record.email}`,
      okText: 'Đặt lại',
      onOk: async () => {
        const res = await api.post(
          `/users/${encodeURIComponent(record.user_id)}/reset-password`,
        )
        const cred = res.data?.credentials
        if (cred) showCredentials('Mật khẩu mới', [cred])
      },
    })
  }

  const isUniversityAccount = (row) => row.role === ROLES.UNIVERSITY_TRAINING

  const columns = [
    { title: 'Họ tên', dataIndex: 'full_name', key: 'full_name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (role) => <Tag color={role === ROLES.UNIVERSITY_TRAINING ? 'purple' : 'blue'}>{ROLE_LABELS[role] || role}</Tag>,
    },
    {
      title: 'Phạm vi',
      key: 'scope',
      render: (_, row) => <Text>{row.scope_summary || '—'}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active, row) =>
        isUniversityAccount(row) ? (
          <Tag color="purple">Luôn hoạt động</Tag>
        ) : (
          <Tag color={active ? 'green' : 'default'}>{active ? 'Hoạt động' : 'Khóa'}</Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_, row) => (
        <Space size="small">
          <Button type="link" onClick={() => openEdit(row)}>
            Sửa
          </Button>
          {!isUniversityAccount(row) && (
            <Button type="link" onClick={() => handleResetPassword(row)}>
              Đặt lại MK
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const bulkPreviewColumns = [
    { title: 'Đơn vị', dataIndex: 'unit_name', key: 'unit_name' },
    {
      title: 'Loại',
      dataIndex: 'unit_type',
      key: 'unit_type',
      render: (t) => formatUnitType(t),
    },
    {
      title: 'Vai trò',
      dataIndex: 'role_label',
      key: 'role_label',
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Mật khẩu (motíp)',
      dataIndex: 'password',
      key: 'password',
      render: (p) => <Text code>{p}</Text>,
    },
  ]

  const bulkResultColumns = [
    { title: 'Đơn vị', dataIndex: 'unit_name' },
    { title: 'Vai trò', dataIndex: 'role_label', render: (_, r) => ROLE_LABELS[r.role] || r.role },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Mật khẩu', dataIndex: 'password', render: (p) => <Text code copyable>{p}</Text> },
    {
      title: 'Ghi chú',
      dataIndex: 'updated',
      render: (u) => (u ? <Tag color="orange">Cập nhật MK</Tag> : <Tag color="green">Mới</Tag>),
    },
  ]

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Gốc Đại học Phenikaa (PKA)"
        description={
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>
              <strong>Văn phòng trường</strong>: chỉ Trường/Viện thành viên — con trực tiếp của PKA.
            </li>
            <li>
              <strong>Văn phòng khoa</strong>: chỉ Khoa/Bộ môn trực thuộc Đại học (con PKA). Khoa nằm
              dưới Trường thành viên không sinh tài khoản (VP trường đã quản lý).
            </li>
            <li>
              <strong>Quyền chức năng</strong>: tự phân công GV trong phạm vi; học phần do đơn vị khác
              quản lý → <strong>gửi yêu cầu phân công</strong> (đơn vị quản lý môn sẽ xử lý).
            </li>
            <li>
              Email <code>vp.mã@…</code> / <code>vk.mã@…</code>, mật khẩu <code>vptmã@123</code> /{' '}
              <code>vkmã@123</code>. Sau khi sinh, xuất Excel để lưu và gửi các VP.
            </li>
            <li>Tài khoản Ban Đào tạo (Đại học) không khóa / xóa / đặt lại MK trên giao diện.</li>
          </ul>
        }
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={openBulkModal}>
          Sinh tài khoản nhanh theo đơn vị
        </Button>
        <Button icon={<PlusOutlined />} onClick={openCreate}>
          Tạo lẻ một tài khoản
        </Button>
      </Space>

      <Table
        className={TABLE_SCROLL_CLASS}
        rowKey="user_id"
        loading={loading}
        columns={columns}
        dataSource={users}
        pagination={{ pageSize: 15 }}
        scroll={getTableScroll(1100)}
        sticky
      />

      <Modal
        title="Sinh tài khoản nhanh theo danh mục đơn vị"
        open={bulkOpen}
        onCancel={() => setBulkOpen(false)}
        width={900}
        footer={
          bulkResult
            ? [
                <Button
                  key="excel"
                  icon={<DownloadOutlined />}
                  onClick={exportCredentialsExcel}
                  disabled={!bulkResult?.created?.length}
                >
                  Xuất Excel
                </Button>,
                <Button key="copy" icon={<CopyOutlined />} onClick={copyAllCredentials}>
                  Sao chép danh sách
                </Button>,
                <Button key="close" type="primary" onClick={() => setBulkOpen(false)}>
                  Đóng
                </Button>,
              ]
            : [
                <Button key="cancel" onClick={() => setBulkOpen(false)}>
                  Hủy
                </Button>,
                <Button key="run" type="primary" loading={bulkLoading} onClick={runBulkGenerate}>
                  Sinh tài khoản
                </Button>,
              ]
        }
      >
        {!bulkResult ? (
          <>
            <Form form={bulkForm} layout="vertical" onValuesChange={onBulkFormChange}>
              <Form.Item name="include_schools" valuePropName="checked">
                <Checkbox>VP trường — Trường thành viên trực thuộc PKA</Checkbox>
              </Form.Item>
              <Form.Item name="include_faculties" valuePropName="checked">
                <Checkbox>VP khoa — Khoa trực thuộc Đại học (không gồm Khoa thuộc Trường)</Checkbox>
              </Form.Item>
              <Form.Item name="skip_existing" valuePropName="checked">
                <Checkbox>Bỏ qua đơn vị đã có email (chỉ tạo mới)</Checkbox>
              </Form.Item>
            </Form>
            <Paragraph type="secondary">
              Xem trước <strong>{bulkPreview.length}</strong> tài khoản (gốc PKA).
              {bulkExcluded.length > 0 ? (
                <>
                  {' '}
                  Không tạo <strong>{bulkExcluded.length}</strong> Khoa thuộc Trường thành viên.
                </>
              ) : null}
            </Paragraph>
            <Table
              size="small"
              rowKey="unit_id"
              loading={bulkLoading}
              columns={bulkPreviewColumns}
              dataSource={bulkPreview}
              pagination={{ pageSize: 8 }}
              scroll={{ y: 280 }}
            />
          </>
        ) : (
          <>
            <Paragraph>
              Đã xử lý <strong>{bulkResult.created?.length || 0}</strong> tài khoản, bỏ qua{' '}
              {bulkResult.skipped?.length || 0} (gồm Khoa thuộc Trường / email đã có). Xuất Excel để
              lưu thông tin đăng nhập trước khi gửi VP trường / VP khoa.
            </Paragraph>
            <Table
              size="small"
              rowKey={(r) => `${r.email}-${r.scope_unit_id}`}
              columns={bulkResultColumns}
              dataSource={bulkResult.created || []}
              pagination={{ pageSize: 10 }}
              scroll={{ y: 360 }}
            />
          </>
        )}
      </Modal>

      <Modal
        title={editing ? 'Cập nhật tài khoản' : 'Tạo tài khoản (VP trường / VP khoa)'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={onSubmit}
        okText={editing ? 'Lưu' : 'Tạo'}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical">
          {editing && isUniversityAccount(editing) ? (
            <Alert
              type="warning"
              showIcon
              message="Tài khoản Ban Đào tạo (Đại học)"
              description="Không đổi trạng thái kích hoạt. Mật khẩu cấu hình qua server / .env."
              style={{ marginBottom: 16 }}
            />
          ) : null}
          {!editing && (
            <>
              <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
                <Select
                  options={ROLE_OPTIONS}
                  onChange={(role) => {
                    form.setFieldValue('scope_unit_id', undefined)
                    loadScopeUnits(role)
                  }}
                />
              </Form.Item>
              <Form.Item
                name="scope_unit_id"
                label="Đơn vị"
                rules={[{ required: true }]}
                extra={scopeHelpText(roleWatch)}
              >
                <Select showSearch optionFilterProp="label" options={scopeOptions} />
              </Form.Item>
              <Form.Item name="full_name" label="Họ tên (tùy chọn — để trống sẽ tự đặt)">
                <Input />
              </Form.Item>
              <Form.Item name="email" label="Email (tùy chọn — để trống theo motíp vp./vk.)">
                <Input placeholder="vp.cntt@phenikaa-uni.edu.vn" />
              </Form.Item>
              <Form.Item name="use_motif_password" valuePropName="checked" initialValue>
                <Checkbox>Mật khẩu theo motíp (vptmã@123 / vkmã@123)</Checkbox>
              </Form.Item>
            </>
          )}
          {editing && !isUniversityAccount(editing) && (
            <>
              <Form.Item name="full_name" label="Họ tên" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
                <Select options={ROLE_OPTIONS} onChange={(r) => loadScopeUnits(r)} />
              </Form.Item>
              <Form.Item name="scope_unit_id" label="Đơn vị" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={scopeOptions} />
              </Form.Item>
              <Form.Item name="is_active" label="Kích hoạt" valuePropName="checked">
                <Checkbox>Cho phép đăng nhập</Checkbox>
              </Form.Item>
            </>
          )}
          {editing && isUniversityAccount(editing) && (
            <Form.Item name="full_name" label="Họ tên" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={credentialModal?.title}
        open={Boolean(credentialModal)}
        onCancel={() => setCredentialModal(null)}
        footer={
          <Button type="primary" onClick={() => setCredentialModal(null)}>
            Đóng
          </Button>
        }
      >
        {(credentialModal?.rows || []).map((row) => (
          <div key={row.email} style={{ marginBottom: 12 }}>
            <Text strong>{row.full_name}</Text>
            <br />
            <Text>Email: </Text>
            <Text copyable>{row.email}</Text>
            <br />
            <Text>Mật khẩu: </Text>
            <Text code copyable>
              {row.password}
            </Text>
          </div>
        ))}
      </Modal>
    </div>
  )
}
