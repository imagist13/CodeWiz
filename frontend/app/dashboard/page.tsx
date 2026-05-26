'use client';

import { useState } from 'react';

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <h1 className="dashboard-main-title">Dashboard</h1>
          <p className="dashboard-subtitle">系统运行状态与统计数据</p>
        </div>
        <div className="dashboard-header-actions">
          <div className="time-range-selector">
            <button
              className={`time-range-btn ${timeRange === 'today' ? 'active' : ''}`}
              onClick={() => setTimeRange('today')}
            >
              今日
            </button>
            <button
              className={`time-range-btn ${timeRange === 'week' ? 'active' : ''}`}
              onClick={() => setTimeRange('week')}
            >
              本周
            </button>
            <button
              className={`time-range-btn ${timeRange === 'month' ? 'active' : ''}`}
              onClick={() => setTimeRange('month')}
            >
              本月
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-card-label">总对话数</div>
          <div className="kpi-card-value">128</div>
          <div className="kpi-card-change up">
            <span className="kpi-trend-icon">↑</span>
            <span className="kpi-change-label">+12%</span>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-card-label">代码生成行数</div>
          <div className="kpi-card-value">45.2K</div>
          <div className="kpi-card-change up">
            <span className="kpi-trend-icon">↑</span>
            <span className="kpi-change-label">+8%</span>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-card-label">平均响应时间</div>
          <div className="kpi-card-value">2.3s</div>
          <div className="kpi-card-change down">
            <span className="kpi-trend-icon">↓</span>
            <span className="kpi-change-label">-15%</span>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-card-label">成功率</div>
          <div className="kpi-card-value">94.2%</div>
          <div className="kpi-card-change up">
            <span className="kpi-trend-icon">↑</span>
            <span className="kpi-change-label">+2.1%</span>
          </div>
        </div>
      </div>

      <div className="dashboard-charts" style={{ marginTop: 24 }}>
        <div className="card dashboard-chart-card">
          <div className="card-header">
            <span className="card-title">Token 使用趋势</span>
          </div>
          <div className="card-body" style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-4)' }}>
            📊 图表区域
          </div>
        </div>
        <div className="card dashboard-chart-card">
          <div className="card-header">
            <span className="card-title">调用分布</span>
          </div>
          <div className="card-body" style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-4)' }}>
            📊 图表区域
          </div>
        </div>
      </div>
    </div>
  );
}
