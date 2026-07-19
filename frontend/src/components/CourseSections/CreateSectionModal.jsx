import { useState } from 'react'
import { Modal, Form, Input, InputNumber, Select, message } from 'antd'
import { createCourseSection } from '../../services/api'

function CreateSectionModal({ open, onCancel, onSuccess, semesterId }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      
      const payload = {
        ...values,
        semester_id: semesterId
      }
      
      await createCourseSection(payload)
      message.success('Thêm lớp học phần thành công')
      form.resetFields()
      onSuccess()
    } catch (e) {
      if (e?.errorFields) return
      // API errors are handled by interceptor
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Thêm lớp học phần thủ công"
      open={open}
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      onOk={handleSubmit}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item 
          name="section_id" 
          label="Mã lớp học phần" 
          rules={[{ required: true, message: 'Vui lòng nhập mã lớp' }]}
        >
          <Input placeholder="Ví dụ: 2025_2026_3_IT001_01" />
        </Form.Item>
        <Form.Item 
          name="course_id" 
          label="Mã học phần" 
          rules={[{ required: true, message: 'Vui lòng nhập mã học phần' }]}
        >
          <Input placeholder="Ví dụ: IT001" />
        </Form.Item>
        <Form.Item 
          name="class_type" 
          label="Loại lớp (LT/TH/PM...)" 
          rules={[{ required: true, message: 'Vui lòng chọn loại lớp' }]}
        >
          <Select placeholder="Chọn loại lớp">
            <Select.Option value="LT">Lý thuyết (LT)</Select.Option>
            <Select.Option value="TH">Thực hành (TH)</Select.Option>
            <Select.Option value="PM">Phòng máy (PM)</Select.Option>
            <Select.Option value="BT">Bài tập (BT)</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item 
          name="capacity" 
          label="Sức chứa" 
          rules={[{ required: true, message: 'Vui lòng nhập sức chứa' }]}
          initialValue={80}
        >
          <InputNumber min={1} max={500} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateSectionModal
