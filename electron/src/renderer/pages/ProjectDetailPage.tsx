import React from 'react'
import { Card, Typography, Tag, Descriptions } from 'antd'
import { Folder, GitBranch } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import styles from './ProjectDetailPage.module.css'

const { Title, Text } = Typography

const DUMMY_PROJECT = {
  name: 'my-app',
  path: 'D:\\workspace\\my-app',
  sessions: 12,
  lastActive: '10 分钟前',
  gitBranch: 'main',
  gitStatus: 'clean',
  recentSessions: [
    { id: '1', title: '重构 utils', updatedAt: '10 分钟前' },
    { id: '2', title: '添加测试', updatedAt: '2 小时前' },
  ],
}

export function ProjectDetailPage() {
  const { workspacePath } = useParams<{ workspacePath: string }>()
  const navigate = useNavigate()
  const decoded = workspacePath ? decodeURIComponent(workspacePath) : ''
  const project = DUMMY_PROJECT

  return (
    <AppLayout activeTopTab="projects">
      <div className={styles.container}>
        <div className={styles.breadcrumb}>
          <Text style={{ color: 'var(--h-text-2)', cursor: 'pointer' }} onClick={() => navigate('/projects')}>项目</Text>
          <Text type="secondary"> / </Text>
          <Text style={{ color: 'var(--h-text)' }}>{decoded}</Text>
        </div>

        <div className={styles.header}>
          <div className={styles.titleArea}>
            <div className={styles.icon}><Folder size={28} color="#ff7a3d" /></div>
            <div>
              <Title level={3} style={{ margin: 0, color: 'var(--h-text)' }}>{project.name}</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>{project.path}</Text>
            </div>
          </div>
          <Tag icon={<GitBranch size={11} />}>{project.gitBranch}</Tag>
        </div>

        <Descriptions items={[
          { key: 'sessions', label: '会话数', children: `${project.sessions} 个` },
          { key: 'lastActive', label: '最近活动', children: project.lastActive },
          { key: 'gitStatus', label: 'Git 状态', children: <Tag color={project.gitStatus === 'clean' ? 'success' : 'warning'}>{project.gitStatus === 'clean' ? '干净' : '有变更'}</Tag> },
        ]} className={styles.descriptions} />

        <Title level={5} style={{ color: 'var(--h-text)', marginTop: 28, marginBottom: 12 }}>最近会话</Title>

        <div className={styles.sessionList}>
          {project.recentSessions.map((s) => (
            <Card key={s.id} hoverable onClick={() => navigate(`/tasks/${s.id}`)} className={styles.sessionCard}>
              <div className={styles.sessionRow}>
                <Text style={{ color: 'var(--h-text)', flex: 1 }}>{s.title}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{s.updatedAt}</Text>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
