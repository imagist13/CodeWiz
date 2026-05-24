'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { path: '/workspace', icon: '◈', label: '工作区' },
  { path: '/pool', icon: '▣', label: '需求池' },
  { path: '/dashboard', icon: '◫', label: 'Dashboard' },
  { path: '/skills', icon: '◉', label: 'Skill管理' },
  { path: '/knowledge', icon: '◎', label: '知识库' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
          <rect width="32" height="32" rx="6" fill="#3b82f6" />
          <path d="M8 10h16v4H8v-4z" fill="white" />
          <path d="M11 14h4v12h-4v-12z" fill="white" />
          <path d="M14 18h12v4H14v-4z" fill="white" />
          <path d="M21 14h4v12h-4v-12z" fill="white" />
          <path d="M21 26h8v4h-8v-4z" fill="white" />
        </svg>
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          letterSpacing: '-0.5px',
          lineHeight: 1.2,
          color: 'var(--fg-0)',
          marginLeft: 8
        }}>
          Token Limited<br/>Reached
        </span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`sidebar-nav-item${pathname === item.path ? ' active' : ''}`}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        v0.1 MVP
      </div>
    </aside>
  );
}
