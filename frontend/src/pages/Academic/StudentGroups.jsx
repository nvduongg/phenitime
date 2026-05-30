import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Form, Input, InputNumber, Select, Spin, Typography } from 'antd'
import ExcelImportModal from '../../components/Common/ExcelImportModal'
import ImportToolbarActions from '../../components/Common/ImportToolbarActions'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { getImportTemplate } from '../../config/importTemplates'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createStudentGroup,
  deleteStudentGroup,
  getStudentGroups,
  previewStudentGroup,
  updateStudentGroup,
} from '../../services/api'
import { formatMajorLabel } from '../../utils/formatters'

function StudentGroups() {
  const [importOpen, setImportOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewMessage, setPreviewMessage] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const importTemplate = getImportTemplate('studentGroups')

  const crud = useCrudPage({
    listFn: getStudentGroups,
    createFn: createStudentGroup,
    updateFn: updateStudentGroup,
    deleteFn: deleteStudentGroup,
    getId: (record) => record.group_id,
    searchFields: [
      'group_id',
      (record) => record.curriculum?.major?.major_code,
      (record) => record.curriculum?.major?.major_name,
      (record) => record.curriculum?.major?.major_id,
      (record) => record.curriculum?.cohort?.cohort_id,
    ],
    transformPayload: (values) => ({
      group_id: values.group_id?.trim(),
      major_id: values.major_id,
      student_count: values.student_count,
    }),
  })

  const groupId = Form.useWatch('group_id', crud.form)
  const selectedMajorId = Form.useWatch('major_id', crud.form)

  const resetPreviewState = useCallback(() => {
    setPreview(null)
    setPreviewMessage('')
    setPreviewLoading(false)
  }, [])

  const handleCloseModal = useCallback(() => {
    resetPreviewState()
    crud.closeModal()
  }, [crud, resetPreviewState])

  const handleCreate = useCallback(() => {
    resetPreviewState()
    crud.openCreate()
  }, [crud, resetPreviewState])

  useEffect(() => {
    if (!crud.modalOpen) return

    const normalizedGroupId = groupId?.trim()
    if (!normalizedGroupId) return

    let cancelled = false

    const timer = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const result = await previewStudentGroup(normalizedGroupId, selectedMajorId)
        if (cancelled) return

        if (result?.data) {
          setPreview(result.data)
          setPreviewMessage('')
          if (result.data.major_id && !result.data.ambiguous) {
            crud.form.setFieldValue('major_id', result.data.major_id)
          }
        } else {
          setPreview(null)
          setPreviewMessage(result?.message || 'Không phân tích được mã lớp')
          crud.form.setFieldValue('major_id', undefined)
        }
      } catch {
        if (cancelled) return
        setPreview(null)
        setPreviewMessage('')
      } finally {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [crud.modalOpen, groupId, selectedMajorId, crud.form])

  const candidateOptions = useMemo(
    () =>
      (preview?.candidates || []).map((candidate) => ({
        value: candidate.major_id,
        label: candidate.label,
      })),
    [preview],
  )

  const handleEdit = (record) => {
    resetPreviewState()
    crud.openEdit({
      ...record,
      major_id: record.curriculum?.major_id || record.curriculum?.major?.major_id,
    })
  }

  const columns = [
    {
      title: 'Mã lớp',
      dataIndex: 'group_id',
      key: 'group_id',
      width: 220,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Ngành',
      key: 'major_name',
      ellipsis: true,
      render: (_, record) => formatMajorLabel(record.curriculum?.major),
    },
    {
      title: 'Niên khóa',
      key: 'cohort_id',
      width: 110,
      render: (_, record) => record.curriculum?.cohort?.cohort_id || '—',
    },
    {
      title: 'Sĩ số',
      dataIndex: 'student_count',
      key: 'student_count',
      width: 90,
      render: (value) => value ?? '—',
    },
  ]

  const renderPreview = () => {
    if (previewLoading) {
      return (
        <div style={{ marginBottom: 16 }}>
          <Spin size="small" />{' '}
          <Typography.Text type="secondary">Đang phân tích mã lớp...</Typography.Text>
        </div>
      )
    }

    if (!groupId?.trim()) return null

    if (preview?.ambiguous) {
      return (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Cần chọn thêm ngành"
          description={preview.message}
        />
      )
    }

    if (preview?.cohort_id && preview?.major) {
      return (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message="Đã nhận diện tự động"
          description={`Niên khóa ${preview.cohort_id} · ${formatMajorLabel(preview.major)}`}
        />
      )
    }

    if (previewMessage) {
      return (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Chưa nhận diện được"
          description={previewMessage}
        />
      )
    }

    return null
  }

  return (
    <>
      <MasterDataCrudPage
        title="Lớp sinh viên"
        subtitle="Chỉ cần mã lớp — hệ thống tự đọc niên khóa và ngành (VD: K17_CNTT_01)"
        rowKey="group_id"
        columns={columns}
        dataSource={crud.data}
        loading={crud.loading}
        submitting={crud.submitting}
        modalOpen={crud.modalOpen}
        editingRecord={crud.editingRecord}
        searchText={crud.searchText}
        onSearchChange={crud.setSearchText}
        onCreate={handleCreate}
        onEdit={handleEdit}
        onDelete={crud.handleDelete}
        onCloseModal={handleCloseModal}
        onSubmit={crud.handleSubmit}
        modalTitleCreate="Thêm lớp sinh viên mới"
        modalTitleEdit="Cập nhật lớp sinh viên"
        form={crud.form}
        scrollX={760}
        extraActions={
          <ImportToolbarActions onImportClick={() => setImportOpen(true)} />
        }
        formContent={(editingRecord) => (
          <>
            <Form.Item
              name="group_id"
              label="Mã lớp"
              rules={[{ required: true, message: 'Vui lòng nhập mã lớp' }]}
              extra="Định dạng Niên khóa_Ngành_STT — VD: K17_CNTT_01"
            >
              <Input placeholder="VD: K17_CNTT_01" disabled={Boolean(editingRecord)} />
            </Form.Item>

            {renderPreview()}

            {preview?.ambiguous ? (
              <Form.Item
                name="major_id"
                label="Chọn ngành"
                rules={[{ required: true, message: 'Vui lòng chọn ngành phù hợp' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={candidateOptions}
                  placeholder="Chọn đúng chương trình đào tạo"
                />
              </Form.Item>
            ) : (
              <Form.Item name="major_id" hidden>
                <Input />
              </Form.Item>
            )}

            <Form.Item name="student_count" label="Sĩ số">
              <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder="VD: 45" />
            </Form.Item>
          </>
        )}
      />

      <ExcelImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={crud.fetchData}
        title="Nhập lớp sinh viên từ Excel"
        uploadUrl="/imports/student-groups"
        templateUrl={importTemplate?.url}
        templateFileName={importTemplate?.fileName}
      />
    </>
  )
}

export default StudentGroups
