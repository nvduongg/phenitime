export const DEFAULT_TABLE_SCROLL_Y = undefined

/** CSS class: bật scroll ngang + hiển thị đầy đủ nội dung cột (không cắt ellipsis). */
export const TABLE_SCROLL_CLASS = 'app-table-scroll'

export function getTableScroll(x = 'max-content') {
  const scroll = { x }
  if (DEFAULT_TABLE_SCROLL_Y !== undefined) {
    scroll.y = DEFAULT_TABLE_SCROLL_Y
  }
  return scroll
}
