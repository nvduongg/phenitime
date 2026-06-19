import { useEffect, useState } from 'react'
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { Button, Modal, Typography, Upload, message } from 'antd'
import api from '../../services/api'

const { Dragger } = Upload

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx']

function ExcelImportModal({
  open,
  onCancel,
  onSuccess,
  title = 'Nhập dữ liệu từ Excel',
  uploadUrl,
  templateUrl,
  templateFileName,
  extraData,
  children,
}) {
  const [uploading, setUploading] = useState(false)
  const [fileList, setFileList] = useState([])

  useEffect(() => {
    if (!open) {
      setFileList([])
    }
  }, [open])

  const handleClose = () => {
    setFileList([])
    onCancel()
  }

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('Vui lòng chọn file Excel hoặc CSV')
      return
    }

    const file = fileList[0].originFileObj || fileList[0]
    const formData = new FormData()
    formData.append('file', file)

    if (extraData) {
      Object.entries(extraData).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, value)
        }
      })
    }

    setUploading(true)
    try {
      const response = await api.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      if (response.data?.status === 'fail') {
        message.error(response.data?.message || 'Import thất bại')
        return
      }

      message.success(response.data?.message || 'Import dữ liệu thành công')
      handleClose()
      onSuccess?.()
    } catch {
      // Network/server errors are surfaced by the axios interceptor
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      onOk={handleUpload}
      confirmLoading={uploading}
      okText="Nhập dữ liệu"
      cancelText="Hủy"
      destroyOnHidden
      width={520}
    >
      {children}

      <Dragger
        accept={ACCEPTED_EXTENSIONS.join(',')}
        maxCount={1}
        beforeUpload={() => false}
        fileList={fileList}
        onChange={({ fileList: nextFileList }) => setFileList(nextFileList)}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Kéo thả file Excel vào đây hoặc click để chọn file</p>
        <p className="ant-upload-hint">Hỗ trợ định dạng .xlsx, .xls, .csv</p>
      </Dragger>

      {templateUrl ? (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Chưa có file? Tải mẫu Excel, điền dữ liệu theo sheet &quot;Dữ liệu&quot; rồi upload lại.
          </Typography.Text>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            href={templateUrl}
            download={templateFileName || undefined}
          >
            Tải xuống file mẫu
          </Button>
        </div>
      ) : null}
    </Modal>
  )
}

export default ExcelImportModal
