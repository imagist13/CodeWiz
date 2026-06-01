import React, { useEffect, useState } from 'react'
import { Typography, Tag, Table, Card, Space } from 'antd'
import { FileText, Heart, Search } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { checkHealth } from '../utils/api'
import styles from './ObservabilityPage.module.css'

const { Text } = Typography

export function ObservabilityPage() {
  const [tab, setTab] = useState<'logs' | 'health'>('health')
  const [backendStatus, setBackendStatus] = useState<{ ok: boolean; detail: string }>({
    ok: false,
    detail: 'Checking...',
  })

  useEffect(() => {
    const check = async () => {
      try {
        await checkHealth()
        setBackendStatus({ ok: true, detail: 'Connected — 1478' })
      } catch {
        setBackendStatus({ ok: false, detail: 'Disconnected' })
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const probes = [
    { name: 'Gateway', status: backendStatus.ok ? 'ok' : 'error', detail: backendStatus.detail },
    { name: 'Runtime', status: backendStatus.ok ? 'ok' : 'error', detail: 'FastAPI — v1.0' },
    { name: 'Database', status: backendStatus.ok ? 'ok' : 'error', detail: 'SQLite — Connected' },
    { name: 'LLM Provider', status: backendStatus.ok ? 'ok' : 'warn', detail: 'Configure in Settings' },
    { name: 'Workspace', status: 'ok', detail: 'Indexed' },
    { name: 'Skills', status: 'ok', detail: 'Tools loaded' },
    { name: 'Health Check', status: backendStatus.ok ? 'ok' : 'error', detail: backendStatus.detail },
  ]

  const STATUS_COLOR: Record<string, string> = {
    ok: 'rgba(141, 181, 128, 0.08)',
    error: 'rgba(217, 102, 102, 0.08)',
    warn: 'rgba(232, 184, 93, 0.08)',
  }

  const STATUS_BORDER: Record<string, string> = {
    ok: 'rgba(141, 181, 128, 0.2)',
    error: 'rgba(217, 102, 102, 0.2)',
    warn: 'rgba(232, 184, 93, 0.2)',
  }

  return (
    <AppLayout activeTopTab="observability">
      <div className={styles.container}>
        <Text style={{ fontSize: 16, fontWeight: 500, color: 'var(--h-text)', display: 'block', marginBottom: 20 }}>
          可观测性
        </Text>

        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${tab === 'health' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('health')}
          >
            <Heart size={14} />健康
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'logs' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('logs')}
          >
            <FileText size={14} />日志
          </button>
        </div>

        {tab === 'health' ? (
          <Card className={styles.card}>
            <Space size={12} wrap>
              {probes.map((probe) => (
                <div
                  key={probe.name}
                  style={{
                    minWidth: 160,
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: STATUS_COLOR[probe.status],
                    border: `1px solid ${STATUS_BORDER[probe.status]}`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--h-text)', marginBottom: 4 }}>
                    {probe.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--h-text-2)' }}>
                    {probe.detail}
                  </div>
                </div>
              ))}
            </Space>
          </Card>
        ) : (
          <Card className={styles.card}>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                日志来自后端运行时，请查看终端输出或 electron-log 文件
              </Text>
            </div>
            <Table
              dataSource={[]}
              columns={[
                { title: '时间', dataIndex: 'time', key: 'time', width: 90 },
                { title: '级别', dataIndex: 'level', key: 'level', width: 80 },
                { title: '来源', dataIndex: 'source', key: 'source', width: 100 },
                { title: '消息', dataIndex: 'msg', key: 'msg' },
              ]}
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无日志数据 — 后端日志请查看终端或日志文件' }}
            />
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
