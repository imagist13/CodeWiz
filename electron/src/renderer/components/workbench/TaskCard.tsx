import React from 'react'
import { Card, Typography, Badge, Progress } from 'antd'
import { Clock } from 'lucide-react'
import styles from './TaskCard.module.css'

const { Text } = Typography

interface Props {
  title: string
  status: 'running' | 'done' | 'error' | 'pending'
  updatedAt: string
  progress?: number
  onClick: () => void
}

const STATUS_CONFIG = {
  running: { color: '#6e9bd1', label: '运行中', badgeStatus: 'processing' as const },
  done: { color: '#8db580', label: '完成', badgeStatus: 'success' as const },
  error: { color: '#d96666', label: '失败', badgeStatus: 'error' as const },
  pending: { color: '#aaa291', label: '待处理', badgeStatus: 'default' as const },
}

export function TaskCard({ title, status, updatedAt, progress = 0, onClick }: Props) {
  const cfg = STATUS_CONFIG[status]
  return (
    <Card hoverable onClick={onClick} className={styles.card} styles={{ body: { padding: '14px 16px' } }}>
      <div className={styles.header}>
        <Badge status={cfg.badgeStatus} text={<span style={{ color: cfg.color, fontSize: 12 }}>{cfg.label}</span>} />
        <Clock size={11} style={{ color: 'var(--h-text-3)' }} />
        <Text type="secondary" style={{ fontSize: 11, color: 'var(--h-text-3)' }}>{updatedAt}</Text>
      </div>
      <div className={styles.title}>{title}</div>
      {status === 'running' && (
        <Progress percent={Math.round(progress * 100)} size="small" showInfo={false} strokeColor="#6e9bd1" trailColor="var(--h-line)" style={{ marginTop: 8 }} />
      )}
    </Card>
  )
}
