import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Drawer,
  Form,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import ExcelImportModal from '../Common/ExcelImportModal'
import ImportToolbarActions from '../Common/ImportToolbarActions'
import { getImportTemplate } from '../../config/importTemplates'
import { createRoadmap, getCourses, getCurricula } from '../../services/api'
import {
  buildProgramSemesterOptions,
  formatProgramSemester,
} from '../../utils/formatters'

const COURSE_TYPE_OPTIONS = [
  { value: 'MANDATORY', label: 'Bắt buộc (MANDATORY)' },
  { value: 'ELECTIVE', label: 'Tự chọn (ELECTIVE)' },
]

const COURSE_TYPE_LABELS = {
  MANDATORY: { color: 'blue', label: 'Bắt buộc' },
  ELECTIVE: { color: 'orange', label: 'Tự chọn' },
}

function CurriculumRoadmapDrawer({ open, curriculum, onClose, onUpdated }) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [roadmaps, setRoadmaps] = useState([])
  const [courseOptions, setCourseOptions] = useState([])
  const [form] = Form.useForm()

  const curriculumId = curriculum?.curriculum_id
  const cohortStartYear = curriculum?.cohort?.start_year
  const importTemplate = getImportTemplate('roadmaps')

  const programSemesterOptions = useMemo(
    () => buildProgramSemesterOptions(12, cohortStartYear),
    [cohortStartYear],
  )

  const fetchRoadmaps = useCallback(async () => {
    if (!curriculumId) {
      setRoadmaps([])
      return
    }

    setLoading(true)
    try {
      const result = await getCurricula()
      const current = (result.data || []).find((item) => item.curriculum_id === curriculumId)
      setRoadmaps(current?.roadmaps || [])
    } catch {
      // Error handled by axios interceptor
    } finally {
      setLoading(false)
    }
  }, [curriculumId])

  useEffect(() => {
    if (!open) return
    fetchRoadmaps()
  }, [open, fetchRoadmaps])

  useEffect(() => {
    if (!open) return

    getCourses()
      .then((result) => {
        setCourseOptions(
          (result.data || []).map((course) => ({
            value: course.course_id,
            label: `${course.course_id} — ${course.course_name}`,
          })),
        )
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
  }, [open])

  const handleImportSuccess = async () => {
    await fetchRoadmaps()
    onUpdated?.()
  }

  const roadmapRows = useMemo(
    () =>
      roadmaps.map((roadmap) => ({
        ...roadmap,
        course_name: roadmap.course?.course_name || roadmap.course_id,
      })),
    [roadmaps],
  )

  const handleAddRoadmap = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await createRoadmap({
        curriculum_id: curriculumId,
        course_id: values.course_id,
        recommended_semester: values.recommended_semester,
        course_type: values.course_type,
      })
      message.success('Đã thêm học phần vào lộ trình')
      setModalOpen(false)
      form.resetFields()
      await fetchRoadmaps()
      onUpdated?.()
    } catch (error) {
      if (error?.errorFields) return
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'Mã HP',
      dataIndex: 'course_id',
      key: 'course_id',
      width: 120,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Tên học phần',
      dataIndex: 'course_name',
      key: 'course_name',
      ellipsis: true,
    },
    {
      title: 'Học kỳ',
      dataIndex: 'recommended_semester',
      key: 'recommended_semester',
      width: 180,
      sorter: (a, b) => a.recommended_semester - b.recommended_semester,
      defaultSortOrder: 'ascend',
      render: (value) => formatProgramSemester(value, cohortStartYear),
    },
    {
      title: 'Loại môn',
      dataIndex: 'course_type',
      key: 'course_type',
      width: 130,
      render: (value) => {
        const config = COURSE_TYPE_LABELS[value] || { color: 'default', label: value }
        return <Tag color={config.color}>{config.label}</Tag>
      },
    },
  ]

  return (
    <>
      <Drawer
        title={`Lộ trình chuẩn - ${curriculum?.curriculum_name || curriculumId || ''}`}
        placement="right"
        width={800}
        open={open}
        onClose={onClose}
        destroyOnHidden
        extra={
          <Space size="small">
            <ImportToolbarActions onImportClick={() => setImportOpen(true)} />
            <Button
              type="primary"
              size="middle"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields()
                setModalOpen(true)
              }}
            >
              Thêm học phần
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={roadmapRows}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `${total} học phần`,
            }}
            scroll={{ x: 680, y: 'calc(100vh - 220px)' }}
            sticky
            locale={{ emptyText: 'Chương trình này chưa có học phần trong lộ trình' }}
          />
        </Spin>
      </Drawer>

      <ExcelImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={handleImportSuccess}
        title="Nhập lộ trình từ Excel"
        uploadUrl="/imports/roadmaps"
        templateUrl={importTemplate?.url}
        templateFileName={importTemplate?.fileName}
        extraData={{ curriculum_id: curriculumId }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Dữ liệu sẽ được gắn vào CTĐT <strong>{curriculumId}</strong>. Học phần trùng lặp sẽ được bỏ qua.
          Cột <strong>Học kỳ</strong> trong Excel nhập số thứ tự 1–12 (3 kỳ/năm); hệ thống hiển thị dạng Kỳ 1 Năm 1
          {cohortStartYear ? ` (${cohortStartYear})` : ''}.
        </Typography.Paragraph>
      </ExcelImportModal>

      <Modal
        title="Thêm học phần vào lộ trình"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        onOk={handleAddRoadmap}
        confirmLoading={submitting}
        okText="Thêm học phần"
        cancelText="Hủy"
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="course_id"
            label="Mã học phần"
            rules={[{ required: true, message: 'Vui lòng chọn học phần' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={courseOptions}
              placeholder="Tìm và chọn học phần"
            />
          </Form.Item>
          <Form.Item
            name="recommended_semester"
            label="Học kỳ"
            rules={[{ required: true, message: 'Vui lòng chọn học kỳ' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={programSemesterOptions}
              placeholder={
                cohortStartYear
                  ? 'Chọn học kỳ trong chương trình (VD: Kỳ 1 Năm 1)'
                  : 'Chọn học kỳ trong chương trình'
              }
            />
          </Form.Item>
          <Form.Item
            name="course_type"
            label="Loại môn"
            rules={[{ required: true, message: 'Vui lòng chọn loại môn' }]}
            initialValue="MANDATORY"
          >
            <Select options={COURSE_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default CurriculumRoadmapDrawer
