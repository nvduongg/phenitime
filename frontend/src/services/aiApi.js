import axios from 'axios'
import { message } from 'antd'
import { getErrorMessage } from '../utils/formatters'

const aiApi = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

aiApi.interceptors.response.use(
  (response) => response,
  (error) => {
    message.error(getErrorMessage(error))
    return Promise.reject(error)
  },
)

export const runAiSolver = async (semesterId, config) => {
  const response = await aiApi.post('/solve', {
    semester_id: semesterId,
    config: {
      regular_starts: config.regular_starts,
      evening_starts: config.evening_starts,
    },
  })
  return response.data
}

export default aiApi
