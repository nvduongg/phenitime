import { Tag } from 'antd'

export const SECTIONING_TEMPLATE_OPTIONS = [
  { value: 'STANDARD', label: 'Đại trà (STANDARD)' },
  { value: 'LAB_COUPLED', label: 'Lab tích hợp IT (LAB_COUPLED)' },
  { value: 'ONLINE', label: 'Trực tuyến (ONLINE)' },
  { value: 'MEDICAL_CLINIC', label: 'Y khoa / lâm sàng (MEDICAL_CLINIC)' },
  { value: 'SPECIAL', label: 'Đồ án / TT / KL — không sinh lớp tự động (SPECIAL)' },
]

const TEMPLATE_META = {
  STANDARD: { color: 'blue', label: 'Đại trà' },
  LAB_COUPLED: { color: 'green', label: 'Lab tích hợp' },
  ONLINE: { color: 'geekblue', label: 'Trực tuyến' },
  MEDICAL_CLINIC: { color: 'purple', label: 'Y khoa' },
  SPECIAL: { color: 'orange', label: 'Đồ án/Thực tập' },
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
