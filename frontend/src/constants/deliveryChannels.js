export const DELIVERY_CHANNELS = {
  OFFLINE: 'OFFLINE',
  ELEARNING: 'ELEARNING',
  COURSERA: 'COURSERA',
  SPECIAL: 'SPECIAL',
}

const LEGACY_TO_CHANNEL = {
  LT: DELIVERY_CHANNELS.OFFLINE,
  TH: DELIVERY_CHANNELS.OFFLINE,
  FACE: DELIVERY_CHANNELS.OFFLINE,
  OFFLINE: DELIVERY_CHANNELS.OFFLINE,
  ONLINE: DELIVERY_CHANNELS.ELEARNING,
  ELN: DELIVERY_CHANNELS.ELEARNING,
  COUR: DELIVERY_CHANNELS.COURSERA,
  HYBRID: DELIVERY_CHANNELS.COURSERA,
  ONLINE_ELEARNING: DELIVERY_CHANNELS.ELEARNING,
  ONLINE_COURSERA: DELIVERY_CHANNELS.COURSERA,
  DA: DELIVERY_CHANNELS.SPECIAL,
  'ĐA': DELIVERY_CHANNELS.SPECIAL,
  TT: DELIVERY_CHANNELS.SPECIAL,
  KL: DELIVERY_CHANNELS.SPECIAL,
}

export const DELIVERY_CHANNEL_LABELS = {
  OFFLINE: 'Trực tiếp',
  FACE: 'Trực tiếp',
  ELEARNING: 'E-learning',
  COURSERA: 'Coursera',
  HYBRID: 'Coursera',
  SPECIAL: 'ĐA/TT/KL',
}

export const DELIVERY_CHANNEL_COLORS = {
  OFFLINE: 'geekblue',
  FACE: 'geekblue',
  ELEARNING: 'purple',
  COURSERA: 'magenta',
  HYBRID: 'magenta',
  SPECIAL: 'orange',
}

export const DELIVERY_CHANNEL_OPTIONS = [
  { value: DELIVERY_CHANNELS.OFFLINE, label: 'Trực tiếp (OFFLINE)' },
  { value: DELIVERY_CHANNELS.ELEARNING, label: 'E-learning (ELEARNING)' },
  { value: DELIVERY_CHANNELS.COURSERA, label: 'Coursera (COURSERA)' },
  { value: DELIVERY_CHANNELS.SPECIAL, label: 'ĐA/TT/KL (SPECIAL)' },
]

export function normalizeDeliveryChannel(value) {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return DELIVERY_CHANNELS.OFFLINE
  if (LEGACY_TO_CHANNEL[raw]) return LEGACY_TO_CHANNEL[raw]
  if (Object.values(DELIVERY_CHANNELS).includes(raw)) return raw
  return DELIVERY_CHANNELS.OFFLINE
}

export function formatDeliveryChannel(value) {
  const channel = normalizeDeliveryChannel(value)
  return DELIVERY_CHANNEL_LABELS[channel] || value || '—'
}

export function getDeliveryChannelColor(value) {
  const channel = normalizeDeliveryChannel(value)
  return DELIVERY_CHANNEL_COLORS[channel] || 'default'
}

/** Backward-compatible aliases for section-level class types in tables/export. */
export const CLASS_TYPE_LABELS = {
  ...DELIVERY_CHANNEL_LABELS,
  LT: 'Lý thuyết',
  TH: 'Thực hành',
  ELN: 'E-learning (ELN)',
  ELN0: 'E-learning (ELN)',
  COUR: 'Coursera (COUR)',
  ONLINE_ELEARNING: 'E-learning',
  ONLINE_COURSERA: 'Coursera',
  'ĐA': 'Đồ án',
  TT: 'Thực tập',
}

export const CLASS_TYPE_OPTIONS = DELIVERY_CHANNEL_OPTIONS

export function formatClassType(classType) {
  if (!classType) return '—'
  const channel = normalizeDeliveryChannel(classType)
  if (DELIVERY_CHANNEL_LABELS[channel]) {
    return DELIVERY_CHANNEL_LABELS[channel]
  }
  return CLASS_TYPE_LABELS[classType] || classType
}

export function getClassTypeColor(classType) {
  return getDeliveryChannelColor(classType)
}

export const VIRTUAL_CLASS_TYPES = new Set([
  'ELN',
  'ELN0',
  'COUR',
  'ELEARNING',
  'COURSERA',
  'ONLINE_ELEARNING',
  'ONLINE_COURSERA',
])
