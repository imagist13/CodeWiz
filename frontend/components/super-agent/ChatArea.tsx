'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSuperAgentStore } from '@/lib/super-agent-store';
import MessageBubble from './MessageBubble';

export default function ChatArea() {
  const currentSession = useSuperAgentStore((s) => s.currentSession);
  const messages = currentSession?.messages || [];
  const mode = useSuperAgentStore((s) => s.mode);
  const setMode = useSuperAgentStore((s) => s.setMode);
  const sendMessage = useSuperAgentStore((s) => s.sendMessage);
  const streamMessage = useSuperAgentStore((s) => s.streamMessage);
  const skills = useSuperAgentStore((s) => s.skills);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [skillFilterText, setSkillFilterText] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (cancelStreamRef.current) {
        cancelStreamRef.current();
      }
    };
  }, []);

  const filteredSkills = skills.filter((s) => {
    if (!skillFilterText) return true;
    const name = (s.name || '').toLowerCase();
    return name.includes(skillFilterText.toLowerCase());
  });

  const insertSkillMention = useCallback(
    (skillName: string) => {
      if (mentionStartIndex === -1) return;
      const before = input.slice(0, mentionStartIndex);
      const after = input.slice(mentionStartIndex + 1 + skillFilterText.length);
      const newInput = before + '@' + skillName + ' ' + after;
      setInput(newInput);
      setShowSkillDropdown(false);
      setSkillFilterText('');
      setMentionStartIndex(-1);
      textareaRef.current?.focus();
    },
    [input, mentionStartIndex, skillFilterText]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (atMatch) {
      setShowSkillDropdown(true);
      setMentionStartIndex(atMatch.index || 0);
      setSkillFilterText(atMatch[1]);
    } else {
      setShowSkillDropdown(false);
      setSkillFilterText('');
      setMentionStartIndex(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && showSkillDropdown) {
      e.preventDefault();
      setShowSkillDropdown(false);
      setSkillFilterText('');
      setMentionStartIndex(-1);
      return;
    }

    if (showSkillDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async (text?: string) => {
    const trimmed = (typeof text === 'string' ? text : input).trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await sendMessage(trimmed);
      if (typeof text !== 'string') {
        setInput('');
      }

      cancelStreamRef.current = streamMessage(
        (chunk) => {
          // Chunk handler
        },
        () => {
          setSending(false);
          cancelStreamRef.current = null;
        }
      );
    } catch (err) {
      console.error('Send failed:', err);
      setSending(false);
    }
  };

  const toggleMode = () => {
    const newMode = mode === 'interactive' ? 'auto' : 'interactive';
    setMode(newMode);
  };

  const handleClarifySelect = useCallback(
    (option: string) => {
      handleSend(option);
    },
    []
  );

  return (
    <div className="chat-area">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg-0)', marginBottom: '4px' }}>
              开始对话
            </div>
            <div style={{ fontSize: '13px', color: 'var(--fg-4)' }}>
              描述你的需求，系统将自动完成开发
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onClarifySelect={handleClarifySelect}
            />
          ))
        )}
        {sending && (
          <div className="message-row ai" style={{ opacity: 0.9 }}>
            <div className="message-bubble">
              <div className="message-meta">
                <span className="message-role">AI</span>
              </div>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--fg-3)' }} />
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--fg-3)' }} />
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--fg-3)' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar" style={{ position: 'relative' }}>
        <button
          className={`chat-mode-toggle ${mode === 'auto' ? 'auto' : ''}`}
          onClick={toggleMode}
          title={mode === 'interactive' ? '切换到自动模式' : '切换到交互模式'}
        >
          {mode === 'interactive' ? 'Auto' : 'Interact'}
        </button>
        <textarea
          ref={textareaRef}
          className="textarea"
          placeholder="输入需求描述，Enter 发送，Shift+Enter 换行，@ 选择 Skill..."
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending}
        />
        <button
          className="chat-send-btn"
          onClick={() => handleSend()}
          disabled={!input.trim() || sending}
          title="发送"
        >
          →
        </button>

        {showSkillDropdown && filteredSkills.length > 0 && (
          <div
            className="skill-mention-dropdown"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 24,
              right: 24,
              marginBottom: 12,
              maxHeight: 220,
              overflowY: 'auto',
              zIndex: 100,
            }}
          >
            {filteredSkills.map((s) => (
              <div
                key={s.id}
                className="skill-mention-item"
                onClick={() => insertSkillMention(s.name)}
                onMouseDown={(e) => e.preventDefault()}
              >
                <span style={{ fontWeight: 600, color: 'var(--fg-0)' }}>@{s.name}</span>
                {s.description && (
                  <span
                    style={{
                      marginLeft: 10,
                      fontSize: '12px',
                      color: 'var(--fg-4)',
                    }}
                  >
                    {s.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {showSkillDropdown && filteredSkills.length === 0 && (
          <div
            className="skill-mention-dropdown skill-mention-empty"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 24,
              right: 24,
              marginBottom: 12,
              zIndex: 100,
            }}
          >
            没有匹配的 Skill
          </div>
        )}
      </div>
    </div>
  );
}
