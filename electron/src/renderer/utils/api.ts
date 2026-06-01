/**
 * Unified backend API client — wraps electron IPC for all HTTP calls.
 * All methods are typed and include auth context automatically.
 */
import { useUserStore } from '../store/userStore'
import { useSettingsStore } from '../store/settingsStore'

async function fetch(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; data: any }> {
  const { backendUrl } = useSettingsStore.getState()
  const res = await window.electronAPI?.backendFetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  })
  if (!res) {
    throw Object.assign(new Error('后端服务不可用，请检查 Hermes 是否正在运行'), { code: 'BACKEND_UNAVAILABLE' })
  }
  let body: any
  let parseError: Error | null = null
  if (typeof res.body === 'string') {
    try { body = JSON.parse(res.body) }
    catch (e) { parseError = e as Error; body = res.body }
  } else {
    body = res.body
  }

  // Surface backend errors with detail from JSON body
  if (res.status >= 400 && body && typeof body === 'object' && body.detail) {
    throw Object.assign(new Error(body.detail), {
      code: `HTTP_${res.status}`,
      status: res.status,
    })
  }

  // If JSON parsing failed on an error response, surface a readable message
  if (res.status >= 400 && parseError) {
    throw Object.assign(new Error(`请求失败 (${res.status}): ${res.body?.slice(0, 200) || '未知错误'}`), {
      code: `HTTP_${res.status}`,
      status: res.status,
    })
  }

  return { status: res.status, data: body }
}

function getUsername() {
  return useUserStore.getState().username || 'default'
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  archived: boolean
  message_count: number
}

export async function listConversations() {
  const username = getUsername()
  const res = await fetch(`/api/conversations?username=${encodeURIComponent(username)}`)
  return res.data.conversations as Conversation[]
}

export async function createConversation(title = '新会话') {
  const username = getUsername()
  const res = await fetch(`/api/conversations?username=${encodeURIComponent(username)}&title=${encodeURIComponent(title)}`, {
    method: 'POST',
  })
  return res.data as { id: string; title: string; created_at: string }
}

export interface LoadedMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls: any
  created_at: string
}

export interface LoadedConversation {
  id: string
  title: string
  created_at: string
  messages: LoadedMessage[]
}

export async function loadConversation(convId: string) {
  const username = getUsername()
  const res = await fetch(
    `/api/conversations/load?id=${encodeURIComponent(convId)}&username=${encodeURIComponent(username)}`,
    { method: 'POST' }
  )
  return res.data as LoadedConversation
}

export async function deleteConversation(convId: string) {
  const username = getUsername()
  return fetch(`/api/conversations/${encodeURIComponent(convId)}?username=${encodeURIComponent(username)}`, {
    method: 'DELETE',
  })
}

export async function renameConversation(convId: string, title: string) {
  const username = getUsername()
  return fetch(`/api/conversations/${encodeURIComponent(convId)}/rename?username=${encodeURIComponent(username)}&title=${encodeURIComponent(title)}`, {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Tasks (Automation)
// ---------------------------------------------------------------------------

export interface Task {
  id: string
  name: string
  type: string
  time_expr: string
  command: string
  enabled: boolean
  last_run: string | null
  next_run: string | null
  created_at: string
}

export async function listTasks() {
  const username = getUsername()
  const res = await fetch(`/api/tasks?username=${encodeURIComponent(username)}`)
  return res.data.tasks as Task[]
}

export async function createTask(body: { name: string; type: string; time_expr: string; command: string; enabled?: boolean }) {
  const username = getUsername()
  return fetch(`/api/tasks?username=${encodeURIComponent(username)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteTask(taskId: string) {
  const username = getUsername()
  return fetch(`/api/tasks/${encodeURIComponent(taskId)}?username=${encodeURIComponent(username)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface UserConfig {
  provider: string
  model: string
  temperature: number
  soul: string
  workspace_root: string
  [key: string]: any
}

export async function getConfig() {
  const username = getUsername()
  const res = await fetch(`/api/config?username=${encodeURIComponent(username)}`)
  return res.data as UserConfig
}

export async function saveConfig(cfg: Record<string, any>) {
  const username = getUsername()
  return fetch(`/api/config`, {
    method: 'POST',
    body: JSON.stringify({ username, ...cfg }),
  })
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function login(username: string, password?: string) {
  const res = await fetch('/api/select-user', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (res.status === 404) throw new Error('USER_NOT_FOUND')
  if (res.status !== 200) throw new Error('LOGIN_FAILED')
  return res.data as { username: string; is_admin: boolean }
}

export async function register(username: string, password?: string) {
  const res = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (res.status !== 200) throw new Error(res.data?.detail || 'REGISTRATION_FAILED')
  return res.data
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkHealth() {
  const res = await fetch('/api/health')
  return res.data as { status: string; service: string }
}
