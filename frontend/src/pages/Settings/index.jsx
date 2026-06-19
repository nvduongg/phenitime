import { useCallback, useEffect, useState } from 'react'
import { SaveOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Spin, Switch, Tabs, message } from 'antd'
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

const ROOM_TYPE_OPTIONS = [
  ['LT', 'Giảng đường lý thuyết'],
  ['STD', 'Giảng đường đại trà'],
  ['PM', 'Phòng máy tính'],
  ['PC', 'PC lab'],
  ['TN', 'Phòng thí nghiệm'],
  ['SB', 'Sân bãi / Nhà thể chất'],
  ['XT', 'Xưởng thực hành'],
  ['BV', 'Bệnh viện'],
  ['MED', 'Phòng lâm sàng / Y khoa'],
  ['DN', 'Doanh nghiệp'],
  ['ONLINE', 'Trực tuyến'],
  ['TH', 'Thực hành legacy'],
  ['LAB', 'Lab legacy'],
]

const TEMPLATE_FIELDS = {
  STANDARD: [
    ['ltCap', 'Trần LT'],
    ['thCap', 'Trần TH'],
    ['ltRoom', 'Phòng LT'],
    ['thRoom', 'Phòng TH'],
  ],
  LAB_COUPLED: [
    ['syncCap', 'Trần lớp ghép LT+TH'],
    ['ltRoom', 'Phòng LT'],
    ['thRoom', 'Phòng TH'],
  ],
  ONLINE: [
    ['cap', 'Trần ONLINE'],
    ['room', 'Phòng ONLINE'],
  ],
  MEDICAL_CLINIC: [
    ['cap', 'Trần lâm sàng'],
    ['room', 'Phòng lâm sàng'],
  ],
}

const OFFLINE_RHYTHM_OPTIONS = [
  { value: 'WEEKLY', label: 'Mỗi tuần' },
  { value: 'BIWEEKLY', label: 'Cách tuần' },
  { value: 'EVERY_N', label: 'Cách N tuần' },
  { value: 'CUSTOM', label: 'Kế hoạch chi tiết' },
]

const DEFAULT_SETTINGS = {
  shift_duration: 3,
  max_teaching_weeks: 10,
  max_lecturer_shifts_per_day: 2,
  stretch_to_full_semester: true,
  min_shifts_for_stretch: 2,
  allowed_start_periods: [1, 4, 7, 10, 13],
  allowed_days: [2, 3, 4, 5, 6, 7],
  evening_start_periods: [13],
  default_lt_capacity: 80,
  default_th_capacity: 40,
  default_student_count: 100,
  default_eln_capacity: 800,
  default_cour_capacity: 240,
  import_defaults: {
    course_credits: 3,
    course_theory_credits: 0,
    course_practice_credits: 0,
    course_class_type: 'LT',
    course_room_type: 'LT',
    course_template_code: 'STANDARD',
    lecturer_max_quota: 15,
    course_section_capacity: 40,
  },
  offline_schedule_defaults: {
    periods_per_session: 3,
    week_rhythm: 'WEEKLY',
    week_interval: 2,
  },
  wave_suggestion: {
    name_prefix: 'Đợt',
    week_gap_ratio: 0.5,
    one_cohort_per_wave: true,
  },
}

