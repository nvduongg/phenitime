const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')
const { getCapacityForRoomType } = require('../src/constants/roomTypes')

const DATA_DIR = path.resolve(__dirname, '../../data')
const OUTPUT_FILE = path.resolve(
  __dirname,
  '../../frontend/public/templates/phong-hoc-tu-csv.xlsx',
)

const HEADER_ALIASES = {
  roomId: ['phòng học', 'room học', 'room_id', 'room', 'phong hoc'],
  capacity: ['số sv dự kiến', 'số lượng', 'capacity', 'sĩ số', 'so sv du kien'],
  classType: ['hình thức học', 'class_type', 'class type', 'hinh thuc hoc'],
}

const TYPE_PRIORITY = {
  ONLINE: 100,
  BV: 80,
  DN: 80,
  XT: 80,
  SB: 80,
  TN: 70,
  PM: 60,
  LT: 10,
}

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeText(value) {
  return stripDiacritics(value).trim().toLowerCase().replace(/\s+/g, ' ')
}

function isEmptyCell(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function parseNumber(value) {
  if (isEmptyCell(value)) return null
  const parsed = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function readSheetRows(filePath) {
  const csvText = fs.readFileSync(filePath, 'utf8')
  const workbook = xlsx.read(csvText, { type: 'string', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const worksheet = workbook.Sheets[sheetName]
  return xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) =>
    row.some((cell) => HEADER_ALIASES.roomId.includes(normalizeText(cell))),
  )
}

function findColumnIndex(headerRow, aliases) {
  const normalizedAliases = aliases.map((alias) => normalizeText(alias))
  return headerRow.findIndex((cell) => normalizedAliases.includes(normalizeText(cell)))
}

function inferRoomType(roomText, classType) {
  const raw = normalizeText(roomText)
  const rawClassType = normalizeText(classType)

  if (!raw || raw.includes('online') || rawClassType.includes('eln') || rawClassType.includes('online')) {
    return 'ONLINE'
  }

  if (/\b(bv|benh vien|bệnh viện)\b/.test(raw)) return 'BV'
  if (/\b(doanh nghiep|doanh nghiệp|cong ty|công ty)\b/.test(raw)) return 'DN'
  if (/\b(xuong|xưởng)\b/.test(raw)) return 'XT'
  if (/\b(san bai|sân bãi|nha the chat|nhà thể chất)\b/.test(raw)) return 'SB'
  if (/\b(thi nghiem|thí nghiệm|nghien cuu|nghiên cứu|lab)\b/.test(raw)) return 'TN'
  if (/\b(pc|phong may tinh|phòng máy tính|computer)\b/.test(raw)) return 'PM'

  const suffixMatch = String(roomText || '').match(/\(([^)]+)\)\s*$/)
  if (suffixMatch) {
    const suffix = normalizeText(suffixMatch[1]).toUpperCase()
    if (suffix === 'PC') return 'PM'
    if (suffix === 'LAB') return 'TN'
    if (suffix === 'TH') return 'PM'
    if (suffix === 'ONLINE') return 'ONLINE'
    if (suffix === 'BV') return 'BV'
    if (suffix === 'DN') return 'DN'
    if (suffix === 'XT') return 'XT'
    if (suffix === 'SB') return 'SB'
    if (suffix === 'TN') return 'TN'
  }

  return 'LT'
}

function normalizeRoomId(roomText, roomType) {
  const text = String(roomText || '').trim()
  if (!text) {
    return roomType === 'ONLINE' ? 'ONLINE' : ''
  }

  if (roomType === 'ONLINE' || normalizeText(text).includes('online')) {
    return 'ONLINE'
  }

  return text
    .replace(/\s*\(([^)]+)\)\s*$/u, '')
    .replace(/\s*-\s*elearning\s*$/iu, '')
    .trim()
}

function mergeRoom(existing, next) {
  if (!existing) return next

  const existingPriority = TYPE_PRIORITY[existing.room_type] || 0
  const nextPriority = TYPE_PRIORITY[next.room_type] || 0

  return {
    room_id: existing.room_id || next.room_id,
    room_type: nextPriority >= existingPriority ? next.room_type : existing.room_type,
    capacity: Math.max(existing.capacity || 0, next.capacity || 0),
  }
}

function extractRoomsFromFile(filePath) {
  const rows = readSheetRows(filePath)
  const headerIndex = findHeaderIndex(rows)

  if (headerIndex === -1) return []

  const headerRow = rows[headerIndex]
  const roomIndex = findColumnIndex(headerRow, HEADER_ALIASES.roomId)
  const capacityIndex = findColumnIndex(headerRow, HEADER_ALIASES.capacity)
  const classTypeIndex = findColumnIndex(headerRow, HEADER_ALIASES.classType)

  if (roomIndex === -1) return []

  const rooms = []

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row) || row.every(isEmptyCell)) continue

    const roomText = row[roomIndex]
    const classType = classTypeIndex >= 0 ? row[classTypeIndex] : ''
    const expectedSize = capacityIndex >= 0 ? parseNumber(row[capacityIndex]) : null

    const roomType = inferRoomType(roomText, classType)
    const roomId = normalizeRoomId(roomText, roomType)

    if (!roomId) continue

    const capacity = roomType === 'ONLINE'
      ? 9999
      : Math.max(expectedSize || 0, getCapacityForRoomType(roomType))

    rooms.push({
      room_id: roomId,
      room_type: roomType,
      capacity,
    })
  }

  return rooms
}

function collectRooms() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((fileName) => fileName.toLowerCase().endsWith('.csv'))
    .map((fileName) => path.join(DATA_DIR, fileName))

  const roomMap = new Map()

  files.forEach((filePath) => {
    extractRoomsFromFile(filePath).forEach((room) => {
      const current = roomMap.get(room.room_id)
      roomMap.set(room.room_id, mergeRoom(current, room))
    })
  })

  return [...roomMap.values()].sort((left, right) =>
    left.room_id.localeCompare(right.room_id, 'vi'),
  )
}

function writeWorkbook(rooms, outputFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })

  const workbook = xlsx.utils.book_new()
  const worksheet = xlsx.utils.json_to_sheet(
    rooms.map((room) => ({
      'Mã phòng': room.room_id,
      'Sức chứa': room.capacity,
      'Loại phòng': room.room_type,
    })),
  )

  worksheet['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }]
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Dữ liệu')
  xlsx.writeFile(workbook, outputFile)
}

function main() {
  const rooms = collectRooms()
  writeWorkbook(rooms, OUTPUT_FILE)

  console.log(`Da trich xuat ${rooms.length} phong hoc`)
  console.log(`File dau ra: ${OUTPUT_FILE}`)
}

main()