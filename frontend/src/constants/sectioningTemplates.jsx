import { Tag } from 'antd'

export const SECTIONING_TEMPLATE_OPTIONS = [
  { value: 'STANDARD', label: 'Đại trà (STANDARD)' },
  { value: 'LAB_COUPLED', label: 'Lab IT (LAB_COUPLED)' },
  { value: 'ONLINE', label: 'Online (ONLINE)' },
  { value: 'MEDICAL_CLINIC', label: 'Lâm sàng (MEDICAL_CLINIC)' },
  { value: 'SPECIAL', label: 'ĐA/TT/KL (SPECIAL)' },
]

const TEMPLATE_META = {
  STANDARD: { color: 'blue', label: 'Đại trà' },
  LAB_COUPLED: { color: 'green', label: 'Lab IT' },
  ONLINE: { color: 'geekblue', label: 'Online' },
  MEDICAL_CLINIC: { color: 'purple', label: 'Lâm sàng' },
  SPECIAL: { color: 'orange', label: 'ĐA/TT/KL' },
}

export function formatSectioningTemplate(code) {
  const normalized = String(code ?? 'STANDARD').trim().toUpperCase()
  return TEMPLATE_META[normalized]?.label || normalized
}

export function renderSectioningTemplateTag(code) {
  const normalized = String(code ?? 'STANDARD').trim().toUpperCase()
  const meta = TEMPLATE_META[normalized] || { color: 'default', label: normalized }
  return <Tag color={meta.color}>{meta.label}</Tag>
}
