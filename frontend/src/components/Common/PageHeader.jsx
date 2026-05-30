import { useEffect } from 'react'
import { Flex, Space } from 'antd'
import { usePageMeta } from '../../contexts/PageMetaContext'

function PageHeader({ title, subtitle, filters, actions }) {
  const { setMeta } = usePageMeta()

  useEffect(() => {
    setMeta({ title: title || '' })
  }, [title, setMeta])

  const toolbar =
    filters || actions ? (
      <Flex
        className="page-toolbar"
        justify="space-between"
        align="flex-start"
        wrap="wrap"
        gap={16}
      >
        {filters ? (
          <Space size="middle" wrap className="page-toolbar-filters">
            {filters}
          </Space>
        ) : (
          <span />
        )}
        {actions ? (
          <Space size="middle" wrap className="page-toolbar-actions">
            {actions}
          </Space>
        ) : null}
      </Flex>
    ) : null

  if (!subtitle && !toolbar) {
    return null
  }

  return (
    <>
      {subtitle ? <p className="page-lead">{subtitle}</p> : null}
      {toolbar}
    </>
  )
}

export default PageHeader
