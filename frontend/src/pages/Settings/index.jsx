import { useCallback, useEffect, useState } from 'react'
import { SaveOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, Form, InputNumber, Select, Spin, message } from 'antd'
import PageHeader from '../../components/Common/PageHeader'
import { getSchedulingSettings, updateSchedulingSettings } from '../../services/api'

const PERIOD_OPTIONS = Array.from({ length: 15 }, (_, index) => ({
  value: index + 1,
  label: `Tiết ${index + 1}`,
}))

const DAY_OPTIONS = [
  { value: 2, label: 'Thứ 2' },
  { value: 3, label: 'Thứ 3' },
  { value: 4, label: 'Thứ 4' },
  { value: 5, label: 'Thứ 5' },
  { value: 6, label: 'Thứ 6' },
  { value: 7, label: 'Thứ 7' },
]

function SystemSettings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getSchedulingSettings()
      const config = result.data || {}
      form.setFieldsValue({
        shift_duration: config.shift_duration,
        allowed_start_periods: config.allowed_start_periods,
        allowed_days: config.allowed_days,
        evening_start_periods: config.evening_start_periods,
      })
    } catch {
      // Error handled by axios interceptor
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await updateSchedulingSettings(values)
      message.success('Đã lưu cấu hình hệ thống')
      fetchSettings()
    } catch (error) {
      if (error?.errorFields) return
    } finally {
      setSaving(false)
    }
  }

  return (
    <Spin spinning={loading}>
      <PageHeader
        title="Cấu hình hệ thống"
        subtitle="Thiết lập ràng buộc xếp lịch AI (ca học, ngày, tiết) — áp dụng toàn hệ thống."
        actions={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            Lưu cấu hình
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        icon={<SettingOutlined />}
        message="Cấu hình xếp lịch"
        description="Ca học, ngày và tiết bắt đầu dùng cho thuật toán CP-SAT. Trần ghép lớp LT/TH/ONLINE được đặt khi sinh lớp học phần."
        style={{ marginBottom: 16 }}
      />

      <Card title="Tham số xếp lịch" className="settings-card">
        <Form form={form} layout="vertical" requiredMark="optional">
          <div className="ai-settings-row-pair ai-settings-row-pair--page">
            <Form.Item
              name="shift_duration"
              label="Thời lượng 1 ca học (Số tiết)"
              rules={[
                { required: true, message: 'Vui lòng nhập số tiết/ca' },
                { type: 'number', min: 1, max: 6, message: 'Ca học từ 1 đến 6 tiết' },
              ]}
              tooltip="Mỗi buổi học trên TKB phải khớp đúng số tiết này (QĐ 1062: mặc định 3 tiết/ca)."
            >
              <InputNumber min={1} max={6} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="evening_start_periods"
              label="Tiết ca tối / E-learning"
              rules={[{ required: true, message: 'Vui lòng chọn tiết ca tối' }]}
              getValueProps={(value) => ({
                value: Array.isArray(value) && value.length ? value[0] : (value ?? null),
              })}
              normalize={(value) => (value == null || value === '' ? [] : [Number(value)])}
            >
              <Select options={PERIOD_OPTIONS} placeholder="Chọn tiết" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item
            name="allowed_start_periods"
            label="Tiết bắt đầu hợp lệ (Ca học)"
            rules={[{ required: true, message: 'Vui lòng chọn ít nhất một tiết' }]}
            tooltip="Các mốc tiết được phép bắt đầu ca (VD: 1, 4, 7, 10, 13 cho ca 3 tiết)."
          >
            <Checkbox.Group
              options={PERIOD_OPTIONS}
              className="ai-checkbox-grid ai-checkbox-grid--periods"
            />
          </Form.Item>

          <Form.Item
            name="allowed_days"
            label="Ngày học trong tuần"
            rules={[{ required: true, message: 'Vui lòng chọn ít nhất một ngày' }]}
            tooltip="Thứ trong tuần được phép xếp lịch (2 = Thứ 2 … 7 = Thứ 7)."
          >
            <Checkbox.Group
              options={DAY_OPTIONS}
              className="ai-checkbox-grid ai-checkbox-grid--days"
            />
          </Form.Item>

        </Form>
      </Card>
    </Spin>
  )
}

export default SystemSettings
