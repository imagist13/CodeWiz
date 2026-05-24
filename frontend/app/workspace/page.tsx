'use client';

import { useState, useEffect } from 'react';
import { useSuperAgentStore } from '@/lib/super-agent-store';
import Timeline from '@/components/super-agent/Timeline';
import ChatArea from '@/components/super-agent/ChatArea';
import PlanPanel from '@/components/super-agent/PlanPanel';
import PreviewPanel from '@/components/super-agent/PreviewPanel';

export default function WorkspacePage() {
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [bottomPanel, setBottomPanel] = useState<'diff' | 'test' | 'preview' | null>('preview');

  const currentProject = useSuperAgentStore((s) => s.currentProject);
  const loadCurrentProject = useSuperAgentStore((s) => s.loadCurrentProject);
  const loadCurrentSession = useSuperAgentStore((s) => s.loadCurrentSession);
  const loadSkills = useSuperAgentStore((s) => s.loadSkills);

  useEffect(() => {
    const init = async () => {
      await loadCurrentProject();
      await loadSkills();
    };
    init();
  }, [loadCurrentProject, loadSkills]);

  useEffect(() => {
    if (currentProject?.id) {
      loadCurrentSession(currentProject.id);
    }
  }, [currentProject?.id, loadCurrentSession]);

  const toggleBottomPanel = (panel: 'diff' | 'test' | 'preview') => {
    setBottomPanel(bottomPanel === panel ? null : panel);
  };

  return (
    <div className="workspace">
      {/* Left: Timeline */}
      <div className="workspace-left">
        <Timeline />
      </div>

      {/* Center: Chat Area + Bottom Panel */}
      <div className="workspace-center">
        <ChatArea />

        {/* Tab Bar - 默认选中预览 */}
        <div className="tab-bar">
          <button
            className={`tab-bar-item ${bottomPanel === 'diff' ? 'active' : ''}`}
            onClick={() => toggleBottomPanel('diff')}
          >
            Diff
          </button>
          <button
            className={`tab-bar-item ${bottomPanel === 'test' ? 'active' : ''}`}
            onClick={() => toggleBottomPanel('test')}
          >
            测试
          </button>
          <button
            className={`tab-bar-item ${bottomPanel === 'preview' ? 'active' : ''}`}
            onClick={() => toggleBottomPanel('preview')}
          >
            预览
          </button>
        </div>

        {/* Bottom Expandable Panel - 默认直接展开预览 */}
        <div className={`workspace-bottom ${bottomPanel ? 'expanded' : ''}`}>
          {bottomPanel === 'diff' && (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
              暂无 Diff 数据
            </div>
          )}
          {bottomPanel === 'test' && (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
              暂无测试数据
            </div>
          )}
          {bottomPanel === 'preview' && <PreviewPanel />}
        </div>
      </div>

      {/* Right: Plan Panel */}
      <div className={`workspace-right ${rightPanelCollapsed ? 'collapsed' : ''}`}>
        {!rightPanelCollapsed && (
          <PlanPanel
            collapsed={rightPanelCollapsed}
            onToggle={() => setRightPanelCollapsed(true)}
          />
        )}
      </div>

      {/* Toggle button when collapsed */}
      {rightPanelCollapsed && (
        <button
          onClick={() => setRightPanelCollapsed(false)}
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 32,
            height: 60,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-0)',
            borderRight: 'none',
            borderRadius: '6px 0 0 6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-3)',
            fontSize: 13,
            zIndex: 10,
          }}
        >
          {'<'}
        </button>
      )}
    </div>
  );
}
