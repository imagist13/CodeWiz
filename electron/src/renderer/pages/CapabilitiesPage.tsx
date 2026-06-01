import React, { useState } from 'react'
import { Card, Table, Tag, Switch, Typography, Button } from 'antd'
import { Zap, Network, Edit3 } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import styles from './CapabilitiesPage.module.css'

const { Title, Text } = Typography

const SKILLS_COLUMNS = [
  { title: '名称', dataIndex: 'name', key: 'name', render: (t: string) => <Text style={{ color: 'var(--h-text)' }}>{t}</Text> },
  { title: '描述', dataIndex: 'desc', key: 'desc', render: (t: string) => <Text type="secondary">{t}</Text> },
  { title: '状态', dataIndex: 'enabled', key: 'enabled', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '已启用' : '已禁用'}</Tag> },
  { title: '使用次数', dataIndex: 'uses', key: 'uses', render: (n: number) => <Text type="secondary">{n}</Text> },
  { title: '操作', key: 'action', render: () => <Button type="link" size="small" icon={<Edit3 size={12} />}>编辑</Button> },
]

const SKILLS = [
  { key: '1', name: 'ReadFile', desc: '读取文件内容', enabled: true, uses: 342 },
  { key: '2', name: 'WriteFile', desc: '写入文件内容', enabled: true, uses: 218 },
  { key: '3', name: 'Grep', desc: '在文件中搜索文本', enabled: true, uses: 156 },
  { key: '4', name: 'Bash', desc: '执行 Shell 命令', enabled: false, uses: 89 },
  { key: '5', name: 'WebSearch', desc: '网络搜索', enabled: true, uses: 201 },
]

const MCP_SERVERS = [
  { key: '1', name: 'Filesystem MCP', status: 'connected', tools: 5 },
  { key: '2', name: 'GitHub MCP', status: 'connected', tools: 12 },
  { key: '3', name: 'Database MCP', status: 'disconnected', tools: 0 },
]

export function CapabilitiesPage() {
  const [tab, setTab] = useState<'skills' | 'mcp'>('skills')

  return (
    <AppLayout activeTopTab="capabilities">
      <div className={styles.container}>
        <Title level={4} style={{ margin: '0 0 20px', color: 'var(--h-text)' }}>能力</Title>

        <div className={styles.tabs}>
          <button className={`${styles.tabBtn} ${tab === 'skills' ? styles.tabBtnActive : ''}`} onClick={() => setTab('skills')}>
            <Zap size={14} />Skills
          </button>
          <button className={`${styles.tabBtn} ${tab === 'mcp' ? styles.tabBtnActive : ''}`} onClick={() => setTab('mcp')}>
            <Network size={14} />MCP 服务器
          </button>
        </div>

        <Card className={styles.card}>
          {tab === 'skills' ? (
            <Table dataSource={SKILLS} columns={SKILLS_COLUMNS} pagination={false} className={styles.table} />
          ) : (
            <Table dataSource={MCP_SERVERS} rowKey="key" columns={[
              { title: '服务器', dataIndex: 'name', key: 'name', render: (t: string) => <Text style={{ color: 'var(--h-text)' }}>{t}</Text> },
              { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'connected' ? 'green' : 'default'}>{v === 'connected' ? '已连接' : '未连接'}</Tag> },
              { title: '工具数', dataIndex: 'tools', key: 'tools', render: (n: number) => <Text type="secondary">{n}</Text> },
              { title: '操作', key: 'action', render: () => <Button type="link" size="small">管理</Button> },
            ]} pagination={false} className={styles.table} />
          )}
        </Card>
      </div>
    </AppLayout>
  )
}
