import React from 'react'
import { Typography, Empty } from 'antd'
import { FileText } from 'lucide-react'
import { usePipelineStore } from '../../store/pipelineStore'
import styles from './RightPanel.module.css'

const { Text } = Typography

interface Props {
  taskId?: string
  activeTab: string
}

export function RightPanel({ activeTab }: Props) {
  const { changedFiles, lintResult } = usePipelineStore()

  if (activeTab === 'files') {
    if (changedFiles.length === 0) {
      return (
        <div className={styles.empty}>
          <Empty description="暂无变更文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }
    return (
      <div className={styles.panel}>
        {changedFiles.map((file) => (
          <div key={file} className={styles.fileItem}>
            <FileText size={14} style={{ color: 'var(--h-text-3)', flexShrink: 0 }} />
            <Text style={{ fontSize: 13, color: 'var(--h-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {file}
            </Text>
          </div>
        ))}
      </div>
    )
  }

  if (activeTab === 'artifacts') {
    return (
      <div className={styles.terminal}>
        <Empty description="产物列表将在任务完成后显示" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  if (activeTab === 'terminal') {
    if (lintResult) {
      return (
        <div className={styles.terminal}>
          <Text style={{ fontSize: 12, color: 'var(--h-text-2)', padding: 12, display: 'block' }}>
            Lint 结果 ({lintResult.durationMs}ms)
          </Text>
          <div style={{ padding: '0 12px 12px', fontFamily: 'var(--h-font-mono)', fontSize: 12 }}>
            <div>通过率: {Math.round(lintResult.lintPassRate * 100)}%</div>
            <div>文件检查: {lintResult.filesChecked}</div>
            {lintResult.stdout && (
              <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--h-text-2)', marginTop: 8 }}>
                {lintResult.stdout.slice(0, 500)}
              </pre>
            )}
          </div>
        </div>
      )
    }
    return (
      <div className={styles.terminal}>
        <Text type="secondary" style={{ fontSize: 12, padding: 12, display: 'block' }}>
          终端输出将在任务运行时显示
        </Text>
      </div>
    )
  }

  return (
    <div className={styles.terminal}>
      <Text type="secondary" style={{ fontSize: 12, padding: 12, display: 'block' }}>
        日志将在任务运行时实时显示
      </Text>
    </div>
  )
}
