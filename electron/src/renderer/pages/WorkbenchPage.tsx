import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Typography, Button, Space, Spin, Empty } from 'antd'
import { Plus, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { HealthGrid } from '../components/workbench/HealthGrid'
import { Composer } from '../components/workbench/Composer'
import { useChatStore } from '../store/chatStore'
import { listConversations } from '../utils/api'
import type { Conversation } from '../utils/api'
import styles from './WorkbenchPage.module.css'

const { Text } = Typography

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 22) return '晚上好'
  return '夜深了'
}

function formatRelativeTime(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return new Date(isoString).toLocaleDateString('zh-CN')
}

export function WorkbenchPage() {
  const navigate = useNavigate()
  const { conversations, setConversations, setCurrentConversation, clearMessages } = useChatStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const convs = await listConversations()
        setConversations(convs)
      } catch (e) {
        console.warn('Failed to load conversations:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const recentConvs = conversations.filter((c) => !c.archived).slice(0, 6)

  const handleConversationClick = (conv: Conversation) => {
    setCurrentConversation(conv.id)
    clearMessages()
    navigate(`/tasks/${encodeURIComponent(conv.id)}`)
  }

  return (
    <AppLayout activeTopTab="workbench">
      <div className={styles.container}>
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <Text style={{ fontSize: 20, margin: 0, color: 'var(--h-text)', fontWeight: 600 }}>{getGreeting()}</Text>
            <Text style={{ color: 'var(--h-text-2)', fontSize: 14 }}>有什么我可以帮你的吗？</Text>
          </div>
          <Button type="primary" icon={<Plus size={16} />} size="large" onClick={() => navigate('/new')} className={styles.newTaskBtn}>
            新建任务
          </Button>
        </div>

        <div className={styles.section}>
          <HealthGrid />
        </div>

        <div className={styles.section}>
          <Composer />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <Text style={{ fontSize: 15, fontWeight: 500, color: 'var(--h-text)' }}>最近会话</Text>
            <Button type="link" size="small" onClick={() => navigate('/history')}>查看全部</Button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : recentConvs.length === 0 ? (
            <Empty description="暂无会话" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '20px 0' }} />
          ) : (
            <Row gutter={[12, 12]}>
              {recentConvs.map((conv) => {
                const status: 'done' | 'error' | 'pending' = 'done'
                return (
                  <Col span={8} key={conv.id}>
                    <Card
                      hoverable
                      onClick={() => handleConversationClick(conv)}
                      styles={{ body: { padding: '14px 16px', cursor: 'pointer' } }}
                      className={styles.convCard}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{
                          display: 'inline-block',
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: '#8db580',
                          flexShrink: 0,
                        }} />
                        <Text style={{ fontSize: 12, color: '#8db580' }}>完成</Text>
                        <Clock size={11} style={{ color: 'var(--h-text-3)', marginLeft: 'auto' }} />
                        <Text style={{ fontSize: 11, color: 'var(--h-text-3)' }}>{formatRelativeTime(conv.updated_at)}</Text>
                      </div>
                      <Text style={{
                        fontSize: 14,
                        color: 'var(--h-text)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {conv.title || '无标题会话'}
                      </Text>
                    </Card>
                  </Col>
                )
              })}
            </Row>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
