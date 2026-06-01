import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Input, Empty } from 'antd'
import {
  Search,
  Home,
  LayoutGrid,
  Settings,
  FileText,
  Heart,
  Zap,
  Coins,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import styles from './CommandPalette.module.css'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  keywords: string[]
  category: 'navigation' | 'action' | 'recent' | 'settings'
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CommandItem[]>([])
  const navigate = useNavigate()

  const allCommands: CommandItem[] = [
    { id: 'nav-workbench', label: '工作台', description: '返回首页', icon: <Home size={15} />, action: () => navigate('/'), keywords: ['home', '首页', 'workbench'], category: 'navigation' },
    { id: 'nav-projects', label: '项目列表', description: '查看所有项目', icon: <LayoutGrid size={15} />, action: () => navigate('/projects'), keywords: ['project', '项目', 'workspace'], category: 'navigation' },
    { id: 'nav-settings', label: '设置中心', description: '账号、API、外观配置', icon: <Settings size={15} />, action: () => navigate('/settings'), keywords: ['settings', '设置', 'config'], category: 'settings' },
    { id: 'nav-skills', label: 'Skills 管理', description: '查看和管理 Skills', icon: <Zap size={15} />, action: () => navigate('/capabilities'), keywords: ['skill', 'skills', '能力'], category: 'navigation' },
    { id: 'nav-logs', label: '日志查看', description: '系统日志与健康探针', icon: <FileText size={15} />, action: () => navigate('/observability'), keywords: ['log', '日志', 'logs'], category: 'navigation' },
    { id: 'nav-health', label: '系统健康', description: '健康检查与探针状态', icon: <Heart size={15} />, action: () => navigate('/observability'), keywords: ['health', '健康', 'probe'], category: 'navigation' },
    { id: 'nav-models', label: '模型配置', description: '供应商、API Key、模型选择', icon: <Coins size={15} />, action: () => navigate('/settings'), keywords: ['model', '模型', 'provider', 'api', 'api key'], category: 'navigation' },
    { id: 'nav-automation', label: '自动化例程', description: 'Cron 自动化配置', icon: <Zap size={15} />, action: () => navigate('/automation'), keywords: ['cron', 'automation', '自动化'], category: 'navigation' },
  ]

  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults(allCommands.slice(0, 6)); return }
    const lower = q.toLowerCase()
    setResults(allCommands.filter(
      (cmd) => cmd.label.toLowerCase().includes(lower) || cmd.description?.toLowerCase().includes(lower) || cmd.keywords.some((k) => k.includes(lower))
    ))
  }, [])

  useEffect(() => { if (open) { setQuery(''); search('') } }, [open, search])

  const categoryLabel: Record<string, string> = { navigation: '导航', action: '操作', recent: '最近', settings: '设置' }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      centered
      width={560}
      styles={{
        mask: { backdropFilter: 'blur(4px)' },
        wrapper: { padding: 0, background: '#11100e', border: '1px solid #2a2725', borderRadius: 12 },
      }}
    >
      <div className={styles.container}>
        <Input
          prefix={<Search size={16} style={{ color: '#6d6759' }} />}
          placeholder="搜索命令、页面、设置..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value) }}
          autoFocus
          bordered={false}
          className={styles.searchInput}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        />
        <div className={styles.divider} />
        {results.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: '#6d6759' }}>未找到结果</span>} className={styles.empty} />
        ) : (
          <div className={styles.results}>
            {results.map((item) => (
              <div key={item.id} className={styles.item} onClick={() => { item.action(); onClose() }}>
                <span className={styles.itemIcon}>{item.icon}</span>
                <div className={styles.itemText}>
                  <span className={styles.itemLabel}>{item.label}</span>
                  {item.description && <span className={styles.itemDesc}>{item.description}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className={styles.footer}>
          <span><kbd>↵</kbd> 选择</span>
          <span><kbd>↑↓</kbd> 导航</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </Modal>
  )
}
