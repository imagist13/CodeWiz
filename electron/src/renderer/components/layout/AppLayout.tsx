import React, { useState, useEffect } from 'react'
import { Layout, Menu, Dropdown, Avatar, Tooltip, Badge } from 'antd'
import type { MenuProps } from 'antd'
import {
  Home,
  LayoutGrid,
  Zap,
  Bot,
  BarChart2,
  Coins,
  Settings,
  User,
  Search,
  Bell,
  ChevronRight,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './AppLayout.module.css'

const { Header, Sider, Content } = Layout

const TOP_TABS = [
  { key: 'workbench', label: '工作台', icon: <Home size={16} />, path: '/' },
  { key: 'projects', label: '项目', icon: <LayoutGrid size={16} />, path: '/projects' },
  { key: 'capabilities', label: '能力', icon: <Bot size={16} />, path: '/capabilities' },
  { key: 'automation', label: '自动化', icon: <Zap size={16} />, path: '/automation' },
  { key: 'observability', label: '可观测', icon: <BarChart2 size={16} />, path: '/observability' },
  { key: 'settings', label: '设置', icon: <Coins size={16} />, path: '/settings' },
]

interface AppLayoutProps {
  children: React.ReactNode
  sidebarContent?: React.ReactNode
  activeTopTab?: string
}

function matchTopTab(pathname: string): string {
  for (const tab of TOP_TABS) {
    if (pathname === tab.path) return tab.key
    if (tab.path !== '/' && pathname.startsWith(tab.path)) return tab.key
  }
  if (pathname.startsWith('/tasks')) return 'workbench'
  if (pathname.startsWith('/skills') || pathname.startsWith('/mcp') || pathname.startsWith('/profiles')) return 'capabilities'
  if (pathname.startsWith('/logs') || pathname.startsWith('/health')) return 'observability'
  if (pathname.startsWith('/cron') || pathname.startsWith('/triggers')) return 'automation'
  return 'workbench'
}

export function AppLayout({ children, sidebarContent, activeTopTab }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { username } = useUserStore()

  const [collapsed, setCollapsed] = useState(false)

  const currentTopTab = activeTopTab || matchTopTab(location.pathname)

  const handleTopNavClick: MenuProps['onClick'] = ({ key }) => {
    const tab = TOP_TABS.find((t) => t.key === key)
    if (tab) navigate(tab.path)
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      label: username || '用户',
      icon: <User size={14} />,
    },
    { type: 'divider' },
    {
      key: 'settings',
      label: '设置',
      icon: <Settings size={14} />,
      onClick: () => navigate('/settings'),
    },
    {
      key: 'logout',
      label: '退出登录',
      danger: true,
    },
  ]

  const topMenuItems = TOP_TABS.map((tab) => ({
    key: tab.key,
    label: (
      <span className={styles.topTabLabel}>
        {tab.icon}
        {tab.label}
      </span>
    ),
  }))

  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo} onClick={() => navigate('/')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#ff7a3d" opacity="0.9" />
              <path d="M2 17L12 22L22 17" stroke="#ff7a3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 12L12 17L22 12" stroke="#ff7a3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            </svg>
            <span className={styles.logoText}>Hermes</span>
          </div>

          <Menu
            mode="horizontal"
            selectedKeys={[currentTopTab]}
            onClick={handleTopNavClick}
            items={topMenuItems}
            className={styles.topMenu}
            theme="dark"
          />
        </div>

        <div className={styles.headerRight}>
          <Tooltip title="搜索 (⌘K)">
            <button className={styles.iconBtn}>
              <Search size={16} />
            </button>
          </Tooltip>

          <Tooltip title="通知">
            <button className={styles.iconBtn}>
              <Badge count={0} size="small">
                <Bell size={16} />
              </Badge>
            </button>
          </Tooltip>

          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <button className={styles.userBtn}>
              <Avatar size={28} style={{ backgroundColor: '#ff7a3d', fontSize: 12 }}>
                {username ? username[0].toUpperCase() : 'U'}
              </Avatar>
              <span className={styles.userName}>{username || '用户'}</span>
              <ChevronRight size={12} style={{ color: '#6d6759' }} />
            </button>
          </Dropdown>
        </div>
      </Header>

      <Layout className={styles.mainLayout}>
        {sidebarContent && (
          <Sider
            width={240}
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            collapsedWidth={0}
            trigger={null}
            className={styles.sider}
          >
            <div className={styles.siderContent}>
              {sidebarContent}
            </div>
          </Sider>
        )}

        <Content className={styles.content}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
