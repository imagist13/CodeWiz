import React, { useState } from 'react'
import { Typography, Spin } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { Composer } from '../components/workbench/Composer'
import { useChatStore } from '../store/chatStore'
import { createConversation } from '../utils/api'
import styles from './NewTaskPage.module.css'

const { Text } = Typography

export function NewTaskPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const { setCurrentConversation, clearMessages } = useChatStore()

  const handleSend = async (text: string) => {
    setCreating(true)
    try {
      const conv = await createConversation(text.slice(0, 50))
      setCurrentConversation(conv.id)
      clearMessages()
      navigate(`/tasks/${encodeURIComponent(conv.id)}`)
    } catch (e) {
      console.error('Failed to create conversation:', e)
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppLayout activeTopTab="workbench">
      <div className={styles.container}>
        <div className={styles.header}>
          <Text style={{ color: 'var(--h-text-2)', cursor: 'pointer', fontSize: 14 }} onClick={() => navigate('/')}>
            <ArrowLeft size={14} style={{ marginRight: 4 }} /> 返回
          </Text>
          <Text style={{ fontSize: 16, fontWeight: 500, color: 'var(--h-text)' }}>新建会话</Text>
        </div>
        <div className={styles.content}>
          {creating ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: 'var(--h-text-2)' }}>正在创建会话...</div>
            </div>
          ) : (
            <Composer onSend={handleSend} />
          )}
        </div>
      </div>
    </AppLayout>
  )
}
