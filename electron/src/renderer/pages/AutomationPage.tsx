import React, { useEffect, useState } from 'react'
import { Card, Typography, Tag, Button, Space, Modal, Form, Input, Select, Popconfirm, Spin, Empty, message } from 'antd'
import { Clock, Play, Pause, Plus, Delete, Edit3 } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { listTasks, createTask, deleteTask } from '../utils/api'
import type { Task } from '../utils/api'
import styles from './AutomationPage.module.css'

const { Text } = Typography

function formatTime(isoString: string | null) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatSchedule(expr: string) {
  const parts = expr.split(' ')
  if (parts.length === 5) {
    const [, min, hour, , dow] = parts
    if (dow === '1-5') return `每个工作日 ${hour}:${min.padStart(2, '0')}`
    if (min.startsWith('*/')) return `每 ${min.slice(2)} 分钟`
    return `${hour}:${min.padStart(2, '0')}`

  }
  return expr
}

export function AutomationPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const data = await listTasks()
      setTasks(data)
    } catch (e) {
      console.warn('Failed to load tasks:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (values: any) => {
    try {
      await createTask(values)
      message.success('任务已创建')
      setModalOpen(false)
      form.resetFields()
      load()
    } catch (e) {
      message.error('创建失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    } catch (e) {
      message.error('删除失败')
    }
  }

  return (
    <AppLayout activeTopTab="automation">
      <div className={styles.container}>
        <div className={styles.header}>
          <Text style={{ fontSize: 16, fontWeight: 500, color: 'var(--h-text)' }}>自动化</Text>
          <Button type="primary" icon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
            新建例程
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
        ) : tasks.length === 0 ? (
          <Empty description="暂无自动化任务" style={{ marginTop: 40 }} />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {tasks.map((task) => (
              <Card key={task.id} className={styles.jobCard}>
                <div className={styles.jobHeader}>
                  <div className={styles.jobInfo}>
                    <Text strong style={{ fontSize: 15, color: 'var(--h-text)' }}>{task.name}</Text>
                    <Space size={8} style={{ marginTop: 4 }}>
                      <Tag color={task.enabled ? 'green' : 'default'}>
                        {task.enabled ? '运行中' : '已暂停'}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <Clock size={11} style={{ marginRight: 4 }} />
                        {formatSchedule(task.time_expr)}
                      </Text>
                    </Space>
                  </div>
                  <Space>
                    <Button type="text" icon={task.enabled ? <Pause size={14} /> : <Play size={14} />} size="small">
                      {task.enabled ? '暂停' : '启动'}
                    </Button>
                    <Popconfirm
                      title="删除此任务？"
                      onConfirm={() => handleDelete(task.id)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Button type="text" icon={<Delete size={14} />} size="small" danger />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            ))}
          </Space>
        )}
      </div>

      <Modal
        title="新建自动化任务"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：每日代码审查" />
          </Form.Item>
          <Form.Item name="type" label="类型" initialValue="daily" rules={[{ required: true }]}>
            <Select options={[
              { value: 'once', label: '一次性' },
              { value: 'daily', label: '每日' },
              { value: 'recurring', label: '循环' },
            ]} />
          </Form.Item>
          <Form.Item name="time_expr" label="调度表达式" rules={[{ required: true, message: '请输入表达式' }]}
            extra="例: 0 9 * * 1-5 (每个工作日9点) 或 */30 * * * * (每30分钟)"
          >
            <Input placeholder="0 9 * * 1-5" />
          </Form.Item>
          <Form.Item name="command" label="执行命令" rules={[{ required: true, message: '请输入命令' }]}>
            <Input.TextArea placeholder="例如：帮我审查 src 目录的代码" rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  )
}
