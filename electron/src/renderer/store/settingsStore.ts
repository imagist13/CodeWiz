import { create } from 'zustand'

interface SettingsState {
  backendUrl: string
  theme: 'dark' | 'light'
  fontSize: number
  streaming: boolean

  setBackendUrl: (url: string) => void
  setTheme: (theme: 'dark' | 'light') => void
  setFontSize: (size: number) => void
  setStreaming: (streaming: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  backendUrl: 'http://127.0.0.1:1478',
  theme: 'dark',
  fontSize: 14,
  streaming: true,

  setBackendUrl: (url) => set({ backendUrl: url }),
  setTheme: (theme) => set({ theme }),
  setFontSize: (size) => set({ fontSize: size }),
  setStreaming: (streaming) => set({ streaming })
}))
