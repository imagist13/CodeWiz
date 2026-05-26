'use client';

import { useSuperAgentStore } from '@/lib/super-agent-store';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function PlanPanel({ collapsed, onToggle }: Props) {
  const plan = useSuperAgentStore((s) => s.currentSession?.plan);

  if (!plan) {
    return (
      <div className="plan-panel">
        <div className="empty-state">
          <div className="empty-state-text">暂无执行方案</div>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-panel">
      <div className="plan-panel-header">
        <span className="plan-panel-title">执行方案</span>
        <button className="plan-panel-close" onClick={onToggle} title="收起面板">
          ✕
        </button>
      </div>

      {/* Modules */}
      {plan.modules && plan.modules.length > 0 && (
        <div className="plan-section">
          <div className="plan-section-title">变更模块</div>
          <div>
            {plan.modules.map((mod: any, i: number) => (
              <span key={mod.name || i} className="plan-module-tag">
                {mod.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* File Changes */}
      {plan.files && plan.files.length > 0 && (
        <div className="plan-section">
          <div className="plan-section-title">文件变更</div>
          <div>
            {plan.files.map((file: any, i: number) => (
              <div key={i} className="plan-file-entry">
                <div>
                  <span style={{ color: file.status === 'added' ? 'var(--color-success)' : 'var(--color-warning)', marginRight: 8 }}>
                    {file.status === 'added' ? '+' : '~'}
                  </span>
                  <span className="plan-file-name">{file.path}</span>
                </div>
                <div className="plan-file-changes">
                  <span className="add">+{file.added || 0}</span>
                  <span className="del">-{file.removed || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
