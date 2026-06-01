import React, { useEffect, useState } from 'react'
import { Tooltip } from 'antd'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { checkHealth } from '../../utils/api'
import styles from './HealthGrid.module.css'

interface Probe {
  key: string
  label: string
  status: 'ok' | 'warn' | 'error' | 'loading'
  detail?: string
}

const STATUS_ICON = {
  ok: <CheckCircle size={16} color="#8db580" />,
  error: <XCircle size={16} color="#d96666" />,
  warn: <AlertCircle size={16} color="#e8b85d" />,
  loading: <Loader2 size={16} color="#6e9bd1" className="animate-spin" />,
}

const STATUS_BG = {
  ok: 'rgba(141, 181, 128, 0.08)',
  error: 'rgba(217, 102, 102, 0.08)',
  warn: 'rgba(232, 184, 93, 0.08)',
  loading: 'rgba(110, 155, 209, 0.08)',
}

const STATUS_BORDER = {
  ok: 'rgba(141, 181, 128, 0.2)',
  error: 'rgba(217, 102, 102, 0.2)',
  warn: 'rgba(232, 184, 93, 0.2)',
  loading: 'rgba(110, 155, 209, 0.2)',
}

export function HealthGrid() {
  const [probes, setProbes] = useState<Probe[]>([
    { key: 'gateway', label: 'Gateway', status: 'loading', detail: 'Checking...' },
    { key: 'runtime', label: 'Runtime', status: 'loading', detail: 'Checking...' },
    { key: 'db', label: 'Database', status: 'loading', detail: 'Checking...' },
    { key: 'llm', label: 'LLM', status: 'loading', detail: 'Checking...' },
    { key: 'workspace', label: 'Workspace', status: 'loading', detail: 'Checking...' },
    { key: 'skills', label: 'Skills', status: 'loading', detail: 'Checking...' },
  ])

  useEffect(() => {
    const check = async () => {
      try {
        await checkHealth()
        setProbes((prev) =>
          prev.map((p) =>
            p.key === 'gateway' || p.key === 'runtime' || p.key === 'db'
              ? { ...p, status: 'ok', detail: 'Connected' }
              : p.key === 'llm'
              ? { ...p, status: 'warn', detail: 'Configure in Settings' }
              : p.key === 'workspace'
              ? { ...p, status: 'ok', detail: 'Ready' }
              : p.key === 'skills'
              ? { ...p, status: 'ok', detail: 'Tools loaded' }
              : p
          )
        )
      } catch {
        setProbes((prev) =>
          prev.map((p) =>
            ['gateway', 'runtime', 'db', 'llm'].includes(p.key)
              ? { ...p, status: 'error', detail: 'Disconnected' }
              : { ...p, status: 'error', detail: 'Unavailable' }
          )
        )
      }
    }
    check()
    const interval = setInterval(check, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={styles.grid}>
      {probes.map((probe) => (
        <Tooltip key={probe.key} title={probe.detail}>
          <div
            className={styles.probe}
            style={{
              background: STATUS_BG[probe.status],
              border: `1px solid ${STATUS_BORDER[probe.status]}`,
            }}
          >
            {STATUS_ICON[probe.status]}
            <span className={styles.label}>{probe.label}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  )
}
