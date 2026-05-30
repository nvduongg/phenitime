import { useEffect, useMemo } from 'react'
import { Alert, Form, Modal, Select } from 'antd'
import { getDayLabel } from '../../utils/timetableGrid'
import { getShiftFromCell } from '../../utils/timetableManualSchedule'

function TimetableDropConfirmModal({
  open,
  dropTarget,
  dragItem,
  section,
  roomOptions,
  validation,
  submitting,
  activeRoomFilter,
  onCancel,
  onConfirm,
}) {
  const [form] = Form.useForm()
  const selectedRoomId = Form.useWatch('room_id', form)
  const shift = dropTarget ? getShiftFromCell(dropTarget.shiftKey) : null

  const defaultRoom = useMemo(() => {
    if (!roomOptions.length) return undefined
    const recommended = roomOptions.find((room) => room.recommended)
    return recommended?.room_id || roomOptions[0]?.room_id
  }, [roomOptions])

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({ room_id: defaultRoom })
  }, [open, defaultRoom, form])

  const hasErrors = validation?.errors?.length > 0

  return (
    <Modal
      title="Xếp buổi học vào lưới"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="Lưu buổi học"
      cancelText="Hủy"
      confirmLoading={submitting}
      okButtonProps={{ disabled: hasErrors }}
      destroyOnHidden
      width={480}
    >
      {dropTarget && shift ? (
        <p className="timetable-drop-modal__summary">
          <strong>{dragItem?.section_id}</strong>
          {' — '}
          {getDayLabel(dropTarget.day)}, {shift.label} (tiết {shift.startPeriod}–
          {shift.startPeriod + 2})
        </p>
      ) : null}

      {validation?.errors?.map((text) => (
        <Alert key={text} type="error" showIcon message={text} style={{ marginBottom: 8 }} />
      ))}
      {validation?.warnings?.map((text) => (
        <Alert key={text} type="warning" showIcon message={text} style={{ marginBottom: 8 }} />
      ))}

      {activeRoomFilter &&
      selectedRoomId &&
      selectedRoomId !== activeRoomFilter ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={`Đang lọc phòng ${activeRoomFilter}`}
          description="Chọn đúng phòng đang lọc để buổi học hiển thị cùng các lớp khác trên lưới."
        />
      ) : null}

      <Form form={form} layout="vertical" onFinish={onConfirm}>
        <Form.Item
          name="room_id"
          label="Phòng học"
          rules={[{ required: true, message: 'Chọn phòng học' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Chọn phòng phù hợp (PM/PC/LT…)"
            options={roomOptions.map((room) => ({
              value: room.room_id,
              label: `${room.room_id} (${room.room_type}, ${room.capacity} chỗ)`,
            }))}
          />
        </Form.Item>
      </Form>

      {section?.lecturer_id ? (
        <p className="timetable-drop-modal__meta">
          GV: {section.lecturer?.lecturer_name || section.lecturer_id} ({section.lecturer_id})
        </p>
      ) : null}
    </Modal>
  )
}

export default TimetableDropConfirmModal
