import * as XLSX from 'xlsx'

const sanitizeFilenamePart = (value) =>
  String(value ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

export const buildExportFilename = (prefix, { semesterId, suffix } = {}) => {
  const now = new Date()
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timeStamp = now.toTimeString().slice(0, 8).replace(/:/g, '')
  const semesterPart = semesterId ? sanitizeFilenamePart(semesterId) : 'Tat-ca'
  const suffixPart = suffix ? `-${sanitizeFilenamePart(suffix)}` : ''
  return `${prefix}-${semesterPart}${suffixPart}-${dateStamp}-${timeStamp}.xlsx`
}

const getCellValue = (row, col, rowIndex) => {
  const raw = col.exportValue ? col.exportValue(row, rowIndex) : row[col.dataIndex]
  return raw ?? ''
}

export const exportToExcel = (
  rows,
  columns,
  filename = 'export',
  { sheetName = 'Sheet1' } = {},
) => {
  const headerRow = columns.map((col) => col.title)
  const dataRows = rows.map((row, rowIndex) =>
    columns.map((col) => getCellValue(row, col, rowIndex)),
  )

  const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
  worksheet['!cols'] = columns.map((col) => {
    const maxLen = Math.max(
      String(col.title).length,
      ...rows.map((row, rowIndex) => String(getCellValue(row, col, rowIndex)).length),
    )
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))

  const normalizedFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(workbook, normalizedFilename)
}
