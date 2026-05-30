import { FileExcelOutlined } from '@ant-design/icons'
import { Button } from 'antd'

function ImportToolbarActions({ onImportClick }) {
  return (
    <Button size="middle" icon={<FileExcelOutlined />} onClick={onImportClick}>
      Nhập Excel
    </Button>
  )
}

export default ImportToolbarActions
