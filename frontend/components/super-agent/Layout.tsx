'use client';

import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function SuperAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <div className="app-content">
          {children}
        </div>
      </div>
    </div>
  );
}
