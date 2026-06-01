import React from 'react'
import { Card, Typography, Tag, Table } from 'antd'
import { CheckCircle, XCircle, Star } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import styles from './ModelsPage.module.css'

const { Title, Text } = Typography

const PROVIDERS = [
  { id: 'minimax', name: 'MiniMax', models: [{ name: 'MiniMax-Text-01', context: '100K', status: 'active', default: true }, { name: 'MiniMax-V01', context: '128K', status: 'active', default: false }], quotaUsed: 45 },
  { id: 'openai', name: 'OpenAI', models: [{ name: 'gpt-4o', context: '128K', status: 'active', default: true }, { name: 'gpt-4o-mini', context: '128K', status: 'active', default: false }], quotaUsed: 72 },
  { id: 'deepseek', name: 'DeepSeek', models: [{ name: 'deepseek-chat', context: '64K', status: 'active', default: true }], quotaUsed: 23 },
  { id: 'anthropic', name: 'Anthropic', models: [{ name: 'claude-sonnet-4', context: '200K', status: 'error', default: true }], quotaUsed: 100 },
]

export function ModelsPage() {
  return (
    <AppLayout activeTopTab="models">
      <div className={styles.container}>
        <Title level={4} style={{ margin: '0 0 20px', color: 'var(--h-text)' }}>模型</Title>

        {PROVIDERS.map((provider) => (
          <Card key={provider.id} className={styles.providerCard} style={{ marginBottom: 16 }}>
            <div className={styles.providerHeader}>
              <div>
                <Title level={5} style={{ margin: 0, color: 'var(--h-text)' }}>{provider.name}</Title>
                <Tag color={provider.quotaUsed >= 90 ? 'red' : provider.quotaUsed >= 70 ? 'orange' : 'green'} style={{ marginTop: 4 }}>配额 {provider.quotaUsed}%</Tag>
              </div>
            </div>
            <Table dataSource={provider.models} rowKey="name" pagination={false} size="small" className={styles.table} columns={[
              { title: '模型', dataIndex: 'name', key: 'name', render: (t: string, r: any) => (
                <span style={{ fontFamily: 'var(--h-font-mono)', fontSize: 13, color: 'var(--h-text)' }}>
                  {t} {r.default && <Star size={12} color="#ff7a3d" style={{ marginLeft: 4 }} />}
                </span>
              )},
              { title: '上下文', dataIndex: 'context', key: 'context', render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{t}</Text> },
              { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => v === 'active'
                ? <Tag icon={<CheckCircle size={11} />} color="success">可用</Tag>
                : <Tag icon={<XCircle size={11} />} color="error">异常</Tag> },
              { title: '操作', key: 'action', render: () => <Text type="secondary" style={{ fontSize: 12 }}>默认</Text> },
            ]} />
          </Card>
        ))}
      </div>
    </AppLayout>
  )
}
