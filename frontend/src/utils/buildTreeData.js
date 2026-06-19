/**
 * Converts a flat list (id + parent_id) into a nested tree for antd Table / TreeSelect.
 */
export function buildTreeData(flatData, options = {}) {
  const {
    idKey = 'id',
    parentKey = 'parent_id',
    childrenKey = 'children',
    excludeIds = [],
    excludeNodes = [],
  } = options

  if (!flatData?.length) return []

  const isExcluded = (item) => {
    if (!item) return false
    return (
      excludeIds.includes(item[idKey]) ||
      excludeNodes.some((predicate) => predicate(item))
    )
  }

  const visibleItems = flatData.filter((item) => !isExcluded(item))
  const nodeMap = new Map()

  visibleItems.forEach((item) => {
    nodeMap.set(item[idKey], { ...item, [childrenKey]: [] })
  })

  const roots = []

  visibleItems.forEach((item) => {
    const node = nodeMap.get(item[idKey])
    const parentId = item[parentKey]
    const parentRecord = parentId
      ? flatData.find((candidate) => candidate[idKey] === parentId)
      : null

    if (!parentId || isExcluded(parentRecord)) {
      roots.push(node)
      return
    }

    const parentNode = nodeMap.get(parentId)
    if (parentNode) {
      parentNode[childrenKey].push(node)
    } else {
      roots.push(node)
    }
  })

  const pruneEmptyChildren = (nodes) =>
    nodes.map((node) => {
      const children = node[childrenKey]
      if (!children?.length) {
        const leaf = { ...node }
        delete leaf[childrenKey]
        return leaf
      }
      return { ...node, [childrenKey]: pruneEmptyChildren(children) }
    })

  return pruneEmptyChildren(roots)
}

export function toTreeSelectData(treeNodes, options = {}) {
  const {
    idKey = 'id',
    titleKey = 'title',
    childrenKey = 'children',
  } = options

  return treeNodes.map((node) => ({
    title: node[titleKey] ?? node.unit_name ?? node[idKey],
    value: node[idKey],
    children: node[childrenKey]?.length
      ? toTreeSelectData(node[childrenKey], { idKey, titleKey, childrenKey })
      : undefined,
  }))
}
