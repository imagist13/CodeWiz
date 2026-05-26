'use client';

import { useSuperAgentStore } from '@/lib/super-agent-store';

export default function Timeline() {
  const currentSession = useSuperAgentStore((s) => s.currentSession);
  const advanceStage = useSuperAgentStore((s) => s.advanceStage);

  if (!currentSession || !currentSession.stages) {
    return (
      <div className="timeline">
        <div className="timeline-title">工作流</div>
        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
          暂无会话数据
        </div>
      </div>
    );
  }

  const { stages, stage: currentStage } = currentSession;

  const getStatusIcon = (s: any) => {
    if (s.status === 'done') return '✓';
    if (s.status === 'active') return '▶';
    return '○';
  };

  const handleAdvance = () => {
    advanceStage();
  };

  return (
    <div className="timeline">
      <div className="timeline-title">工作流</div>
      {stages.map((s, idx) => {
        const isActive = s.status === 'active';
        const isDone = s.status === 'done';
        const isCurrent = idx + 1 === currentStage;

        return (
          <div
            key={s.id || idx}
            className={`timeline-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
            onClick={handleAdvance}
            title={isActive ? '点击进入下一阶段' : ''}
          >
            <span className="timeline-number">{s.id}</span>
            <div className="timeline-dot">
              {getStatusIcon(s)}
              {isActive && (
                <span
                  style={{
                    width: 12,
                    height: 12,
                    display: 'inline-block',
                    animation: 'spin 1s linear infinite',
                  }}
                />
              )}
            </div>
            <span className="timeline-label">{s.name}</span>
          </div>
        );
      })}
    </div>
  );
}
