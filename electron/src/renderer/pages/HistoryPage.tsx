import React, { useEffect, useState } from 'react'
import { Table, Typography, Tag, Button, Input, Space, Popconfirm, Spin, Empty } from 'antd'
import { Search, ArrowRight, Delete, Archive } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { listConversations, deleteConversation, renameConversation } from '../utils/api'
import type { Conversation } from '../utils/api'
import styles from './HistoryPage.module.css'

const { Text } = Typography

function formatTime(isoString: string) {
  const d = new Date(isoString)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return d.toLocaleDateString('zh-CN')
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filtered, setFiltered] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const convs = await listConversations()
        setConversations(convs)
        setFiltered(convs)
      } catch (e) {
        console.warn('Failed to load conversations:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(conversations)
    } else {
      const q = search.toLowerCase()
      setFiltered(conversations.filter((c) => c.title.toLowerCase().includes(q)))
    }
  }, [search, conversations])

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
    } catch (e) {
      console.warn('Failed to delete:', e)
    }
  }

  const handleRowClick = (conv: Conversation) => {
    navigate(`/tasks/${encodeURIComponent(conv.id)}`)
  }

  return (
    <AppLayout activeTopTab="workbench">
      <div className={styles.container}>
        <div className={styles.header}>
          <Text style={{ fontSize: 16, fontWeight: 500, color: 'var(--h-text)' }}>会话历史</Text>
          <Input
            prefix={<Search size={14} style={{ color: '#6d6759' }} />}
            placeholder="搜索会话..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260 }}
          />
        </div>

        <div className={styles.card}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
          ) : filtered.length === 0 ? (
            <Empty description="暂无会话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              dataSource={filtered}
              rowKey="id"
              pagination={{ pageSize: 20 }}
              onRow={(record) => ({
                onClick: () => handleRowClick(record),
                style: { cursor: 'pointer' },
              })}
              className={styles.table}
              columns={[
                {
                  title: '会话',
                  dataIndex: 'title',
                  key: 'title',
                  render: (t: string) => (
                    <Text style={{ color: 'var(--h-text)' }}>{t || '无标题会话'}</Text>
                  ),
                },
                {
                  title: '消息数',
                  dataIndex: 'message_count',
                  key: 'message_count',
                  width: 100,
                  render: (n: number) => (
                    <Text type="secondary" style={{ fontSize: 12 }}>{n} 条</Text>
                  ),
                },
                {
                  title: '时间',
                  dataIndex: 'updated_at',
                  key: 'updated_at',
                  width: 120,
                  render: (t: string) => (
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(t)}</Text>
                  ),
                },
                {
                  title: '',
                  key: 'action',
                  width: 80,
                  render: (_, r) => (
                    <Space>
                      <Button
                        type="text"
                        icon={<ArrowRight size={14} />}
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleRowClick(r) }}
                      />
                      <Popconfirm
                        title="删除会话？"
                        description="此操作不可恢复"
                        onConfirm={(e) => { e?.stopPropagation(); handleDelete(r.id) }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Button
                          type="text"
                          icon={<Delete size={14} />}
                          size="small"
                          danger
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </div>
      </div>
    </AppLayout>
  )
}
