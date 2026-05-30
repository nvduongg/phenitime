import axios from 'axios'
import { message } from 'antd'
import { getErrorMessage } from '../utils/formatters'

function encodePathSegment(value) {
  return encodeURIComponent(String(value ?? ''))
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 0,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.config?.skipErrorToast) {
      message.error(getErrorMessage(error))
    }
    return Promise.reject(error)
  },
)

export const getCourseSections = async () => {
  const response = await api.get('/course-sections')
  return response.data
}

export const createCourseSection = async (payload) => {
  const body = {
    ...payload,
    student_group_ids: payload.student_group_ids ?? payload.studentGroupIds ?? undefined,
  }
  delete body.studentGroupIds
  const response = await api.post('/course-sections', body)
  return response.data
}

export const uploadCourseSectionsCsv = async (formData) => {
  const response = await api.post('/imports/course-sections', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const importCoursesExcel = async (formData) => {
  const response = await api.post('/imports/courses', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const importLecturersExcel = async (formData) => {
  const response = await api.post('/imports/lecturers', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const importRoomsExcel = async (formData) => {
  const response = await api.post('/imports/rooms', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const autoGenerateSections = async (payload) => {
  const response = await api.post('/course-sections/auto-generate', payload)
  return response.data
}

export const getTimetables = async () => {
  const response = await api.get('/timetables')
  return response.data
}

export const triggerAiScheduler = async (payload) => {
  const response = await api.post('/timetables/solve', payload)
  return response.data
}

export const getSchedulerJobStatus = async (jobId) => {
  const response = await api.get(`/timetables/status/${encodePathSegment(jobId)}`, {
    skipErrorToast: true,
    timeout: 30_000,
  })
  return response.data
}

export const getSemesters = async () => {
  const response = await api.get('/semesters')
  return response.data
}

export const createSemester = async (payload) => {
  const response = await api.post('/semesters', payload)
  return response.data
}

export const updateSemester = async (id, payload) => {
  const response = await api.put(`/semesters/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteSemester = async (id) => {
  const response = await api.delete(`/semesters/${encodePathSegment(id)}`)
  return response.data
}

export const getRooms = async () => {
  const response = await api.get('/rooms')
  return response.data
}

export const createRoom = async (payload) => {
  const response = await api.post('/rooms', payload)
  return response.data
}

export const updateRoom = async (id, payload) => {
  const response = await api.put(`/rooms/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteRoom = async (id) => {
  const response = await api.delete(`/rooms/${encodePathSegment(id)}`)
  return response.data
}

export const getLecturers = async () => {
  const response = await api.get('/lecturers')
  return response.data
}

export const createLecturer = async (payload) => {
  const response = await api.post('/lecturers', payload)
  return response.data
}

export const updateLecturer = async (id, payload) => {
  const response = await api.put(`/lecturers/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteLecturer = async (id) => {
  const response = await api.delete(`/lecturers/${encodePathSegment(id)}`)
  return response.data
}

export const getCourses = async () => {
  const response = await api.get('/courses')
  return response.data
}

export const createCourse = async (payload) => {
  const response = await api.post('/courses', payload)
  return response.data
}

export const updateCourse = async (id, payload) => {
  const response = await api.put(`/courses/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteCourse = async (id) => {
  const response = await api.delete(`/courses/${encodePathSegment(id)}`)
  return response.data
}

export const getOrganizationUnits = async () => {
  const response = await api.get('/organization-units')
  return response.data
}

export const createOrganizationUnit = async (payload) => {
  const response = await api.post('/organization-units', payload)
  return response.data
}

export const updateOrganizationUnit = async (id, payload) => {
  const response = await api.put(`/organization-units/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteOrganizationUnit = async (id) => {
  const response = await api.delete(`/organization-units/${encodePathSegment(id)}`)
  return response.data
}

export const getCohorts = async () => {
  const response = await api.get('/cohorts')
  return response.data
}

export const createCohort = async (payload) => {
  const response = await api.post('/cohorts', payload)
  return response.data
}

export const updateCohort = async (id, payload) => {
  const response = await api.put(`/cohorts/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteCohort = async (id) => {
  const response = await api.delete(`/cohorts/${encodePathSegment(id)}`)
  return response.data
}

export const previewStudentGroup = async (groupId, majorId) => {
  const response = await api.get('/student-groups/preview', {
    params: {
      group_id: groupId,
      major_id: majorId || undefined,
    },
    validateStatus: (status) => status >= 200 && status < 500,
  })

  if (response.data?.status === 'fail') {
    return { data: null, message: response.data.message }
  }

  return response.data
}

export const getStudentGroups = async () => {
  const response = await api.get('/student-groups')
  return response.data
}

export const createStudentGroup = async (payload) => {
  const response = await api.post('/student-groups', payload)
  return response.data
}

export const updateStudentGroup = async (id, payload) => {
  const response = await api.put(`/student-groups/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteStudentGroup = async (id) => {
  const response = await api.delete(`/student-groups/${encodePathSegment(id)}`)
  return response.data
}

export const createTimetable = async (payload) => {
  const response = await api.post('/timetables', payload)
  return response.data
}

export const updateTimetable = async (id, payload) => {
  const response = await api.put(`/timetables/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteTimetable = async (id) => {
  const response = await api.delete(`/timetables/${encodePathSegment(id)}`)
  return response.data
}

export const deleteCourseSection = async (id) => {
  const response = await api.delete(`/course-sections/${encodePathSegment(id)}`)
  return response.data
}

export const getCurricula = async () => {
  const response = await api.get('/curricula')
  return response.data
}

export const getMajors = async () => {
  const response = await api.get('/majors')
  return response.data
}

export const createMajor = async (payload) => {
  const response = await api.post('/majors', payload)
  return response.data
}

export const updateMajor = async (id, payload) => {
  const response = await api.put(`/majors/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteMajor = async (id) => {
  const response = await api.delete(`/majors/${encodePathSegment(id)}`)
  return response.data
}

export const createCurriculum = async (payload) => {
  const response = await api.post('/curricula', payload)
  return response.data
}

export const updateCurriculum = async (id, payload) => {
  const response = await api.put(`/curricula/${encodePathSegment(id)}`, payload)
  return response.data
}

export const deleteCurriculum = async (id) => {
  const response = await api.delete(`/curricula/${encodePathSegment(id)}`)
  return response.data
}

export const createRoadmap = async (payload) => {
  const response = await api.post('/curricula/roadmap', payload)
  return response.data
}

export const updateCourseSection = async (id, payload) => {
  const body = {
    ...payload,
    student_group_ids: payload.student_group_ids ?? payload.studentGroupIds ?? undefined,
  }
  delete body.studentGroupIds
  const response = await api.put(`/course-sections/${encodePathSegment(id)}`, body)
  return response.data
}

export const autoAssignLecturers = async (semesterId) => {
  const response = await api.post('/course-sections/auto-assign', { semester_id: semesterId })
  return response.data
}

export const getSchedulingSettings = async () => {
  const response = await api.get('/settings/scheduling')
  return response.data
}

export const updateSchedulingSettings = async (payload) => {
  const response = await api.put('/settings/scheduling', payload)
  return response.data
}

export default api
