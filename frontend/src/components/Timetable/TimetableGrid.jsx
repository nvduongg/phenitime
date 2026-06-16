import { Fragment, useState } from 'react'
import { Card, Empty, Tag, Tooltip } from 'antd'
import {
  TIMETABLE_DAYS,
  TIMETABLE_SHIFTS,
  buildGridLookup,
  getDayLabel,
} from '../../utils/timetableGrid'
import { DRAG_MIME } from '../../utils/timetableManualSchedule'

function TimetableEventCard({ event }) {
  return (
    <Tooltip
      title={
        <div className="timetable-event-tooltip">
          <div>{event.section_id}</div>
          {event.course_name ? <div>{event.course_name}</div> : null}
          {event.course_id ? <div>Mã HP: {event.course_id}</div> : null}
          {event.lecturer_name ? <div>GV: {event.lecturer_name}</div> : null}
          {event.student_group_labels?.length ? (
            <div>Nhóm: {event.student_group_labels.join(', ')}</div>
          ) : null}
        </div>
      }
    >
      <div className="timetable-event-card">
        <div className="timetable-event-card__title">{event.section_id}</div>
        <div className="timetable-event-card__meta">
          {event.room_id ? (
            <Tag color="green" className="timetable-event-card__room">
              {event.room_id}
            </Tag>
          ) : (
            <Tag>Không phòng</Tag>
          )}
        </div>
        {event.lecturer_id ? (
          <div className="timetable-event-card__lecturer">{event.lecturer_id}</div>
        ) : null}
      </div>
    </Tooltip>
  )
}

function TimetableGrid({
  events,
  dropEnabled = false,
  onDropOnCell,
}) {
  const lookup = buildGridLookup(events)
  const hasEvents = events.length > 0
  const [hoverCell, setHoverCell] = useState(null)

  const handleDragOver = (event, cellKey) => {
    if (!dropEnabled) return
    const types = [...event.dataTransfer.types]
    if (!types.includes(DRAG_MIME) && !types.includes('text/plain')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setHoverCell(cellKey)
  }

  const handleDragLeave = () => {
    setHoverCell(null)
  }

  const handleDrop = (event, day, shift) => {
    if (!dropEnabled || !onDropOnCell) return
    event.preventDefault()
    setHoverCell(null)

    const raw = event.dataTransfer.getData(DRAG_MIME)
    if (!raw) return

    try {
      const payload = JSON.parse(raw)
      onDropOnCell({
        dragItem: payload,
        day,
        shiftKey: shift.key,
        startPeriod: shift.startPeriod,
      })
    } catch {
      // ignore invalid payload
    }
  }

  if (!hasEvents && !dropEnabled) {
    return (
      <Card className="timetable-grid-card" bordered={false}>
        <Empty description="Không có buổi học phù hợp bộ lọc hiện tại" />
      </Card>
    )
  }

  return (
    <Card className="timetable-grid-card" bordered={false}>
      {dropEnabled ? (
        <div className="timetable-grid-drop-hint">
          Kéo buổi từ danh sách bên trái và thả vào ô Thứ × Ca (trống hoặc có lịch)
        </div>
      ) : null}
      <div className="timetable-grid-scroll">
        <div className="timetable-grid">
        <div className="timetable-grid__head timetable-grid__head--corner">Ca / Thứ</div>
        {TIMETABLE_DAYS.map((day) => (
          <div key={day} className="timetable-grid__head">
            {getDayLabel(day)}
          </div>
        ))}

        {TIMETABLE_SHIFTS.map((shift) => (
          <Fragment key={shift.key}>
            <div className="timetable-grid__shift">
              <strong>{shift.label}</strong>
              <span>{shift.subtitle}</span>
            </div>
            {TIMETABLE_DAYS.map((day) => {
              const cellKey = `${shift.key}-${day}`
              const cellEvents = lookup[cellKey] || []
              const isHover = hoverCell === cellKey
              const cellClass = [
                'timetable-grid__cell',
                dropEnabled ? 'timetable-grid__cell--droppable' : '',
                isHover ? 'timetable-grid__cell--drop-hover' : '',
              ].filter(Boolean).join(' ')

              return (
                <div
                  key={cellKey}
                  className={cellClass}
                  onDragOver={(event) => handleDragOver(event, cellKey)}
                  onDragLeave={handleDragLeave}
                  onDrop={(event) => handleDrop(event, day, shift)}
                >
                  {cellEvents.length ? (
                    <div className="timetable-grid__stack">
                      {cellEvents.map((event) => (
                        <TimetableEventCard key={event.id} event={event} />
                      ))}
                    </div>
                  ) : (
                    <span className="timetable-grid__empty">
                      {dropEnabled ? 'Thả vào đây' : '—'}
                    </span>
                  )}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
      </div>
    </Card>
  )
}

export default TimetableGrid
