import { useCallback, useEffect, useMemo, useState } from 'react'
import { Form, message } from 'antd'

export function useCrudPage({
  listFn,
  createFn,
  updateFn,
  deleteFn,
  getId,
  searchFields = [],
  transformPayload,
}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listFn()
      setData(result.data || [])
    } catch {
      // Error notification handled by axios interceptor
    } finally {
      setLoading(false)
    }
  }, [listFn])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Modal uses destroyOnHidden, so the form remounts when opened.
  // setFieldsValue must run after the form is mounted, not in the click handler.
  useEffect(() => {
    if (!modalOpen) return

    if (editingRecord) {
      form.setFieldsValue(editingRecord)
    } else {
      form.resetFields()
    }
  }, [modalOpen, editingRecord, form])

  const filteredData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) return data

    return data.filter((item) =>
      searchFields.some((field) => {
        const value = typeof field === 'function' ? field(item) : item[field]
        return String(value ?? '').toLowerCase().includes(keyword)
      }),
    )
  }, [data, searchFields, searchText])

  const openCreate = () => {
    setEditingRecord(null)
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditingRecord(record)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRecord(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload = transformPayload ? transformPayload(values, editingRecord) : values
      setSubmitting(true)

      if (editingRecord) {
        await updateFn(getId(editingRecord), payload)
        message.success('Cập nhật thành công')
      } else {
        await createFn(payload)
        message.success('Thêm mới thành công')
      }

      closeModal()
      fetchData()
    } catch (error) {
      if (error?.errorFields) return
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await deleteFn(getId(record))
      message.success('Xóa thành công')
      fetchData()
    } catch {
      // Error notification handled by axios interceptor
    }
  }

  return {
    data: filteredData,
    loading,
    submitting,
    modalOpen,
    editingRecord,
    searchText,
    setSearchText,
    form,
    openCreate,
    openEdit,
    closeModal,
    handleSubmit,
    handleDelete,
    fetchData,
  }
}
