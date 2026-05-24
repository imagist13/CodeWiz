'use client';

import { useEffect } from 'react';
import { useSuperAgentStore } from '@/lib/super-agent-store';

export default function SkillsPage() {
  const skills = useSuperAgentStore((s) => s.skills);
  const skillsLoading = useSuperAgentStore((s) => s.skillsLoading);
  const loadSkills = useSuperAgentStore((s) => s.loadSkills);
  const toggleSkill = useSuperAgentStore((s) => s.toggleSkill);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  return (
    <div className="skills-page">
      <div className="skills-header">
        <h1 className="skills-title">Skill 管理</h1>
      </div>

      <div className="skills-grid">
        {skills.map((skill) => (
          <div key={skill.id} className="card skill-card">
            <div className="skill-card-header">
              <span className="skill-card-name">{skill.name}</span>
              <button
                className={`skill-toggle ${skill.enabled ? 'on' : ''}`}
                onClick={() => toggleSkill(skill.id)}
              />
            </div>
            <p className="skill-card-desc">{skill.description}</p>
            <div className="skill-card-meta">
              <span className="text-tertiary">ID: {skill.id}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