function SystemSettings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getSchedulingSettings()
      form.setFieldsValue({ ...DEFAULT_SETTINGS, ...(result.data || {}) })
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
        message="Cấu hình hệ thống"
        description="Các giá trị vận hành bên dưới được lưu trong database, dùng chung cho sinh lớp, xếp lịch AI và kéo-thả TKB."
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical" requiredMark="optional">
        <Tabs
          items={[
            {
              key: 'scheduling',
              label: 'Xếp lịch',
              children: (
                <Card title="Tham số xếp lịch" className="settings-card">
                  <div className="settings-form-grid">
                    <Form.Item
                      name="shift_duration"
                      label="Thời lượng 1 ca học"
                      rules={[{ required: true, type: 'number', min: 1, max: 6 }]}
                    >
                      <InputNumber min={1} max={6} addonAfter="tiết" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="max_teaching_weeks"
                      label="Số tuần dạy tối đa"
                      rules={[{ required: true, type: 'number', min: 1, max: 30 }]}
                    >
                      <InputNumber min={1} max={30} addonAfter="tuần" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="max_lecturer_shifts_per_day"
                      label="Số ca GV/ngày"
                      rules={[{ required: true, type: 'number', min: 1, max: 6 }]}
                    >
                      <InputNumber min={1} max={6} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="min_shifts_for_stretch"
                      label="Ca tối thiểu để giãn lịch"
                      rules={[{ required: true, type: 'number', min: 1, max: 10 }]}
                    >
                      <InputNumber min={1} max={10} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="stretch_to_full_semester" label="Giãn lịch theo toàn học kỳ" valuePropName="checked">
                      <Switch />
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
                  <Form.Item name="allowed_start_periods" label="Tiết bắt đầu hợp lệ" rules={[{ required: true }]}>
                    <Checkbox.Group options={PERIOD_OPTIONS} className="ai-checkbox-grid ai-checkbox-grid--periods" />
                  </Form.Item>
                  <Form.Item name="allowed_days" label="Ngày học trong tuần" rules={[{ required: true }]}>
                    <Checkbox.Group options={DAY_OPTIONS} className="ai-checkbox-grid ai-checkbox-grid--days" />
                  </Form.Item>
                </Card>
              ),
            },
            {
              key: 'sectioning',
              label: 'Sinh lớp',
              children: (
                <Card title="Trần sinh lớp mặc định" className="settings-card">
                  <div className="settings-form-grid">
                    <Form.Item name="default_lt_capacity" label="Trần lớp LT" rules={[{ required: true, type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="default_th_capacity" label="Trần lớp TH/PM" rules={[{ required: true, type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="default_student_count" label="Sĩ số nhóm mặc định" rules={[{ required: true, type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="default_eln_capacity" label="Trần lớp ONLINE (ELN)" rules={[{ required: true, type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="default_cour_capacity" label="Trần track Coursera" rules={[{ required: true, type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                </Card>
              ),
            },
            {
              key: 'rooms',
              label: 'Loại phòng',
              children: (
                <Card title="Sức chứa mặc định theo loại phòng" className="settings-card">
                  <div className="settings-form-grid">
                    {ROOM_TYPE_OPTIONS.map(([roomType, label]) => (
                      <Form.Item
                        key={roomType}
                        name={['room_type_capacities', roomType]}
                        label={`${roomType} — ${label}`}
                        rules={[{ required: true, type: 'number', min: 1 }]}
                      >
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    ))}
                  </div>
                </Card>
              ),
            },
            {
              key: 'templates',
              label: 'Template sinh lớp',
              children: (
                <div className="settings-card-stack">
                  {Object.entries(TEMPLATE_FIELDS).map(([templateCode, fields]) => (
                    <Card key={templateCode} title={templateCode} className="settings-card">
                      <div className="settings-form-grid">
                        {fields.map(([field, label]) => (
                          <Form.Item
                            key={field}
                            name={['sectioning_templates', templateCode, field]}
                            label={label}
                            rules={[{ required: true }]}
                          >
                            {field.toLowerCase().includes('room') ? (
                              <Select
                                showSearch
                                optionFilterProp="label"
                                options={ROOM_TYPE_OPTIONS.map(([value, roomLabel]) => ({
                                  value,
                                  label: `${value} — ${roomLabel}`,
                                }))}
                              />
                            ) : (
                              <InputNumber min={1} style={{ width: '100%' }} />
                            )}
                          </Form.Item>
                        ))}
                      </div>
                    </Card>
                  ))}
                  <Card title="SPECIAL" className="settings-card">
                    <Form.Item
                      name={['sectioning_templates', 'SPECIAL', 'skipsAutoGenerate']}
                      label="Bỏ qua sinh lớp tự động"
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </Card>
                </div>
              ),
            },
            {
              key: 'solver',
              label: 'Solver',
              children: (
                <Card title="Chính sách solver" className="settings-card">
                  <div className="settings-form-grid">
                    <Form.Item name={['solver_policy', 'solver_max_time_seconds']} label="Thời gian solve chính" rules={[{ type: 'number', min: 10 }]}>
                      <InputNumber min={10} addonAfter="giây" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'solver_num_workers']} label="Số worker CP-SAT" rules={[{ type: 'number', min: 1, max: 32 }]}>
                      <InputNumber min={1} max={32} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'soft_capacity_ratio']} label="Tỷ lệ sức chứa relaxed" rules={[{ type: 'number', min: 0.1, max: 1 }]}>
                      <InputNumber min={0.1} max={1} step={0.05} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'relaxed_max_shifts_per_day']} label="Ca GV/ngày khi relaxed" rules={[{ type: 'number', min: 1, max: 6 }]}>
                      <InputNumber min={1} max={6} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'relaxation_max_time_seconds']} label="Thời gian relaxed pass" rules={[{ type: 'number', min: 10 }]}>
                      <InputNumber min={10} addonAfter="giây" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'lns_max_iterations']} label="Số vòng LNS" rules={[{ type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'lns_max_neighborhood']} label="Kích thước LNS" rules={[{ type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'lns_max_time_seconds']} label="Thời gian mỗi LNS" rules={[{ type: 'number', min: 10 }]}>
                      <InputNumber min={10} addonAfter="giây" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'virtual_room_capacity']} label="Sức chứa phòng ONLINE ảo" rules={[{ type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'enable_relaxation_pass']} label="Bật relaxed pass" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'enable_lns_pass']} label="Bật LNS repair" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name={['solver_policy', 'fixed_room_per_section']} label="Cố định phòng theo lớp" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </div>
                </Card>
              ),
            },
            {
              key: 'imports',
              label: 'Import',
              children: (
                <Card title="Mặc định khi file import thiếu cột" className="settings-card">
                  <div className="settings-form-grid">
                    <Form.Item name={['import_defaults', 'course_credits']} label="Tổng tín chỉ mặc định" rules={[{ type: 'number', min: 0 }]}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['import_defaults', 'course_theory_credits']} label="TC lý thuyết mặc định" rules={[{ type: 'number', min: 0 }]}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['import_defaults', 'course_practice_credits']} label="TC thực hành mặc định" rules={[{ type: 'number', min: 0 }]}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['import_defaults', 'course_class_type']} label="Hình thức học mặc định">
                      <Select
                        options={[
                          { value: 'LT', label: 'LT' },
                          { value: 'OFFLINE', label: 'OFFLINE' },
                          { value: 'ELEARNING', label: 'ELEARNING' },
                          { value: 'COURSERA', label: 'COURSERA' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name={['import_defaults', 'course_room_type']} label="Loại phòng mặc định">
                      <Select options={ROOM_TYPE_OPTIONS.map(([value, label]) => ({ value, label: `${value} — ${label}` }))} />
                    </Form.Item>
                    <Form.Item name={['import_defaults', 'course_template_code']} label="Template mặc định">
                      <Select
                        options={[
                          { value: 'STANDARD', label: 'STANDARD' },
                          { value: 'LAB_COUPLED', label: 'LAB_COUPLED' },
                          { value: 'ONLINE', label: 'ONLINE' },
                          { value: 'MEDICAL_CLINIC', label: 'MEDICAL_CLINIC' },
                          { value: 'SPECIAL', label: 'SPECIAL' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name={['import_defaults', 'lecturer_max_quota']} label="Định mức GV mặc định" rules={[{ type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['import_defaults', 'course_section_capacity']} label="Sĩ số LHP mặc định" rules={[{ type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                </Card>
              ),
            },
            {
              key: 'offline',
              label: 'Offline',
              children: (
                <Card title="Mặc định buổi offline" className="settings-card">
                  <div className="settings-form-grid">
                    <Form.Item name={['offline_schedule_defaults', 'periods_per_session']} label="Tiết/buổi mặc định" rules={[{ type: 'number', min: 1 }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['offline_schedule_defaults', 'week_rhythm']} label="Nhịp tuần mặc định">
                      <Select options={OFFLINE_RHYTHM_OPTIONS} />
                    </Form.Item>
                    <Form.Item name={['offline_schedule_defaults', 'week_interval']} label="Khoảng cách N tuần" rules={[{ type: 'number', min: 2 }]}>
                      <InputNumber min={2} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                </Card>
              ),
            },
            {
              key: 'waves',
              label: 'Gợi ý đợt',
              children: (
                <Card title="Mặc định gợi ý phân đợt" className="settings-card">
                  <div className="settings-form-grid">
                    <Form.Item name={['wave_suggestion', 'name_prefix']} label="Tiền tố tên đợt">
                      <Input placeholder="Đợt" />
                    </Form.Item>
                    <Form.Item name={['wave_suggestion', 'week_gap_ratio']} label="Tỷ lệ lệch tuần theo số tuần dạy" rules={[{ type: 'number', min: 0.1, max: 2 }]}>
                      <InputNumber min={0.1} max={2} step={0.05} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['wave_suggestion', 'one_cohort_per_wave']} label="Mỗi niên khóa một đợt" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </div>
                </Card>
              ),
            },
          ]}
        />
      </Form>
    </Spin>
  )
}

export default SystemSettings
