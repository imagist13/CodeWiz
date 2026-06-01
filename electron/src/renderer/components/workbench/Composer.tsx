import React, { useState } from 'react'
import { Button, Tooltip, message } from 'antd'
import { Send, FileText, Zap, Settings, Square } from 'lucide-react'
import { useSSE } from '../../hooks/useSSE'
import { useChatStore } from '../../store/chatStore'
import { createConversation } from '../../utils/api'
import styles from './Composer.module.css'

interface Props {
  onSend?: (text: string, conversationId?: string) => void
}

export function Composer({ onSend }: Props) {
  const [value, setValue] = useState('')
  const { send, abort } = useSSE()
  const { currentConversationId, setCurrentConversation } = useChatStore()
  const isStreaming = useChatStore((s) => s.isStreaming)
  const error = useChatStore((s) => s.error)

  const handleSend = async () => {
    if (!value.trim()) return
    const text = value.trim()
    setValue('')

    if (onSend) {
      onSend(text, currentConversationId || undefined)
      return
    }

    let convId = currentConversationId

    if (!convId) {
      try {
        const conv = await createConversation(text.slice(0, 50))
        convId = conv.id
        setCurrentConversation(convId)
      } catch (e) {
        message.error('创建会话失败')
        setValue(text)
        return
      }
    }

    await send(text, convId)
  }

  return (
    <div className={styles.container}>
      {error && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 8,
          background: 'rgba(217,102,102,0.1)',
          border: '1px solid rgba(217,102,102,0.3)',
          borderRadius: 6,
          color: '#d96666',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="描述你想要完成的任务... 例如：帮我重构 src/utils 目录下的代码"
          rows={3}
          className={styles.textarea}
          style={{
            width: '100%',
            minHeight: 80,
            maxHeight: 200,
            resize: 'vertical',
            padding: '10px 12px',
            background: 'var(--h-bg-soft)',
            border: '1px solid var(--h-line)',
            borderRadius: 8,
            color: 'var(--h-text)',
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--h-accent)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--h-line)'}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              if (isStreaming) {
                abort()
              } else {
                handleSend()
              }
            }
          }}
          disabled={isStreaming}
        />
      </div>
      <div className={styles.toolbar}>
        <div className={styles.tools}>
          <Tooltip title="附加文件 (@file)">
            <button className={styles.toolBtn} disabled>
              <FileText size={14} />
              <span>@文件</span>
            </button>
          </Tooltip>
          <Tooltip title="使用 Skill (/skill)">
            <button className={styles.toolBtn} disabled>
              <Zap size={14} />
              <span>/Skill</span>
            </button>
          </Tooltip>
          <Tooltip title="高级设置">
            <button className={styles.toolBtn} disabled>
              <Settings size={14} />
            </button>
          </Tooltip>
        </div>
        {isStreaming ? (
          <Tooltip title="停止生成 (Ctrl+Enter)">
            <Button
              danger
              icon={<Square size={14} fill="currentColor" />}
              onClick={abort}
              className={styles.stopBtn}
            >
              停止
            </Button>
          </Tooltip>
        ) : (
          <Button
            type="primary"
            icon={<Send size={14} />}
            onClick={handleSend}
            disabled={!value.trim()}
            className={styles.sendBtn}
          >
            发送
          </Button>
        )}
      </div>
    </div>
  )
}
