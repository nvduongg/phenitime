import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button, Card, Form, Input, Typography } from 'antd'
import { useAuth } from '../../contexts/AuthContext'

const { Title, Text } = Typography

export default function Login() {
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, from])

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-login-page">
      <Card className="auth-login-card">
        <Title level={3} style={{ marginTop: 0 }}>
          Phenitime
        </Title>
        <Text type="secondary">Đăng nhập hệ thống quản lý thời khóa biểu</Text>

        <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 24 }} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input placeholder="admin@phenikaa-uni.edu.vn" autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: 'Nhập mật khẩu' }]}
          >
            <Input.Password placeholder="Mật khẩu" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </div>
  )
}
