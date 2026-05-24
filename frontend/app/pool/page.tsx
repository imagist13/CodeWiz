'use client';

import { useEffect } from 'react';
import { useSuperAgentStore } from '@/lib/super-agent-store';

export default function RequirementPoolPage() {
  const requirements = useSuperAgentStore((s) => s.requirements);
  const requirementsLoading = useSuperAgentStore((s) => s.requirementsLoading);
  const loadRequirements = useSuperAgentStore((s) => s.loadRequirements);
  const moveRequirement = useSuperAgentStore((s) => s.moveRequirement);

  useEffect(() => {
    loadRequirements();
  }, [loadRequirements]);

  const stages = [
    { id: 'todo', label: '待处理' },
    { id: 'doing', label: '进行中' },
    { id: 'done', label: '已完成' },
  ];

  const priorityClass = (p: string) => {
    switch (p) {
      case 'p0': return 'priority-p0';
      case 'p1': return 'priority-p1';
      case 'p2': return 'priority-p2';
      default: return 'badge-default';
    }
  };

  return (
    <div className="pool-page">
      <div className="pool-header">
        <h1 className="pool-title">需求池</h1>
        <div className="pool-header-actions">
          <button className="btn btn-primary btn-sm">+ 新建需求</button>
        </div>
      </div>

      <div className="kanban-board">
        {stages.map((stage) => (
          <div key={stage.id} className="kanban-column">
            <div className="kanban-column-header">
              <span className="kanban-column-title">{stage.label}</span>
              <span className="kanban-wip-limit">
                {requirements.filter((r) => r.stage === stage.id).length}
              </span>
            </div>
            <div className="kanban-column-body">
              {requirements
                .filter((r) => r.stage === stage.id)
                .map((req) => (
                  <div key={req.id} className="kanban-card">
                    <div className="kanban-card-title">{req.title}</div>
                    <div className="kanban-card-meta">
                      <span className="kanban-card-id">#{req.id}</span>
                      <span className={`kanban-card-priority ${priorityClass(req.priority)}`}>
                        {req.priority.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
