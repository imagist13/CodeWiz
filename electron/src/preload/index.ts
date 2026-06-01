import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  backendFetch: (url: string, options?: RequestInit) => Promise<{
    status: number
    headers: Record<string, string | string[] | undefined>
    body: string
  }>
  backendSSE: (body: {
    message: string
    conversation_id?: string
    username: string
    new_engine?: boolean
  }) => Promise<void>
  onSSEChunk: (callback: (chunk: string) => void) => () => void
  onSSEError: (callback: (msg: string) => void) => () => void
      onSSEEnd: (callback: () => void) => () => void
      abortSSE: () => void
  openFile: (options?: OpenDialogOptions) => Promise<string[] | null>
  saveFile: (options?: SaveDialogOptions) => Promise<string | null>
  getAppPath: (name: string) => Promise<string>
  getVersion: () => Promise<string>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onBackendStatus: (callback: (status: 'connected' | 'disconnected') => void) => () => void
}

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
  properties?: ('openFile' | 'openDirectory' | 'multiSelections')[]
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

contextBridge.exposeInMainWorld('electronAPI', {
  backendFetch: (url: string, options?: RequestInit) =>
    ipcRenderer.invoke('backend:fetch', url, options),

  backendSSE: (body: Parameters<ElectronAPI['backendSSE']>[0]) =>
    ipcRenderer.invoke('backend:sse', body),

  onSSEChunk: (callback: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
    ipcRenderer.on('backend:sse:chunk', handler)
    return () => ipcRenderer.removeListener('backend:sse:chunk', handler)
  },

  onSSEError: (callback: (msg: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: string) => callback(msg)
    ipcRenderer.on('backend:sse:error', handler)
    return () => ipcRenderer.removeListener('backend:sse:error', handler)
  },

  onSSEEnd: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('backend:sse:end', handler)
    return () => ipcRenderer.removeListener('backend:sse:end', handler)
  },

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:openExternal', url),

  openFile: (options?: OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:openFile', options),

  saveFile: (options?: SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:saveFile', options),

  getAppPath: (name: string) =>
    ipcRenderer.invoke('app:getPath', name),

  getVersion: () =>
    ipcRenderer.invoke('app:getVersion'),

  windowMinimize: () =>
    ipcRenderer.invoke('window:minimize'),

  windowMaximize: () =>
    ipcRenderer.invoke('window:maximize'),

  windowClose: () =>
    ipcRenderer.invoke('window:close'),

  windowIsMaximized: () =>
    ipcRenderer.invoke('window:isMaximized'),

  // Abort the current SSE request — destroys the HTTP connection immediately.
  abortSSE: () => ipcRenderer.send('backend:sse:abort'),

  onBackendStatus: (callback: (status: 'connected' | 'disconnected') => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: 'connected' | 'disconnected') => callback(status)
    ipcRenderer.on('backend:status', handler)
    return () => ipcRenderer.removeListener('backend:status', handler)
  },
} as ElectronAPI)
