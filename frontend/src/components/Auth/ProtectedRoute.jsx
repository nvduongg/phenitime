import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth } from '../../contexts/AuthContext'

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, bootstrapping, user } = useAuth()
  const location = useLocation()

  if (bootstrapping) {
    return (
      <div className="auth-bootstrap-loading">
        <Spin size="large" tip="Đang tải phiên đăng nhập..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles?.length && !roles.includes(user?.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
