import { Tag, Typography } from 'antd'
import { HolderOutlined } from '@ant-design/icons'
import { DRAG_MIME, formatEventPartLabel } from '../../utils/timetableManualSchedule'

const { Text } = Typography

function UnscheduledDragCard({ item, section }) {
  const handleDragStart = (event) => {
    const payload = {
      event_id: item.event_id,
      section_id: item.section_id || section?.section_id,
      class_type: item.class_type || section?.class_type,
    }
    const serialized = JSON.stringify(payload)
    event.dataTransfer.setData(DRAG_MIME, serialized)
    event.dataTransfer.setData('text/plain', serialized)
    event.dataTransfer.effectAllowed = 'move'
    event.currentTarget.classList.add('is-dragging')
  }

  const handleDragEnd = (event) => {
    event.currentTarget.classList.remove('is-dragging')
  }

  const partLabel = formatEventPartLabel(item.event_id)
  const roomReq = section?.room_type_req || section?.course?.default_room_type || '—'

  return (
    <div
      className="unscheduled-drag-card"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      role="button"
      tabIndex={0}
      title="Kéo thả vào ô Thứ × Ca trên lưới TKB"
    >
      <HolderOutlined className="unscheduled-drag-card__handle" />
      <div className="unscheduled-drag-card__body">
        <div className="unscheduled-drag-card__title">{item.section_id}</div>
        <Text type="secondary" className="unscheduled-drag-card__meta">
          {item.event_id}
        </Text>
        <div className="unscheduled-drag-card__tags">
          <Tag color="blue">{partLabel}</Tag>
          <Tag>{item.class_type || 'LT'}</Tag>
          <Tag color="geekblue">{roomReq}</Tag>
          {section?.capacity ? (
            <Tag color="default">{section.capacity} SV</Tag>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function UnscheduledDragPanel({ items, sectionLookup }) {
  if (!items.length) {
    return null
  }

  return (
    <aside className="unscheduled-drag-panel">
      <div className="unscheduled-drag-panel__header">
        <Text strong>Buổi cần xếp tay ({items.length})</Text>
        <Text type="secondary" className="unscheduled-drag-panel__hint">
          Kéo thả vào ô trống trên lưới (Thứ × Ca)
        </Text>
      </div>
      <div className="unscheduled-drag-panel__list">
        {items.map((item) => (
          <UnscheduledDragCard
            key={item.event_id}
            item={item}
            section={sectionLookup.get(item.section_id)}
          />
        ))}
      </div>
    </aside>
  )
}

export default UnscheduledDragPanel
