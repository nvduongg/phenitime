import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DownOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { Avatar, Dropdown, Layout, Menu, Typography } from 'antd'
import { PageMetaProvider, usePageMeta } from '../../contexts/PageMetaContext'
import { useAuth } from '../../contexts/AuthContext'
import { filterMenuItems, canAccessRoute } from '../../config/permissions'
import { ROLE_LABELS, ROLE_SHORT_LABELS } from '../../constants/roles'

const { Text } = Typography
import {
  getOpenMenuKeys,
  getSelectedMenuKey,
  menuItems,
} from '../../config/menu'

const { Sider, Content } = Layout

export const SIDER_WIDTH = 260
export const SIDER_COLLAPSED_WIDTH = 80

function buildHeaderUserMeta(user) {
  const name = (user?.full_name || user?.email || 'Người dùng').trim()
  const initial = name.charAt(0).toUpperCase() || '?'
  const roleShort =
    ROLE_SHORT_LABELS[user?.role] || user?.role_label || ROLE_LABELS[user?.role] || ''
  const unitName = user?.scope_unit?.unit_name?.trim()
  const subtitle = unitName ? `${roleShort} · ${unitName}` : roleShort

  return {
    name,
    initial,
    subtitle,
    roleLabel: user?.role_label || ROLE_LABELS[user?.role] || roleShort,
    email: user?.email || '',
    unitName: unitName || null,
  }
}

function AppTopbar({ collapsed, onToggleCollapsed }) {
  const { meta } = usePageMeta()
  const { user, logout } = useAuth()
  const siderEdge = collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_WIDTH
  const headerUser = buildHeaderUserMeta(user)

  const userMenuItems = [
    {
      key: 'logout',
      label: 'Đăng xuất',
      danger: true,
      icon: <LogoutOutlined />,
    },
  ]

  const handleUserMenu = ({ key }) => {
    if (key === 'logout') {
      logout()
    }
  }

  return (
    <header className={`app-topbar ${collapsed ? 'is-sider-collapsed' : ''}`}>
      <div className={`app-topbar-brand ${collapsed ? 'is-collapsed' : ''}`}>
        {collapsed ? (
          <span className="app-topbar-brand-mark" aria-label="Phenitime">
            P
          </span>
        ) : (
          <span className="app-topbar-brand-text">
            Pheni<span className="app-topbar-brand-accent">time</span>
          </span>
        )}
      </div>

      <h1 className="app-topbar-title">{meta.title || '\u00A0'}</h1>

      <div className="app-topbar-user">
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          width={300}
          menu={{ items: userMenuItems, onClick: handleUserMenu }}
          dropdownRender={(menu) => (
            <div className="app-user-dropdown">
              <div className="app-user-dropdown-head">
                <Avatar size={40} className="app-user-dropdown-avatar">
                  {headerUser.initial}
                </Avatar>
                <div className="app-user-dropdown-meta">
                  <Text strong className="app-user-dropdown-name" ellipsis>
                    {headerUser.name}
                  </Text>
                  <Text type="secondary" className="app-user-dropdown-email" ellipsis>
                    {headerUser.email}
                  </Text>
                  <Text type="secondary" className="app-user-dropdown-role">
                    {headerUser.roleLabel}
                    {headerUser.unitName ? ` · ${headerUser.unitName}` : ''}
                  </Text>
                </div>
              </div>
              {menu}
            </div>
          )}
        >
          <button type="button" className="app-header-user" aria-label="Tài khoản">
            <Avatar size={28} className="app-header-user-avatar">
              {headerUser.initial}
            </Avatar>
            <span className="app-header-user-text">
              <span className="app-header-user-name" title={headerUser.name}>
                {headerUser.name}
              </span>
              {headerUser.subtitle ? (
                <span className="app-header-user-sub" title={headerUser.subtitle}>
                  {headerUser.subtitle}
                </span>
              ) : null}
            </span>
            <DownOutlined className="app-header-user-chevron" />
          </button>
        </Dropdown>
      </div>

      <button
        type="button"
        className="app-sider-trigger"
        style={{ left: siderEdge }}
        aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <ArrowRightOutlined /> : <ArrowLeftOutlined />}
      </button>
    </header>
  )
}

function AppLayoutShell() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const visibleMenuItems = useMemo(
    () => filterMenuItems(menuItems, user?.role),
    [user?.role],
  )

  const selectedKey = useMemo(
    () => getSelectedMenuKey(location.pathname),
    [location.pathname],
  )

  const routeOpenKeys = useMemo(
    () => getOpenMenuKeys(location.pathname),
    [location.pathname],
  )

  const menuSection = routeOpenKeys[0] ?? '_root'
  const [extraOpenKeysBySection, setExtraOpenKeysBySection] = useState({})

  const openKeys = useMemo(() => {
    const extraOpenKeys = extraOpenKeysBySection[menuSection] ?? []
    return [...new Set([...routeOpenKeys, ...extraOpenKeys])]
  }, [routeOpenKeys, extraOpenKeysBySection, menuSection])

  const siderEdge = collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_WIDTH

  return (
    <div
      className={`app-shell ${collapsed ? 'is-sider-collapsed' : ''}`}
      style={{
        '--app-sider-current-width': collapsed
          ? `${SIDER_COLLAPSED_WIDTH}px`
          : `${SIDER_WIDTH}px`,
      }}
    >
      <div className="app-layout-divider" style={{ left: siderEdge }} aria-hidden="true" />

      <AppTopbar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
      />

      <Layout className="app-body">
        <Sider
          className="app-sider"
          theme="light"
          width={SIDER_WIDTH}
          collapsedWidth={SIDER_COLLAPSED_WIDTH}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
        >
          <Menu
            className="app-sider-menu"
            mode="inline"
            inlineIndent={16}
            selectedKeys={[selectedKey]}
            openKeys={collapsed ? [] : openKeys}
            onOpenChange={(keys) => {
              setExtraOpenKeysBySection((prev) => ({
                ...prev,
                [menuSection]: keys.filter((key) => !routeOpenKeys.includes(key)),
              }))
            }}
            items={visibleMenuItems}
            onClick={({ key }) => {
              if (key.startsWith('/')) {
                if (canAccessRoute(user?.role, key)) {
                  navigate(key)
                }
              }
            }}
          />
        </Sider>

        <Layout className="app-workspace">
          <Content className="app-content">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </div>
  )
}

function AppLayout() {
  return (
    <PageMetaProvider>
      <AppLayoutShell />
    </PageMetaProvider>
  )
}

export default AppLayout
