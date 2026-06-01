import React, { useEffect, useRef } from 'react'
import { Typography, Spin } from 'antd'
import { User, Bot } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import styles from './MessageTimeline.module.css'

const { Text } = Typography

interface Props {
  taskId?: string
}

export function MessageTimeline({ taskId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { messages, isLoading } = useChatStore()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <Spin />
        </div>
        <div ref={bottomRef} />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <Text type="secondary">选择一个会话开始对话，或从左侧新建</Text>
        </div>
        <div ref={bottomRef} />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.message} ${msg.role === 'user' ? styles.user : styles.assistant}`}>
            <div className={styles.avatar}>
              {msg.role === 'user'
                ? <User size={14} style={{ color: '#6e9bd1' }} />
                : <Bot size={14} style={{ color: '#ff7a3d' }} />
              }
            </div>
            <div className={styles.bubble}>
              {msg.thinking && (
                <div className={styles.thinking}>
                  <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                    {msg.thinking}
                  </Text>
                </div>
              )}
              <div className={styles.content}>
                <Text style={{ color: 'var(--h-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </Text>
              </div>
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className={styles.toolCalls}>
                  {msg.tool_calls.map((tc) => (
                    <div key={tc.id} className={`${styles.toolCall} ${styles[tc.status]}`}>
                      <span className={styles.toolName}>{tc.name}</span>
                      <span className={styles.toolStatus}>
                        {tc.status === 'pending' ? '等待' :
                         tc.status === 'running' ? '执行中' :
                         tc.status === 'done' ? '完成' : '错误'}
                      </span>
                      {tc.result !== undefined && tc.result !== null && (
                        <div className={styles.toolResult}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {typeof tc.result === 'string'
                              ? (tc.result.length > 300 ? tc.result.slice(0, 300) + '...' : tc.result)
                              : JSON.stringify(tc.result, null, 2)}
                          </Text>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
