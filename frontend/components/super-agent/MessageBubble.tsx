'use client';

interface Message {
  id: string;
  role: 'pm' | 'ai';
  type?: 'text' | 'clarification' | 'plan' | 'diff' | 'test' | 'complete';
  content: string;
  time?: string;
  clarification?: {
    question: string;
    options: string[];
  };
  plan?: {
    title: string;
    summary: string;
    files: Array<{ path: string; change: 'add' | 'mod'; desc: string }>;
  };
  diff?: {
    files: Array<{ path: string; added: number; removed: number }>;
  };
  testReport?: {
    passed: number;
    failed: number;
    skipped: number;
    details?: Array<{ name: string; status: 'pass' | 'fail'; duration: string }>;
  };
}

interface Props {
  message: Message;
  onClarifySelect?: (option: string) => void;
}

export default function MessageBubble({ message, onClarifySelect }: Props) {
  const { role, type, content, time } = message;
  const roleLabel = role === 'pm' ? 'PM' : 'AI';
  const roleClass = role === 'pm' ? 'pm' : 'ai';

  const renderContent = () => {
    switch (type) {
      case 'clarification':
        return renderClarification();
      case 'plan':
        return renderPlan();
      case 'diff':
        return renderDiff();
      case 'test':
        return renderTest();
      case 'complete':
        return renderComplete();
      default:
        return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
    }
  };

  const renderClarification = () => (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{content}</div>
      {message.clarification && (
        <div className="message-card clarification-card">
          <div className="question">{message.clarification.question}</div>
          <div className="clarification-options">
            {message.clarification.options.map((opt, i) => (
              <div
                key={i}
                className="clarification-option"
                onClick={() => onClarifySelect?.(opt)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClarifySelect?.(opt);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderPlan = () => (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{content}</div>
      {message.plan && (
        <div className="message-card plan-card">
          <div className="plan-card-header">[Plan] {message.plan.title}</div>
          <div style={{ fontSize: '13px', color: 'var(--fg-3)', marginBottom: 12 }}>
            {message.plan.summary}
          </div>
          <div className="plan-card-files">
            {message.plan.files.map((f, i) => (
              <div key={i} className="plan-file-item">
                <span className={f.change === 'add' ? 'plan-file-add' : 'plan-file-mod'}>
                  {f.change === 'add' ? '+' : '~'}
                </span>
                <span style={{ fontFamily: 'SF Mono, Fira Code, Consolas, monospace', fontSize: 13 }}>
                  {f.path}
                </span>
                <span style={{ fontSize: 13, color: 'var(--fg-4)', marginLeft: 'auto' }}>
                  {f.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDiff = () => (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{content}</div>
      {message.diff && (
        <div className="message-card">
          {message.diff.files.map((f, i) => (
            <div key={i} className="plan-file-item" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'SF Mono, Fira Code, Consolas, monospace', fontSize: 13 }}>
                {f.path}
              </span>
              <span style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: '#007a43', fontWeight: 600 }}>+{f.added}</span>
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>-{f.removed}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTest = () => (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{content}</div>
      {message.testReport && (
        <div className="message-card test-report-card">
          <div className="test-report-header">
            <span style={{ fontWeight: 600 }}>测试报告</span>
          </div>
          <div className="test-report-stats">
            <span className="test-stat pass">Pass: {message.testReport.passed}</span>
            {message.testReport.failed > 0 && (
              <span className="test-stat fail">Fail: {message.testReport.failed}</span>
            )}
            {message.testReport.skipped > 0 && (
              <span className="test-stat skip">Skip: {message.testReport.skipped}</span>
            )}
          </div>
          {message.testReport.details && (
            <div style={{ marginTop: 12 }}>
              {message.testReport.details.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>[{d.status === 'pass' ? 'PASS' : 'FAIL'}] {d.name}</span>
                  <span style={{ color: 'var(--fg-4)' }}>{d.duration}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderComplete = () => (
    <div className="message-card complete-card">
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, fontWeight: 500 }}>{content}</div>
    </div>
  );

  return (
    <div className={`message-row ${roleClass}`}>
      <div className="message-bubble">
        <div className="message-meta">
          <span className="message-role">{roleLabel}</span>
          {time && <span className="message-time">{time}</span>}
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
