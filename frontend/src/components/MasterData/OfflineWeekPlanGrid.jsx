import { InputNumber } from 'antd'
import {
  formatWeeklyCountsToPlan,
  parseToWeeklyCounts,
  sumWeeklyCounts,
} from '../../constants/offlineSchedule'

const DEFAULT_MAX_WEEKS = 10

function OfflineWeekPlanGrid({ value = '', onChange, maxWeeks = DEFAULT_MAX_WEEKS }) {
  const counts = parseToWeeklyCounts(value, maxWeeks)

  const handleChange = (weekIndex, nextCount) => {
    const next = [...counts]
    next[weekIndex] = Math.max(0, Number(nextCount) || 0)
    onChange?.(formatWeeklyCountsToPlan(next))
  }

  return (
    <div className="offline-week-grid">
      {counts.map((count, index) => (
        <div key={index} className="offline-week-grid__cell">
          <span className="offline-week-grid__label">T{index + 1}</span>
          <InputNumber
            min={0}
            max={4}
            step={1}
            size="small"
            value={count}
            onChange={(next) => handleChange(index, next)}
          />
        </div>
      ))}
      <div className="offline-week-grid__total">
        Tổng: {sumWeeklyCounts(counts)} buổi
      </div>
    </div>
  )
}

export default OfflineWeekPlanGrid
