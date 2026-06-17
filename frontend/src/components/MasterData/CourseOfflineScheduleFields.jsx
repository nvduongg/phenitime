import { Form, Input, InputNumber, Select, Typography } from 'antd'
import { normalizeDeliveryChannel } from '../../constants/deliveryChannels'
import OfflineWeekPlanGrid from './OfflineWeekPlanGrid'
import {
  OFFLINE_WEEK_RHYTHMS,
  OFFLINE_WEEK_RHYTHM_OPTIONS,
  courseSupportsOfflineConfig,
  formatOfflineSchedulePreview,
  parseToWeeklyCounts,
  sumWeeklyCounts,
} from '../../constants/offlineSchedule'

function OfflineWeekPlanField({ value, onChange }) {
  const form = Form.useFormInstance()

  const handleChange = (planText) => {
    onChange?.(planText)
    const total = sumWeeklyCounts(parseToWeeklyCounts(planText))
    form.setFieldValue('offline_session_count', total > 0 ? total : undefined)
  }

  return <OfflineWeekPlanGrid value={value} onChange={handleChange} />
}

function CourseOfflineScheduleFields({ form }) {
  const classType = Form.useWatch('class_type', form)
  const practiceCredits = Form.useWatch('practice_credits', form)
  const sessionCount = Form.useWatch('offline_session_count', form)
  const periodsPerSession = Form.useWatch('offline_periods_per_session', form)
  const weekRhythm = Form.useWatch('offline_week_rhythm', form)
  const weekInterval = Form.useWatch('offline_week_interval', form)
  const activeWeeks = Form.useWatch('offline_active_weeks', form)

  const visible = courseSupportsOfflineConfig(classType, practiceCredits)
  if (!visible) {
    return null
  }

  const preview = formatOfflineSchedulePreview({
    offline_session_count: sessionCount,
    offline_periods_per_session: periodsPerSession,
    offline_week_rhythm: weekRhythm,
    offline_week_interval: weekInterval,
    offline_active_weeks: activeWeeks,
  })

  const channel = normalizeDeliveryChannel(classType)
  const isOnlineWithOffline = channel === 'COURSERA' || channel === 'ELEARNING'
  const requiresSessions = isOnlineWithOffline && Number(practiceCredits) > 0
  const isCustomPlan = weekRhythm === OFFLINE_WEEK_RHYTHMS.CUSTOM

  const applyPlan = (planText) => {
    const total = sumWeeklyCounts(parseToWeeklyCounts(planText))
    form.setFieldsValue({
      offline_active_weeks: planText,
      offline_session_count: total > 0 ? total : undefined,
    })
  }

  return (
    <div className="course-offline-panel">
      <Typography.Text className="course-offline-panel__title" strong>
        Buổi gặp mặt offline
      </Typography.Text>
      <Typography.Paragraph className="course-offline-panel__hint" type="secondary">
        E-learning / Coursera: chọn <strong>Kế hoạch chi tiết</strong>, nhập số buổi từng tuần (T1–T10).
        Mỗi ô = số buổi gặp mặt trong tuần đó (0 = không học offline).
      </Typography.Paragraph>

      <div className="course-offline-panel__grid">
        <Form.Item
          name="offline_periods_per_session"
          label="Tiết/buổi"
          initialValue={3}
        >
          <InputNumber min={1} max={6} step={1} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="offline_week_rhythm"
          label="Nhịp tuần"
          initialValue={OFFLINE_WEEK_RHYTHMS.WEEKLY}
        >
          <Select options={OFFLINE_WEEK_RHYTHM_OPTIONS} />
        </Form.Item>

        {!isCustomPlan ? (
          <Form.Item
            name="offline_session_count"
            label="Số buổi"
            rules={requiresSessions ? [{ required: true, message: 'Nhập số buổi offline' }] : []}
          >
            <InputNumber min={1} max={30} step={1} placeholder="VD: 10" style={{ width: '100%' }} />
          </Form.Item>
        ) : (
          <Form.Item name="offline_session_count" hidden>
            <InputNumber />
          </Form.Item>
        )}

        {weekRhythm === OFFLINE_WEEK_RHYTHMS.EVERY_N ? (
          <Form.Item
            name="offline_week_interval"
            label="Cách N tuần"
            initialValue={2}
            rules={[{ required: true, message: 'Nhập N' }]}
          >
            <InputNumber min={2} max={8} step={1} style={{ width: '100%' }} />
          </Form.Item>
        ) : null}
      </div>

      {isCustomPlan ? (
        <>
          <Form.Item
            name="offline_active_weeks"
            label="Số buổi theo tuần"
            rules={[
              {
                validator: (_, planText) => {
                  const total = sumWeeklyCounts(parseToWeeklyCounts(planText))
                  return total > 0
                    ? Promise.resolve()
                    : Promise.reject(new Error('Nhập ít nhất 1 buổi offline'))
                },
              },
            ]}
          >
            <OfflineWeekPlanField />
          </Form.Item>
          <div className="course-offline-panel__advanced">
            <Typography.Text type="secondary" className="course-offline-panel__advanced-label">
              Cú pháp (tùy chọn)
            </Typography.Text>
            <Input
              value={activeWeeks || ''}
              placeholder="2, 3, 4:2, 5:2, 6, 7, 8:2"
              onChange={(event) => applyPlan(event.target.value)}
            />
            <Typography.Text type="secondary" className="course-offline-panel__advanced-hint">
              TA3: tuần 2→8 lần lượt 1,1,2,2,1,1,2 buổi · TA nâng cao: 2-8:2, 9
            </Typography.Text>
          </div>
        </>
      ) : null}

      <Typography.Text className="course-offline-panel__preview" type="secondary">
        {preview}
      </Typography.Text>
    </div>
  )
}

export default CourseOfflineScheduleFields
