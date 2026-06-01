import React, { useState } from 'react'
import { Form, Input, Button, Typography, message } from 'antd'
import { User, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '../store/userStore'
import { login, register } from '../utils/api'
import styles from './LoginPage.module.css'

const { Title, Text } = Typography

export function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useUserStore()
  const [isRegistering, setIsRegistering] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const handleLogin = async (values: { username: string; password?: string }) => {
    setLoading(true)
    try {
      await login(values.username, values.password)
      setUser(values.username, false)
      navigate('/')
    } catch (e: any) {
      if (e.message === 'USER_NOT_FOUND') {
        message.error('用户不存在，点击"注册"创建新账户')
      } else {
        message.error('登录失败：' + (e.message || '未知错误'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (values: { username: string; password?: string }) => {
    setLoading(true)
    try {
      await register(values.username, values.password)
      message.success('账号创建成功，请登录')
      setIsRegistering(false)
      form.resetFields()
    } catch (e: any) {
      message.error(e.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#ff7a3d" opacity="0.9" />
            <path d="M2 17L12 22L22 17" stroke="#ff7a3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="#ff7a3d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          </svg>
          <Title level={2} className={styles.title}>Hermes</Title>
          <Text style={{ color: 'var(--h-text-3)' }}>
            {isRegistering ? '创建你的账号' : '登录到桌面客户端'}
          </Text>
        </div>

        <Form
          form={form}
          onFinish={isRegistering ? handleRegister : handleLogin}
          layout="vertical"
          className={styles.form}
          requiredMark={false}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<User size={16} style={{ color: 'var(--h-text-3)' }} />}
              placeholder="输入用户名"
              size="large"
              autoFocus
              style={{ background: 'var(--h-bg-soft)', borderColor: 'var(--h-line)', color: 'var(--h-text)' }}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={isRegistering ? '密码（可选）' : '密码'}
          >
            <Input.Password
              prefix={<Lock size={16} style={{ color: 'var(--h-text-3)' }} />}
              placeholder={isRegistering ? '可选，不设置则无密码' : '输入密码（无密码可留空）'}
              size="large"
              style={{ background: 'var(--h-bg-soft)', borderColor: 'var(--h-line)', color: 'var(--h-text)' }}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{ height: 44, fontSize: 15, background: 'var(--h-accent)', border: 'none' }}
            >
              {loading ? '请稍候...' : (isRegistering ? '注册账号' : '登录')}
            </Button>
          </Form.Item>
        </Form>

        <div className={styles.footer}>
          {isRegistering ? (
            <Text style={{ color: 'var(--h-text-3)' }}>
              已有账号？<Button type="link" size="small" onClick={() => setIsRegistering(false)} style={{ color: 'var(--h-accent)', padding: 0 }}>登录</Button>
            </Text>
          ) : (
            <Text style={{ color: 'var(--h-text-3)' }}>
              没有账号？<Button type="link" size="small" onClick={() => setIsRegistering(true)} style={{ color: 'var(--h-accent)', padding: 0 }}>注册</Button>
            </Text>
          )}
          <Button
            type="link"
            size="small"
            onClick={() => navigate('/')}
            style={{ color: 'var(--h-text-3)', fontSize: 12, padding: 0 }}
          >
            跳过（临时访问）
          </Button>
        </div>
      </div>
    </div>
  )
}
