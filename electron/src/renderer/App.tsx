import React, { useEffect } from 'react'
import { HashRouter } from 'react-router-dom'
import { Routes, Route, Navigate } from 'react-router-dom'

import { LoginPage } from './pages/LoginPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { NewTaskPage } from './pages/NewTaskPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { CapabilitiesPage } from './pages/CapabilitiesPage'
import { AutomationPage } from './pages/AutomationPage'
import { ObservabilityPage } from './pages/ObservabilityPage'
import { ModelsPage } from './pages/ModelsPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { CommandPalette } from './components/CommandPalette'

import { useUserStore } from './store/userStore'
import { useSettingsStore } from './store/settingsStore'

function AppRoutes() {
  const { isLoggedIn } = useUserStore()
  const [cmdKOpen, setCmdKOpen] = React.useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdKOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!isLoggedIn) {
    return <LoginPage />
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<WorkbenchPage />} />
        <Route path="/new" element={<NewTaskPage />} />
        <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:workspacePath" element={<ProjectDetailPage />} />
        <Route path="/capabilities" element={<CapabilitiesPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/observability" element={<ObservabilityPage />} />
        <Route path="/logs" element={<ObservabilityPage />} />
        <Route path="/health" element={<ObservabilityPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandPalette open={cmdKOpen} onClose={() => setCmdKOpen(false)} />
    </>
  )
}

export default function App() {
  const { theme } = useSettingsStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
