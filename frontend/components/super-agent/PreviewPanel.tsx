'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSuperAgentStore } from '@/lib/super-agent-store';

export default function PreviewPanel() {
  const previewUrl = useSuperAgentStore((s) => s.previewUrl);
  const setPreviewUrl = useSuperAgentStore((s) => s.setPreviewUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeError, setIframeError] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  // 从环境变量或默认配置获取预览地址
  const defaultPreviewUrl = typeof window !== 'undefined' 
    ? (window.location.protocol + '//' + window.location.hostname + ':3000')
    : 'http://localhost:3000';

  useEffect(() => {
    if (!previewUrl || previewUrl === 'http://localhost:3002' || previewUrl === '') {
      setPreviewUrl(defaultPreviewUrl);
    }
    setCustomUrl(previewUrl || defaultPreviewUrl);
  }, [previewUrl, setPreviewUrl, defaultPreviewUrl]);

  const handleRefresh = useCallback(() => {
    setIframeError(false);
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  }, [previewUrl]);

  const handleUrlChange = useCallback(() => {
    setIframeError(false);
    setPreviewUrl(customUrl);
  }, [customUrl, setPreviewUrl]);

  const handleIframeError = useCallback(() => {
    setIframeError(true);
  }, []);

  return (
    <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Sandbox 预览</span>
          <span style={{ fontSize: 12, color: iframeError ? '#ef4444' : '#10b981' }}>
            {iframeError ? '连接失败' : '就绪'}
          </span>
        </div>
        <div className="preview-device-btns">
          <button
            className={`preview-device-btn ${deviceMode === 'desktop' ? 'active' : ''}`}
            onClick={() => setDeviceMode('desktop')}
          >
            桌面
          </button>
          <button
            className={`preview-device-btn ${deviceMode === 'tablet' ? 'active' : ''}`}
            onClick={() => setDeviceMode('tablet')}
          >
            平板
          </button>
          <button
            className={`preview-device-btn ${deviceMode === 'mobile' ? 'active' : ''}`}
            onClick={() => setDeviceMode('mobile')}
          >
            手机
          </button>
          <button className="btn btn-sm" onClick={handleRefresh}>
            刷新
          </button>
          <button className="btn btn-sm" onClick={handleFullscreen}>
            新窗口
          </button>
        </div>
      </div>

      {/* Custom URL Input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}>
        <input
          className="input"
          placeholder="输入预览地址，例如 http://localhost:3002"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUrlChange()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={handleUrlChange}>
          连接
        </button>
      </div>

      {/* Preview iframe */}
      <div className="preview-frame-wrapper" style={{ flex: 1, border: iframeError ? '2px solid #ef4444' : '1px solid var(--border-0)' }}>
        {iframeError ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--fg-3)',
            padding: 24,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--fg-1)' }}>
              预览服务未启动
            </h3>
            <p style={{ fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.6 }}>
              请确保 sandbox-repo 前端服务已启动在正确的端口上。<br />
              你可以在上方输入框中输入正确的预览地址，然后点击「连接」按钮。
            </p>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className={`preview-frame ${deviceMode}`}
            title="sandbox-repo-preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onError={handleIframeError}
            style={{ background: '#fff' }}
          />
        )}
      </div>
    </div>
  );
}
