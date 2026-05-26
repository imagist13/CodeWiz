'use client';

import { useState } from 'react';
import { useSuperAgentStore } from '@/lib/super-agent-store';

export default function TopBar() {
  const currentProject = useSuperAgentStore((s) => s.currentProject);
  const projectLoading = useSuperAgentStore((s) => s.projectLoading);
  const setProject = useSuperAgentStore((s) => s.setProject);

  const [showSwitcher, setShowSwitcher] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [switching, setSwitching] = useState(false);

  const getRepoDisplayName = () => {
    if (!currentProject) return 'No repo';
    if (currentProject.name) return currentProject.name;
    return 'sandbox-repo';
  };

  const handleSwitch = async () => {
    const url = repoUrl.trim();
    if (!url) return;
    setSwitching(true);
    try {
      setProject({
        id: `repo-${Date.now()}`,
        name: url,
      });
      setShowSwitcher(false);
      setRepoUrl('');
    } catch (err) {
      console.warn('Switch repo failed:', err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left"></div>
      <div className="topbar-center">
        {projectLoading ? (
          <span style={{ fontSize: 13, color: 'var(--fg-4)' }}>Loading...</span>
        ) : (
          <div
            className="topbar-repo-selector"
            onClick={() => setShowSwitcher(!showSwitcher)}
            title="Click to switch repo"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span className="repo-name" style={{ fontWeight: 600, fontSize: 14 }}>
              {getRepoDisplayName()}
            </span>
            <span style={{ fontSize: 11, color: 'var(--fg-4)', marginLeft: 4 }}>[change]</span>
          </div>
        )}
      </div>
      <div className="topbar-right"></div>

      {showSwitcher && (
        <>
          <div className="drawer-overlay" onClick={() => setShowSwitcher(false)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-0)', borderRadius: 'var(--radius-lg)', padding: 24,
            zIndex: 1000, width: 420,
            border: '1px solid var(--border-0)'
          }}>
            <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700, color: 'var(--fg-0)' }}>
              Switch Repository
            </h3>
            {currentProject && (
              <div style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                Current: <strong>{getRepoDisplayName()}</strong>
              </div>
            )}
            <input
              className="input"
              placeholder="https://github.com/user/repo.git"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSwitch()}
              style={{ width: '100%', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowSwitcher(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSwitch} disabled={switching || !repoUrl.trim()}>
                {switching ? 'Connecting...' : 'Switch'}
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
