export const DEFAULT_TABLE_SCROLL_Y = 500

/** CSS class: bật scroll ngang + hiển thị đầy đủ nội dung cột (không cắt ellipsis). */
export const TABLE_SCROLL_CLASS = 'app-table-scroll'

export function getTableScroll(x = 'max-content') {
  return { x, y: DEFAULT_TABLE_SCROLL_Y }
}
