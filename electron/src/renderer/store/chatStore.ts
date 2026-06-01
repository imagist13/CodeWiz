import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls?: ToolCall[]
  timestamp: number
  thinking?: string
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  archived: boolean
  message_count: number
}

interface ChatState {
  messages: Message[]
  currentConversationId: string | null
  conversations: Conversation[]
  isLoading: boolean
  isStreaming: boolean
  error: string | null

  setMessages: (messages: Message[]) => void
  addMessage: (msg: Message) => void
  updateMessage: (id: string, update: Partial<Message>) => void
  removeMessage: (id: string) => void
  setCurrentConversation: (id: string | null) => void
  setConversations: (convs: Conversation[]) => void
  setLoading: (loading: boolean) => void
  setStreaming: (streaming: boolean) => void
  setError: (error: string | null) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  currentConversationId: null,
  conversations: [],
  isLoading: false,
  isStreaming: false,
  error: null,

  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, update) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...update } : m))
    })),
  removeMessage: (id) =>
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
  setCurrentConversation: (id) => set({ currentConversationId: id }),
  setConversations: (convs) => set({ conversations: convs }),
  setLoading: (loading) => set({ isLoading: loading }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setError: (error) => set({ error }),
  clearMessages: () => set({ messages: [] })
}))
