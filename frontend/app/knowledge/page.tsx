'use client';

import { useEffect, useState } from 'react';
import { useSuperAgentStore } from '@/lib/super-agent-store';

export default function KnowledgePage() {
  const knowledgeItems = useSuperAgentStore((s) => s.knowledgeItems);
  const knowledgeLoading = useSuperAgentStore((s) => s.knowledgeLoading);
  const loadKnowledge = useSuperAgentStore((s) => s.loadKnowledge);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadKnowledge();
  }, [loadKnowledge]);

  const filteredItems = knowledgeItems.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="knowledge-page">
      <div className="knowledge-header">
        <h1 className="skills-title">知识库</h1>
      </div>

      <div className="knowledge-search">
        <input
          className="input"
          placeholder="搜索知识库..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 380 }}
        />
      </div>

      <div className="knowledge-list">
        {filteredItems.map((item) => (
          <div key={item.id} className="knowledge-item">
            <div className="knowledge-item-main">
              <div className="knowledge-item-title">{item.title}</div>
              <div className="knowledge-item-meta">
                <span className="text-tertiary">{item.createdAt}</span>
              </div>
            </div>
            <div className="knowledge-item-actions">
              <button className="btn btn-ghost btn-sm">查看</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
