import React, { useState } from 'react'
import { Card, Row, Col, Typography, Input, Segmented, Empty, Space } from 'antd'
import { Folder, LayoutGrid, Search, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import styles from './ProjectsPage.module.css'

const { Title, Text } = Typography

const PROJECTS = [
  { id: '1', name: 'my-app', path: 'D:\\workspace\\my-app', sessions: 12, lastActive: '10 分钟前', status: 'ok' },
  { id: '2', name: 'api-server', path: 'D:\\workspace\\api-server', sessions: 5, lastActive: '2 小时前', status: 'ok' },
  { id: '3', name: 'docs-site', path: 'D:\\workspace\\docs-site', sessions: 3, lastActive: '1 天前', status: 'warn' },
]

export function ProjectsPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const filtered = PROJECTS.filter((p) => p.name.includes(search.toLowerCase()))

  return (
    <AppLayout activeTopTab="projects">
      <div className={styles.container}>
        <div className={styles.header}>
          <Title level={4} style={{ margin: 0, color: 'var(--h-text)' }}>项目</Title>
          <Space>
            <Input prefix={<Search size={14} style={{ color: '#6d6759' }} />} placeholder="搜索项目..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
            <Segmented value={view} onChange={(v) => setView(v as 'grid' | 'list')} options={[
              { value: 'grid', icon: <LayoutGrid size={14} /> },
              { value: 'list', icon: <Folder size={14} /> },
            ]} />
          </Space>
        </div>

        {filtered.length === 0 ? (
          <Empty description="暂无项目" style={{ marginTop: 80 }} />
        ) : view === 'grid' ? (
          <Row gutter={[16, 16]}>
            {filtered.map((p) => (
              <Col span={8} key={p.id}>
                <Card hoverable onClick={() => navigate(`/projects/${encodeURIComponent(p.path)}`)} className={styles.projectCard}>
                  <div className={styles.cardIcon}><Folder size={24} color="#ff7a3d" /></div>
                  <Title level={5} style={{ margin: '8px 0 4px', color: 'var(--h-text)' }}>{p.name}</Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>{p.path}</Text>
                  <div className={styles.cardMeta}><Text type="secondary" style={{ fontSize: 12 }}>{p.sessions} 个会话</Text><Text type="secondary" style={{ fontSize: 12 }}>{p.lastActive}</Text></div>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <div className={styles.list}>
            {filtered.map((p) => (
              <Card key={p.id} hoverable onClick={() => navigate(`/projects/${encodeURIComponent(p.path)}`)} className={styles.listCard}>
                <div className={styles.listRow}>
                  <Folder size={18} color="#ff7a3d" />
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ color: 'var(--h-text)' }}>{p.name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{p.path}</Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{p.sessions} 会话</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{p.lastActive}</Text>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
