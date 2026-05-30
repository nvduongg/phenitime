import { Tag } from 'antd'
import { CloudOutlined } from '@ant-design/icons'
import { resolveSectionClassType } from '../utils/sectionClassType'

export const LEARNING_MODES = {
  THEORY: ['LT'],
  PRACTICE: ['TH', 'PM', 'TN', 'SB', 'XT'],
  ONLINE: ['ONLINE', 'ELN', 'ELN0', 'ELEARNING', 'COURSERA', 'ONLINE_ELEARNING', 'ONLINE_COURSERA'],
  SPECIAL: ['DA', 'ĐA', 'KL', 'TT', 'DN', 'BV'],
}

export function normalizeLearningType(type) {
  return String(type ?? '').trim().toUpperCase()
}

export function getLearningMode(type) {
  const normalized = normalizeLearningType(type)

  if (LEARNING_MODES.THEORY.includes(normalized)) return 'THEORY'
  if (LEARNING_MODES.PRACTICE.includes(normalized)) return 'PRACTICE'
  if (LEARNING_MODES.ONLINE.includes(normalized)) return 'ONLINE'
  if (LEARNING_MODES.SPECIAL.includes(normalized)) return 'SPECIAL'

  return 'THEORY'
}

export function resolveSectionLearningMode(record) {
  const classType = normalizeLearningType(resolveSectionClassType(record))
  const roomType = normalizeLearningType(
    record?.room_type_req
      || record?.course?.default_room_type
      || record?.course?.room_type,
  )

  if (getLearningMode(classType) === 'SPECIAL') return 'SPECIAL'
  if (getLearningMode(roomType) === 'ONLINE' || getLearningMode(classType) === 'ONLINE') {
    return 'ONLINE'
  }
  if (getLearningMode(roomType) === 'SPECIAL') return 'SPECIAL'
  if (getLearningMode(roomType) === 'PRACTICE') return 'PRACTICE'

  return getLearningMode(classType) === 'PRACTICE' ? 'PRACTICE' : 'THEORY'
}

export function renderLearningModeTag(record) {
  const mode = resolveSectionLearningMode(record)
  const roomCode = normalizeLearningType(
    record?.room_type_req
      || record?.course?.default_room_type
      || record?.course?.room_type,
  )
  const classType = normalizeLearningType(record?.class_type)

  switch (mode) {
    case 'ONLINE':
      return (
        <Tag color="geekblue" icon={<CloudOutlined />}>
          Trực tuyến
        </Tag>
      )
    case 'PRACTICE':
      return (
        <Tag color="green">
          Thực hành/Phân nhóm{roomCode ? ` (${roomCode})` : ''}
        </Tag>
      )
    case 'SPECIAL':
      return <Tag color="purple">Đồ án/Thực tập</Tag>
    case 'THEORY':
    default:
      return (
        <Tag color="blue">
          Lý thuyết{classType && classType !== 'LT' ? ` (${classType})` : ''}
        </Tag>
      )
  }
}
