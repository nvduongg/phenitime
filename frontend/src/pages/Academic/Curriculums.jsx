import { useEffect, useMemo, useState } from 'react'
import { NodeIndexOutlined } from '@ant-design/icons'
import { Button, Form, Input, Select, Tooltip } from 'antd'
import CurriculumRoadmapDrawer from '../../components/Academic/CurriculumRoadmapDrawer'
import MasterDataCrudPage from '../../components/Common/MasterDataCrudPage'
import { useCrudPage } from '../../hooks/useCrudPage'
import {
  createCurriculum,
  deleteCurriculum,
  getCohorts,
  getCurricula,
  getMajors,
  updateCurriculum,
} from '../../services/api'
import {
  formatCohortLabel,
  formatCredits,
  formatMajorOptionLabel,
} from '../../utils/formatters'

function Curriculums() {
  const [cohortOptions, setCohortOptions] = useState([])
  const [majorOptions, setMajorOptions] = useState([])
  const [majorFilter, setMajorFilter] = useState(null)
  const [cohortFilter, setCohortFilter] = useState(null)
  const [roadmapOpen, setRoadmapOpen] = useState(false)
  const [selectedCurriculum, setSelectedCurriculum] = useState(null)

  const crud = useCrudPage({
    listFn: getCurricula,
    createFn: createCurriculum,
    updateFn: updateCurriculum,
    deleteFn: deleteCurriculum,
    getId: (record) => record.curriculum_id,
    searchFields: [
      'curriculum_id',
      'curriculum_name',
      'cohort_id',
      (record) => record.major?.major_name,
      (record) => record.major?.major_id,
      (record) => record.cohort?.cohort_id,
      (record) => record.unit?.unit_name,
    ],
    transformPayload: (values) => ({
      major_id: values.major_id,
      cohort_id: values.cohort_id,
    }),
  })

  useEffect(() => {
    Promise.all([getCohorts(), getMajors()])
      .then(([cohortsRes, majorsRes]) => {
        setCohortOptions(
          (cohortsRes.data || [])
            .map((cohort) => ({
              value: cohort.cohort_id,
              label: formatCohortLabel(cohort),
            }))
            .sort((a, b) => b.value.localeCompare(a.value, 'vi')),
        )
        setMajorOptions(
          (majorsRes.data || [])
            .map((major) => ({
              value: major.major_id,
              label: formatMajorOptionLabel(major),
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
        )
      })
      .catch(() => {
        // Error handled by axios interceptor
      })
  }, [])

  const openRoadmap = (record) => {
    setSelectedCurriculum(record)
    setRoadmapOpen(true)
  }

  const closeRoadmap = () => {
    setRoadmapOpen(false)
    setSelectedCurriculum(null)
  }

  const displayData = useMemo(() => {
    return crud.data.filter((record) => {
      const majorId = record.major_id || record.major?.major_id
      const cohortId = record.cohort_id || record.cohort?.cohort_id
      if (majorFilter && majorId !== majorFilter) return false
      if (cohortFilter && cohortId !== cohortFilter) return false
      return true
    })
  }, [crud.data, majorFilter, cohortFilter])

  const columns = [
    {
      title: 'Mã CTĐT',
      dataIndex: 'curriculum_id',
      key: 'curriculum_id',
      width: 140,
      render: (value) => <strong>{value}</strong>,
    },
    {
      title: 'Tên chương trình',
      dataIndex: 'curriculum_name',
      key: 'curriculum_name',
      ellipsis: true,
    },
    {
      title: 'Ngành',
      key: 'major_name',
      width: 200,
      ellipsis: true,
      render: (_, record) => record.major?.major_name || '—',
    },
    {
      title: 'Niên khóa',
      key: 'cohort_id',
      width: 100,
      render: (_, record) => record.cohort?.cohort_id || record.cohort_id || '—',
    },
    {
      title: 'Khoa',
      key: 'unit_name',
      ellipsis: true,
      render: (_, record) => record.unit?.unit_name || record.major?.unit?.unit_name || '—',
    },
    {
      title: 'Tổng TC',
      dataIndex: 'total_credits',
      key: 'total_credits',
      width: 100,
      render: (value) => (value > 0 ? formatCredits(value) : '—'),
    },
  ]

  return (
    <>
      <MasterDataCrudPage
        title="Chương trình đào tạo"
        subtitle="Gắn ngành đào tạo với niên khóa — tổng tín chỉ tự tính từ lộ trình học phần"
        rowKey="curriculum_id"
        columns={columns}
        dataSource={displayData}
        loading={crud.loading}
        submitting={crud.submitting}
        modalOpen={crud.modalOpen}
        editingRecord={crud.editingRecord}
        searchText={crud.searchText}
        onSearchChange={crud.setSearchText}
        onCreate={crud.openCreate}
        onEdit={crud.openEdit}
        onDelete={crud.handleDelete}
        onCloseModal={crud.closeModal}
        onSubmit={crud.handleSubmit}
        modalTitleCreate="Thêm chương trình đào tạo"
        modalTitleEdit="Cập nhật chương trình đào tạo"
        form={crud.form}
        scrollX={1100}
        actionColumnWidth={150}
        extraFilters={
          <>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Lọc theo ngành"
              style={{ minWidth: 260 }}
              options={majorOptions}
              value={majorFilter}
              onChange={setMajorFilter}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Lọc theo khóa"
              style={{ minWidth: 200 }}
              options={cohortOptions}
              value={cohortFilter}
              onChange={setCohortFilter}
            />
          </>
        }
        renderRowActions={(record) => (
          <Tooltip title="Lộ trình đào tạo">
            <Button
              type="text"
              size="middle"
              icon={<NodeIndexOutlined />}
              onClick={() => openRoadmap(record)}
            />
          </Tooltip>
        )}
        formContent={(editingRecord) => (
          <>
            {editingRecord ? (
              <Form.Item label="Mã CTĐT">
                <Input value={editingRecord.curriculum_id} disabled />
              </Form.Item>
            ) : null}
            <Form.Item
              name="major_id"
              label="Ngành đào tạo"
              rules={[{ required: true, message: 'Vui lòng chọn ngành đào tạo' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={majorOptions}
                placeholder="Chọn ngành (VD: CNTT — Công nghệ thông tin)"
              />
            </Form.Item>
            <Form.Item
              name="cohort_id"
              label="Niên khóa"
              rules={[{ required: true, message: 'Vui lòng chọn niên khóa' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={cohortOptions}
                placeholder="Chọn niên khóa (VD: K17 — nhập học 2023)"
                disabled={Boolean(editingRecord)}
              />
            </Form.Item>
          </>
        )}
      />

      <CurriculumRoadmapDrawer
        open={roadmapOpen}
        curriculum={selectedCurriculum}
        onClose={closeRoadmap}
        onUpdated={crud.fetchData}
      />
    </>
  )
}

export default Curriculums
