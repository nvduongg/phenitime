import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { Avatar, Dropdown, Layout, Menu, Space } from 'antd'
import { PageMetaProvider, usePageMeta } from '../../contexts/PageMetaContext'
import {
  getOpenMenuKeys,
  getSelectedMenuKey,
  menuItems,
} from '../../config/menu'

const { Sider, Content } = Layout

export const SIDER_WIDTH = 260
export const SIDER_COLLAPSED_WIDTH = 80

const userMenuItems = [
  { key: 'profile', label: 'Hồ sơ cá nhân' },
  { key: 'settings', label: 'Cài đặt' },
  { type: 'divider' },
  { key: 'logout', label: 'Đăng xuất', danger: true },
]

function AppTopbar({ collapsed, onToggleCollapsed }) {
  const { meta } = usePageMeta()
  const siderEdge = collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_WIDTH

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
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space className="app-header-user">
            <Avatar size={32} style={{ backgroundColor: '#1677ff' }}>Q</Avatar>
            <span className="app-header-user-name">Quản trị viên</span>
          </Space>
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
            items={menuItems}
            onClick={({ key }) => {
              if (key.startsWith('/')) {
                navigate(key)
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
