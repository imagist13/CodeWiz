import React, { useEffect, useState } from 'react'
import { Typography, Spin } from 'antd'
import { MessageSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '../../store/chatStore'
import { listConversations, loadConversation } from '../../utils/api'
import styles from './SessionList.module.css'

const { Text } = Typography

interface Props {
  taskId?: string
}

export function SessionList({ taskId }: Props) {
  const navigate = useNavigate()
  const { conversations, setConversations, setMessages, setCurrentConversation } = useChatStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const convs = await listConversations()
        setConversations(convs)
      } catch (e) {
        console.warn('Failed to load sessions:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSelect = async (convId: string) => {
    setLoading(true)
    try {
      const data = await loadConversation(convId)
      const msgs = data.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        tool_calls: m.tool_calls ? JSON.parse(m.tool_calls as any) : undefined,
        timestamp: new Date(m.created_at).getTime(),
      }))
      setMessages(msgs)
      setCurrentConversation(convId)
      navigate(`/tasks/${encodeURIComponent(convId)}`)
    } catch (e) {
      console.warn('Failed to load conversation:', e)
    } finally {
      setLoading(false)
    }
  }

  const activeConvs = conversations.filter((c) => !c.archived)

  return (
    <div className={styles.container}>
      {loading && (
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      )}
      {activeConvs.length === 0 && !loading && (
        <div style={{ padding: '12px 8px' }}>
          <Text style={{ fontSize: 12, color: 'var(--h-text-3)' }}>暂无会话</Text>
        </div>
      )}
      {activeConvs.map((session) => (
        <div
          key={session.id}
          className={`${styles.item} ${session.id === taskId ? styles.active : ''}`}
          onClick={() => handleSelect(session.id)}
        >
          <MessageSquare size={12} style={{ color: 'var(--h-text-3)', flexShrink: 0 }} />
          <Text style={{
            fontSize: 13,
            color: session.id === taskId ? 'var(--h-text)' : 'var(--h-text-2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {session.title || '无标题会话'}
          </Text>
        </div>
      ))}
    </div>
  )
}
