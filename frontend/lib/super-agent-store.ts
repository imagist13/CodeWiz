'use client';

import { create } from 'zustand';
import { apiClient, Project, Conversation } from './api-client';

// ================================
// Types
// ================================
interface Message {
  id: string;
  role: 'pm' | 'ai';
  type?: 'text' | 'clarification' | 'plan' | 'diff' | 'test' | 'complete';
  content: string;
  time?: string;
  clarification?: {
    question: string;
    options: string[];
  };
  plan?: {
    title: string;
    summary: string;
    files: Array<{ path: string; change: 'add' | 'mod'; desc: string }>;
    modules?: Array<{ name: string }>;
  };
  diff?: {
    files: Array<{ path: string; added: number; removed: number }>;
  };
  testReport?: {
    passed: number;
    failed: number;
    skipped: number;
    details?: Array<{ name: string; status: 'pass' | 'fail'; duration: string }>;
  };
}

interface Stage {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'done';
}

interface SessionState {
  id: string;
  status: 'ready' | 'running' | 'paused';
  messages: Message[];
  stages: Stage[];
  stage: number;
  plan: any;
  diffs: { files: any[] };
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface RequirementItem {
  id: string;
  title: string;
  description: string;
  stage: string;
  priority: 'p0' | 'p1' | 'p2' | 'p3';
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

// ================================
// Mock Data (Fallback when backend is not available)
// ================================
const mockDefaultProject: Project = {
  id: 'default',
  name: 'sandbox-repo',
  description: 'Default workspace',
};

const mockInitialSession: SessionState = {
  id: 'session-001',
  status: 'ready',
  messages: [],
  stages: [
    { id: 1, name: '需求澄清', status: 'active' },
    { id: 2, name: '方案规划', status: 'pending' },
    { id: 3, name: '代码生成', status: 'pending' },
    { id: 4, name: '测试验证', status: 'pending' },
    { id: 5, name: '部署预览', status: 'pending' },
  ],
  stage: 1,
  plan: null,
  diffs: { files: [] },
};

const mockSkills: SkillItem[] = [
  { id: '1', name: 'CodeReview', description: '智能代码审查', enabled: true },
  { id: '2', name: 'AutoTest', description: '自动生成单元测试', enabled: true },
  { id: '3', name: 'DocGen', description: '自动生成文档', enabled: false },
  { id: '4', name: 'Refactor', description: '智能代码重构', enabled: false },
];

const mockRequirements: RequirementItem[] = [
  { id: '1', title: '用户登录功能', description: '实现邮箱密码登录', stage: 'todo', priority: 'p0' },
  { id: '2', title: '项目列表展示', description: '展示用户所有项目', stage: 'doing', priority: 'p1' },
  { id: '3', title: '对话历史记录', description: '保存用户对话历史', stage: 'done', priority: 'p2' },
];

const mockKnowledge: KnowledgeItem[] = [
  { id: '1', title: 'React Hooks 最佳实践', content: 'useEffect 依赖数组规范...', createdAt: '2024-01-01' },
  { id: '2', title: 'Next.js 14 App Router 指南', content: 'Server Components 使用...', createdAt: '2024-01-02' },
];

// ================================
// Store
// ================================
interface SuperAgentState {
  // Mode
  mode: 'interactive' | 'auto';
  setMode: (mode: 'interactive' | 'auto') => void;

  // Current Project / Repo
  currentProject: Project | null;
  projectLoading: boolean;
  setProject: (project: Project) => void;
  loadCurrentProject: () => Promise<void>;

  // Current Session
  currentSession: SessionState;
  sessionLoading: boolean;
  sessionError: string | null;
  loadCurrentSession: (projectId: string) => Promise<void>;

  // Chat
  sendMessage: (content: string) => Promise<any>;
  streamMessage: (
    onChunk: (chunk: any) => void,
    onDone: () => void
  ) => () => void;

  // Stages
  advanceStage: () => Promise<void>;
  pauseStage: () => Promise<void>;
  resumeStage: () => Promise<void>;

  // Skills
  skills: SkillItem[];
  skillsLoading: boolean;
  loadSkills: () => Promise<void>;
  toggleSkill: (skillId: string) => Promise<void>;

  // Requirements
  requirements: RequirementItem[];
  requirementsLoading: boolean;
  loadRequirements: () => Promise<void>;
  moveRequirement: (reqId: string, newStage: string) => void;
  addRequirement: (req: Partial<RequirementItem>) => Promise<RequirementItem>;

  // Knowledge
  knowledgeItems: KnowledgeItem[];
  knowledgeLoading: boolean;
  loadKnowledge: () => Promise<void>;

  // Preview
  previewUrl: string;
  setPreviewUrl: (url: string) => void;
}

export const useSuperAgentStore = create<SuperAgentState>((set, get) => ({
  // =====================================
  // Mode
  // =====================================
  mode: 'interactive',
  setMode: (mode) => set({ mode }),

  // =====================================
  // Project
  // =====================================
  currentProject: null,
  projectLoading: false,
  setProject: (project) => set({ currentProject: project, projectLoading: false }),

  loadCurrentProject: async () => {
    set({ projectLoading: true });
    try {
      const projects = await apiClient.getProjects();
      if (projects.length > 0) {
        set({ currentProject: projects[0], projectLoading: false });
      } else {
        set({ currentProject: mockDefaultProject, projectLoading: false });
      }
    } catch (err) {
      console.warn('[Store] Backend unreachable, using mock project data:', err);
      set({ currentProject: mockDefaultProject, projectLoading: false });
    }
  },

  // =====================================
  // Session
  // =====================================
  currentSession: mockInitialSession,
  sessionLoading: false,
  sessionError: null,

  loadCurrentSession: async (projectId: string) => {
    set({ sessionLoading: true });
    try {
      const conversations = await apiClient.getConversations(projectId);
      if (conversations.length > 0) {
        const conv = await apiClient.getConversation(projectId, conversations[0].id);
        set({
          sessionLoading: false,
          sessionError: null,
          currentSession: {
            ...mockInitialSession,
            id: conv.id,
            messages: (conv.messages || []).map((m: any, i: number) => ({
              id: `msg-${i}`,
              role: m.role === 'user' ? 'pm' : 'ai',
              content: m.content || '',
            })),
          },
        });
      } else {
        set({
          sessionLoading: false,
          sessionError: null,
          currentSession: mockInitialSession,
        });
      }
    } catch (err) {
      console.warn('[Store] Backend unreachable, using mock session data:', err);
      set({
        sessionLoading: false,
        sessionError: null,
        currentSession: mockInitialSession,
      });
    }
  },

  // =====================================
  // Chat
  // =====================================
  sendMessage: async (content: string) => {
    const state = get();
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'pm',
      content,
      time: new Date().toLocaleTimeString(),
    };

    set((prev) => ({
      currentSession: {
        ...prev.currentSession,
        messages: [...prev.currentSession.messages, userMsg],
      },
    }));

    return { message: userMsg };
  },

  streamMessage: (onChunk, onDone) => {
    const state = get();
    const abortController = new AbortController();

    (async () => {
      try {
        // Try real backend stream first
        const projectId = state.currentProject?.id || 'default';
        const convId = state.currentSession?.id || 'conv-001';
        
        for await (const chunk of apiClient.streamChat(
          state.currentSession.messages.map((m) => ({
            role: m.role === 'pm' ? 'user' : 'assistant',
            content: m.content,
          })),
          projectId,
          convId
        )) {
          if (abortController.signal.aborted) return;
          onChunk(chunk);

          set((prev) => ({
            currentSession: {
              ...prev.currentSession,
              messages: [
                ...prev.currentSession.messages,
                {
                  id: `ai-${Date.now()}`,
                  role: 'ai',
                  content: chunk.content || chunk,
                },
              ],
            },
          }));
        }
        onDone();
      } catch (err) {
        console.warn('[Store] Backend stream unreachable, using mock response:', err);
        // Fallback: mock AI response when backend is down
        setTimeout(() => {
          const mockAiMsg: Message = {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: '✅ 前端界面已就绪！\n\n当前后端服务未启动，你可以：\n1. 启动 Go 后端服务后刷新页面\n2. 直接在界面上体验所有 UI 交互功能\n\nSuper Agent 前端已完全集成到 CodeWiz 项目中。',
            time: new Date().toLocaleTimeString(),
          };
          set((prev) => ({
            currentSession: {
              ...prev.currentSession,
              messages: [...prev.currentSession.messages, mockAiMsg],
            },
          }));
          onDone();
        }, 1000);
      }
    })();

    return () => {
      abortController.abort();
    };
  },

  // =====================================
  // Stages
  // =====================================
  advanceStage: async () => {
    const state = get();
    const currentStage = state.currentSession.stage;
    if (currentStage < state.currentSession.stages.length) {
      set((prev) => ({
        currentSession: {
          ...prev.currentSession,
          stage: currentStage + 1,
          stages: prev.currentSession.stages.map((s, idx) => ({
            ...s,
            status: idx + 1 <= currentStage ? 'done' : idx + 1 === currentStage + 1 ? 'active' : 'pending',
          })),
        },
      }));
    }
  },

  pauseStage: async () => {
    set((prev) => ({
      currentSession: { ...prev.currentSession, status: 'paused' },
    }));
  },

  resumeStage: async () => {
    set((prev) => ({
      currentSession: { ...prev.currentSession, status: 'running' },
    }));
  },

  // =====================================
  // Skills
  // =====================================
  skills: [],
  skillsLoading: false,

  loadSkills: async () => {
    set({ skillsLoading: true });
    try {
      set({ skills: mockSkills, skillsLoading: false });
    } catch (err) {
      console.warn('[Store] Load skills failed:', err);
      set({ skills: mockSkills, skillsLoading: false });
    }
  },

  toggleSkill: async (skillId: string) => {
    set((prev) => ({
      skills: prev.skills.map((s) =>
        s.id === skillId ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  },

  // =====================================
  // Requirements
  // =====================================
  requirements: [],
  requirementsLoading: false,

  loadRequirements: async () => {
    set({ requirementsLoading: true });
    try {
      set({ requirements: mockRequirements, requirementsLoading: false });
    } catch (err) {
      console.warn('[Store] Load requirements failed:', err);
      set({ requirements: mockRequirements, requirementsLoading: false });
    }
  },

  moveRequirement: (reqId, newStage) => {
    set((state) => ({
      requirements: state.requirements.map((r) =>
        r.id === reqId ? { ...r, stage: newStage } : r
      ),
    }));
  },

  addRequirement: async (req) => {
    const newReq: RequirementItem = {
      id: `req-${Date.now()}`,
      title: req.title || 'New Requirement',
      description: req.description || '',
      stage: 'todo',
      priority: 'p1',
      ...req,
    };
    set((state) => ({
      requirements: [...state.requirements, newReq],
    }));
    return newReq;
  },

  // =====================================
  // Knowledge
  // =====================================
  knowledgeItems: [],
  knowledgeLoading: false,

  loadKnowledge: async () => {
    set({ knowledgeLoading: true });
    try {
      set({ knowledgeItems: mockKnowledge, knowledgeLoading: false });
    } catch (err) {
      console.warn('[Store] Load knowledge failed:', err);
      set({ knowledgeItems: mockKnowledge, knowledgeLoading: false });
    }
  },

  // =====================================
  // Preview
  // =====================================
  previewUrl: 'http://localhost:3000',
  setPreviewUrl: (url) => set({ previewUrl: url }),
}));
