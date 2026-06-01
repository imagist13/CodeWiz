import React, { useState, useEffect } from 'react'
import { Typography, Tabs, Form, Input, Select, Slider, Switch, Button, Tag, Card, message, Divider } from 'antd'
import { User, Key, Palette, Folder, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { useUserStore } from '../store/userStore'
import { useSettingsStore } from '../store/settingsStore'
import { getConfig, saveConfig } from '../utils/api'
import styles from './SettingsPage.module.css'

const { Text } = Typography

type Provider = 'minimax' | 'openai' | 'deepseek' | 'anthropic'

const PROVIDER_META: Record<Provider, { label: string; placeholder: string; baseUrlPlaceholder: string; modelPlaceholder: string }> = {
  minimax: {
    label: 'MiniMax',
    placeholder: 'API Key',
    baseUrlPlaceholder: 'https://api.minimax.chat/v1',
    modelPlaceholder: 'MiniMax-Text-01',
  },
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    modelPlaceholder: 'gpt-4o',
  },
  deepseek: {
    label: 'DeepSeek',
    placeholder: 'API Key',
    baseUrlPlaceholder: 'https://api.deepseek.com/v1',
    modelPlaceholder: 'deepseek-chat',
  },
  anthropic: {
    label: 'Anthropic',
    placeholder: 'API Key',
    baseUrlPlaceholder: '(not configurable)',
    modelPlaceholder: 'claude-sonnet-4-20250514',
  },
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { username, isLoggedIn, logout } = useUserStore()
  const { theme, fontSize, streaming, setTheme, setFontSize, setStreaming } = useSettingsStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [provider, setProvider] = useState<Provider>('minimax')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('MiniMax-Text-01')
  const [baseUrl, setBaseUrl] = useState('https://api.minimax.chat/v1')
  const [temperature, setTemperature] = useState(0.7)
  const [soul, setSoul] = useState('')
  const [workspaceRoot, setWorkspaceRoot] = useState('')

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login')
      return
    }
    const load = async () => {
      setLoading(true)
      try {
        const cfg = await getConfig()
        const p: Provider = (cfg.provider as Provider) || 'minimax'
        setProvider(p)
        setApiKey(cfg.api_key || '')
        setModel(cfg.model || PROVIDER_META[p].modelPlaceholder)
        setBaseUrl(cfg.base_url || '')
        setTemperature(cfg.temperature ?? 0.7)
        setSoul(cfg.soul || '')
        setWorkspaceRoot(cfg.workspace_root || '')
      } catch { /* backend may not be ready */ }
      finally { setLoading(false) }
    }
    load()
  }, [isLoggedIn, username])

  const handleProviderChange = (p: Provider) => {
    setProvider(p)
    setModel(PROVIDER_META[p].modelPlaceholder)
    setBaseUrl(PROVIDER_META[p].baseUrlPlaceholder === '(not configurable)' ? '' : PROVIDER_META[p].baseUrlPlaceholder)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { username, provider }
      if (provider === 'minimax') {
        body.minimax_api_key = apiKey; body.minimax_model = model; body.minimax_base_url = baseUrl
      } else if (provider === 'deepseek') {
        body.deepseek_api_key = apiKey; body.deepseek_model = model; body.deepseek_base_url = baseUrl
      } else if (provider === 'anthropic') {
        body.anthropic_api_key = apiKey; body.anthropic_model = model
      } else {
        body.api_key = apiKey; body.model = model; body.base_url = baseUrl
      }
      body.temperature = temperature
      body.soul = soul
      body.workspace_root = workspaceRoot
      // Sync appearance preferences to backend
      body.font_size = fontSize
      body.theme = theme

      await saveConfig(body)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败，请检查后端是否运行'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const tabItems = [
    {
      key: 'account',
      label: (
        <span className={styles.tabLabel}>
          <User size={14} />账号
        </span>
      ),
      children: (
        <div className={styles.section}>
          <Text style={{ fontSize: 15, fontWeight: 500, color: 'var(--h-text)', display: 'block', marginBottom: 16 }}>
            账号信息
          </Text>
          <Card className={styles.card}>
            <Form layout="vertical">
              <Form.Item label="用户名">
                <Input value={username || ''} readOnly size="large" />
              </Form.Item>
              <Form.Item label="状态">
                <Tag color="green" icon={<CheckCircle size={12} />}>已登录</Tag>
              </Form.Item>
            </Form>
            <Divider style={{ margin: '16px 0' }} />
            <Button danger onClick={handleLogout}>退出登录</Button>
          </Card>
        </div>
      ),
    },
    {
      key: 'api',
      label: (
        <span className={styles.tabLabel}>
          <Key size={14} />API
        </span>
      ),
      children: (
        <div className={styles.section}>
          <Text style={{ fontSize: 15, fontWeight: 500, color: 'var(--h-text)', display: 'block', marginBottom: 16 }}>
            模型配置
          </Text>
          <Card className={styles.card} loading={loading}>
            <Form layout="vertical">
              <Form.Item label="供应商">
                <Select
                  value={provider}
                  onChange={handleProviderChange}
                  size="large"
                  options={[
                    { value: 'minimax', label: 'MiniMax' },
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'deepseek', label: 'DeepSeek' },
                    { value: 'anthropic', label: 'Anthropic' },
                  ]}
                />
              </Form.Item>

              <Form.Item label={`${PROVIDER_META[provider].label} API Key`}>
                <Input.Password
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={PROVIDER_META[provider].placeholder}
                  size="large"
                />
              </Form.Item>

              <Form.Item label="模型">
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={PROVIDER_META[provider].modelPlaceholder}
                  size="large"
                />
              </Form.Item>

              {provider !== 'anthropic' && (
                <Form.Item label="Base URL">
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={PROVIDER_META[provider].baseUrlPlaceholder}
                    size="large"
                  />
                </Form.Item>
              )}

              <Form.Item
                label={
                  <span style={{ fontSize: 13, color: 'var(--h-text-2)' }}>
                    Temperature: <strong>{temperature}</strong>
                  </span>
                }
              >
                <Slider
                  min={0} max={2} step={0.1}
                  value={temperature}
                  onChange={setTemperature}
                  marks={{ 0: '0', 1: '1', 2: '2' }}
                />
              </Form.Item>

              <Form.Item label="System Prompt">
                <Input.TextArea
                  value={soul}
                  onChange={(e) => setSoul(e.target.value)}
                  placeholder="你是一个乐于助人的 AI 助手..."
                  rows={4}
                />
              </Form.Item>

              <Form.Item
                label={<span className={styles.fieldLabel}><Folder size={13} /> Workspace Root</span>}
                extra={<Text type="secondary" style={{ fontSize: 12 }}>所有工具在此目录下操作，留空自动检测项目根目录</Text>}
              >
                <Input
                  value={workspaceRoot}
                  onChange={(e) => setWorkspaceRoot(e.target.value)}
                  placeholder="D:\桌面\cdfg"
                  size="large"
                />
              </Form.Item>

              <Form.Item>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Button
                    type="primary"
                    onClick={handleSave}
                    loading={saving}
                    size="large"
                  >
                    {saved ? '已保存!' : '保存配置'}
                  </Button>
                  {saved && (
                    <Text style={{ color: '#8db580', fontSize: 13 }}>
                      <CheckCircle size={14} style={{ marginRight: 4 }} />
                      保存成功
                    </Text>
                  )}
                </div>
              </Form.Item>
            </Form>
          </Card>
        </div>
      ),
    },
    {
      key: 'appearance',
      label: (
        <span className={styles.tabLabel}>
          <Palette size={14} />外观
        </span>
      ),
      children: (
        <div className={styles.section}>
          <Text style={{ fontSize: 15, fontWeight: 500, color: 'var(--h-text)', display: 'block', marginBottom: 16 }}>
            外观设置
          </Text>
          <Card className={styles.card}>
            <Form layout="vertical">
              <Form.Item label="主题">
                <Select
                  value={theme}
                  onChange={(v) => setTheme(v as 'dark' | 'light')}
                  size="large"
                  options={[
                    { value: 'dark', label: '深色' },
                    { value: 'light', label: '浅色' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label={
                  <span style={{ fontSize: 13, color: 'var(--h-text-2)' }}>
                    字体大小: <strong>{fontSize}px</strong>
                  </span>
                }
              >
                <Slider
                  min={12} max={20}
                  value={fontSize}
                  onChange={setFontSize}
                  marks={{ 12: '12', 16: '16', 20: '20' }}
                />
              </Form.Item>
              <Form.Item
                label={
                  <span style={{ fontSize: 13, color: 'var(--h-text-2)' }}>
                    启用流式输出
                  </span>
                }
              >
                <Switch checked={streaming} onChange={setStreaming} />
              </Form.Item>
            </Form>
          </Card>
        </div>
      ),
    },
  ]

  return (
    <AppLayout activeTopTab="settings">
      <div className={styles.container}>
        <Tabs
          defaultActiveKey="api"
          items={tabItems}
          className={styles.tabs}
        />
      </div>
    </AppLayout>
  )
}
