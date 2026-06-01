import React, { useEffect, useState } from 'react'
import { Button, Typography, Tag } from 'antd'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { MessageTimeline } from '../components/task/MessageTimeline'
import { RightPanel } from '../components/task/RightPanel'
import { SessionList } from '../components/task/SessionList'
import { Composer } from '../components/workbench/Composer'
import { useChatStore } from '../store/chatStore'
import { usePipelineStore } from '../store/pipelineStore'
import { loadConversation } from '../utils/api'
import { useSSE } from '../hooks/useSSE'
import styles from './TaskDetailPage.module.css'

const { Text } = Typography

export function TaskDetailPage() {
  const [rightPanelVisible, setRightPanelVisible] = useState(true)
  const [activeRightTab, setActiveRightTab] = useState('files')
  const { taskId } = useParams<{ taskId: string }>()
  const { messages, setMessages, setCurrentConversation, currentConversationId, isStreaming } = useChatStore()
  const { activePhase, phaseStatus, phaseDescription, reset: resetPipeline } = usePipelineStore()
  const { send } = useSSE()

  useEffect(() => {
    if (!taskId) return
    const decodedId = decodeURIComponent(taskId)

    const load = async () => {
      try {
        const data = await loadConversation(decodedId)
        const msgs = data.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          tool_calls: m.tool_calls ? JSON.parse(m.tool_calls as any) : undefined,
          timestamp: new Date(m.created_at).getTime(),
        }))
        setMessages(msgs)
        setCurrentConversation(decodedId)
      } catch (e) {
        console.warn('Failed to load conversation:', e)
      }
    }
    load()

    return () => {
      resetPipeline()
    }
  }, [taskId])

  const handleSend = async (text: string) => {
    await send(text, currentConversationId || undefined)
  }

  const phaseLabels: Record<string, string> = {
    clarify: '澄清',
    plan: '规划',
    code: '编码',
    lint: '检查',
    pr: 'PR',
  }
  const phaseOrder = ['clarify', 'plan', 'code', 'lint', 'pr']

  return (
    <AppLayout activeTopTab="workbench">
      <div className={styles.threeColLayout}>
        <div className={styles.leftSider}>
          <div className={styles.leftHeader}>
            <Button type="text" icon={<ArrowLeft size={14} />} onClick={() => window.history.back()} size="small" className={styles.backBtn}>
              返回
            </Button>
          </div>
          <SessionList taskId={taskId} />
        </div>

        <div className={styles.middleContent}>
          {isStreaming && activePhase && (
            <div style={{
              padding: '10px 20px',
              borderBottom: '1px solid var(--h-line)',
              background: 'rgba(255,122,61,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexShrink: 0,
            }}>
              <Text style={{ fontSize: 12, color: 'var(--h-text-2)', flexShrink: 0 }}>Pipeline:</Text>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                {phaseOrder.map((phase) => {
                  const status = phaseStatus[phase as keyof typeof phaseStatus]
                  const label = phaseLabels[phase]
                  const isActive = activePhase === phase
                  return (
                    <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag
                        color={status === 'done' ? 'success' : status === 'running' ? 'processing' : status === 'error' ? 'error' : 'default'}
                        style={{ fontSize: 11, margin: 0 }}
                      >
                        {label}
                      </Tag>
                      {phase !== 'pr' && <Text style={{ fontSize: 12, color: 'var(--h-text-3)' }}>/</Text>}
                    </div>
                  )
                })}
              </div>
              {phaseDescription && (
                <Text style={{ fontSize: 12, color: 'var(--h-text-3)', flexShrink: 0 }}>
                  {phaseDescription}
                </Text>
              )}
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <MessageTimeline taskId={taskId} />
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--h-line)', flexShrink: 0 }}>
            <Composer onSend={handleSend} />
          </div>
        </div>

        {rightPanelVisible && (
          <div className={styles.rightSider}>
            <div className={styles.rightHeader}>
              <div className={styles.rightTabs}>
                {['files', 'artifacts', 'terminal', 'logs'].map((tab) => (
                  <button
                    key={tab}
                    className={`${styles.tabBtn} ${activeRightTab === tab ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveRightTab(tab)}
                  >
                    {tab === 'files' ? '文件' : tab === 'artifacts' ? '产物' : tab === 'terminal' ? '终端' : '日志'}
                  </button>
                ))}
              </div>
              <Button type="text" icon={<X size={14} />} size="small" onClick={() => setRightPanelVisible(false)} className={styles.closeBtn} />
            </div>
            <RightPanel activeTab={activeRightTab} />
          </div>
        )}

        {!rightPanelVisible && (
          <Button
            type="text"
            icon={<ArrowRight size={14} />}
            onClick={() => setRightPanelVisible(true)}
            className={styles.toggleRightBtn}
            title="展开右侧面板"
          />
        )}
      </div>
    </AppLayout>
  )
}
