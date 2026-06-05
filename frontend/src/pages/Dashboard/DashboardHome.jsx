import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isOfficeRole } from '../../config/permissions'
import Dashboard from './index'

export default function DashboardHome() {
  const { user } = useAuth()

  if (isOfficeRole(user?.role)) {
    return <Navigate to="/academic/lecturer-assignment" replace />
  }

  return <Dashboard />
}
