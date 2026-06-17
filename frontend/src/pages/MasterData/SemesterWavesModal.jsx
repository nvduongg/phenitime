import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import { PlusOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { DEFAULT_TEACHING_WEEKS } from '../../utils/semesterDates'
import { suggestWavesFromCohorts } from '../../utils/semesterWaves'
import { getCohorts, getSchedulingSettings, getSemesterWaves, replaceSemesterWaves } from '../../services/api'
import { formatCohortLabel } from '../../utils/formatters'

function SemesterWavesModal({ open, semester, onClose }) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cohortOptions, setCohortOptions] = useState([])
  const [cohortIds, setCohortIds] = useState([])
  const [teachingWeeks, setTeachingWeeks] = useState(DEFAULT_TEACHING_WEEKS)

  useEffect(() => {
    getCohorts()
      .then((result) => {
        const rows = result.data || []
        setCohortIds(rows.map((cohort) => cohort.cohort_id).filter(Boolean))
        setCohortOptions(
          rows
            .map((cohort) => ({
              value: cohort.cohort_id,
              label: formatCohortLabel(cohort),
            }))
            .sort((a, b) => b.value.localeCompare(a.value, 'vi')),
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    getSchedulingSettings()
      .then((result) => {
        const weeks = Number(result.data?.max_teaching_weeks)
        if (weeks > 0) setTeachingWeeks(weeks)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open || !semester?.semester_id) {
      return
    }

    setLoading(true)
    getSemesterWaves(semester.semester_id)
      .then((result) => {
        const waves = result.data || []
        form.setFieldsValue({
          waves: waves.map((wave) => ({
            wave_order: wave.wave_order,
            wave_name: wave.wave_name,
            start_week: wave.start_week,
            cohort_ids: wave.cohort_ids || [],
          })),
        })
      })
      .catch(() => {
        form.setFieldsValue({ waves: [] })
      })
      .finally(() => setLoading(false))
  }, [open, semester, form])

  const handleSuggestWaves = () => {
    if (!cohortIds.length) {
      message.warning('Chưa có niên khóa trong hệ thống — thêm niên khóa trước.')
      return
    }

    const suggested = suggestWavesFromCohorts(cohortIds, teachingWeeks)
    form.setFieldsValue({ waves: suggested })
    message.info(
      `Đã gợi ý ${suggested.length} đợt (mỗi niên khóa 1 đợt, lệch ~${Math.ceil(teachingWeeks / 2)} tuần/HK). `
      + 'Bạn có thể gộp niên khóa vào cùng đợt trước khi lưu.',
    )
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await replaceSemesterWaves(semester.semester_id, values.waves || [])
      message.success('Đã lưu cấu hình đợt xếp lịch')
      onClose(true)
    } catch (error) {
      if (error?.errorFields) return
    } finally {
      setSaving(false)
    }
  }

  const subtitle = useMemo(
    () => semester?.semester_name || semester?.semester_id || '',
    [semester],
  )

  return (
    <Modal
      open={open}
      title={`Đợt xếp lịch — ${subtitle}`}
      onCancel={() => onClose(false)}
      width={860}
      centered
      footer={[
        <Button key="cancel" onClick={() => onClose(false)}>
          Đóng
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
        >
          Lưu đợt
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary">
        Mỗi đợt gán niên khóa và tuần bắt đầu trong học kỳ. Khi xếp đợt sau, phòng đã bận từ
        TKB đợt trước sẽ được giữ chỗ theo tuần giao nhau.
      </Typography.Paragraph>

      <Form form={form} layout="vertical" disabled={loading} initialValues={{ waves: [] }}>
        <Form.List name="waves">
          {(fields, { add, remove }) => (
            <>
              <Table
                size="small"
                pagination={false}
                rowKey="key"
                locale={{ emptyText: 'Chưa có đợt — thêm thủ công hoặc dùng gợi ý bên dưới' }}
                dataSource={fields}
                columns={[
                  {
                    title: 'Thứ tự',
                    width: 80,
                    render: (_, field) => (
                      <Form.Item
                        name={[field.name, 'wave_order']}
                        rules={[{ required: true, message: 'Bắt buộc' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: 'Tên đợt',
                    width: 140,
                    render: (_, field) => (
                      <Form.Item
                        name={[field.name, 'wave_name']}
                        rules={[{ required: true, message: 'Bắt buộc' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="Đợt 1" />
                      </Form.Item>
                    ),
                  },
                  {
                    title: 'Tuần BĐ (HK)',
                    width: 120,
                    render: (_, field) => (
                      <Form.Item
                        name={[field.name, 'start_week']}
                        rules={[{ required: true, message: 'Bắt buộc' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    ),
                  },
                  {
                    title: 'Niên khóa',
                    render: (_, field) => (
                      <Form.Item
                        name={[field.name, 'cohort_ids']}
                        rules={[{ required: true, message: 'Chọn ít nhất 1 niên khóa' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="Chọn niên khóa"
                          options={cohortOptions}
                          maxTagCount="responsive"
                        />
                      </Form.Item>
                    ),
                  },
                  {
                    title: '',
                    width: 60,
                    render: (_, field) => (
                      <Button type="link" danger onClick={() => remove(field.name)}>
                        Xóa
                      </Button>
                    ),
                  },
                ]}
              />
              <Space wrap style={{ marginTop: 12 }}>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    add({
                      wave_order: fields.length + 1,
                      wave_name: `Đợt ${fields.length + 1}`,
                      start_week: 1,
                      cohort_ids: [],
                    })
                  }
                >
                  Thêm đợt
                </Button>
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={handleSuggestWaves}
                  disabled={!cohortIds.length}
                >
                  Gợi ý phân đợt
                </Button>
              </Space>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  )
}

export default SemesterWavesModal
