import { create } from 'zustand'

export type PipelinePhase = 'clarify' | 'plan' | 'code' | 'lint' | 'pr'
export type SSEEventType =
  | 'thinking'
  | 'text_chunk'
  | 'tool_call'
  | 'tool_result'
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'phase_start'
  | 'phase_end'
  | 'phase_progress'
  | 'parallel_tools'
  | 'lint_result'
  | 'pipeline_summary'
  | 'message_delta'
  | 'message_complete'
  | 'done'
  | 'error'
  | 'warning'

export interface ToolExecution {
  id: string
  name: string
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
  error?: string
  startTime?: number
  endTime?: number
}

export interface LintResult {
  success: boolean
  overallPass: boolean
  lintPassRate: number
  testPassRate: number
  lintTotal: number
  lintPassed: number
  testTotal: number
  testPassed: number
  filesChecked: number
  errors: Array<Record<string, unknown>>
  stdout: string
  stderr: string
  repoName: string
  durationMs: number
}

export interface PipelineState {
  activePhase: PipelinePhase | null
  phaseStatus: Record<PipelinePhase, 'pending' | 'running' | 'done' | 'error'>
  phaseProgress: number
  phaseDescription: string
  parallelTools: string[]
  toolExecutions: Record<string, ToolExecution>
  lintResult: LintResult | null
  totalDurationMs: number
  changedFiles: string[]
  prUrl: string | null
  error: string | null

  setPhase: (phase: PipelinePhase | null) => void
  setPhaseStatus: (phase: PipelinePhase, status: 'pending' | 'running' | 'done' | 'error') => void
  setPhaseProgress: (progress: number, description?: string) => void
  setParallelTools: (tools: string[]) => void
  addToolExecution: (id: string, name: string) => void
  updateToolExecution: (id: string, update: Partial<ToolExecution>) => void
  setLintResult: (result: LintResult | null) => void
  setTotalDuration: (ms: number) => void
  setChangedFiles: (files: string[]) => void
  setPrUrl: (url: string | null) => void
  setError: (error: string | null) => void
  reset: () => void
}

const initialState = {
  activePhase: null,
  phaseStatus: {
    clarify: 'pending',
    plan: 'pending',
    code: 'pending',
    lint: 'pending',
    pr: 'pending',
  } as Record<PipelinePhase, 'pending' | 'running' | 'done' | 'error'>,
  phaseProgress: 0,
  phaseDescription: '',
  parallelTools: [],
  toolExecutions: {},
  lintResult: null,
  totalDurationMs: 0,
  changedFiles: [],
  prUrl: null,
  error: null,
}

export const usePipelineStore = create<PipelineState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ activePhase: phase }),

  setPhaseStatus: (phase, status) =>
    set((s) => ({
      phaseStatus: { ...s.phaseStatus, [phase]: status },
    })),

  setPhaseProgress: (progress, description) =>
    set((s) => ({
      phaseProgress: progress,
      phaseDescription: description ?? s.phaseDescription,
    })),

  setParallelTools: (tools) => set({ parallelTools: tools }),

  addToolExecution: (id, name) =>
    set((s) => ({
      toolExecutions: {
        ...s.toolExecutions,
        [id]: {
          id,
          name,
          status: 'pending',
          startTime: Date.now(),
        },
      },
    })),

  updateToolExecution: (id, update) =>
    set((s) => {
      const existing = s.toolExecutions[id]
      if (!existing) return {}
      return {
        toolExecutions: {
          ...s.toolExecutions,
          [id]: {
            ...existing,
            ...update,
            endTime: update.status === 'done' || update.status === 'error' ? Date.now() : existing.endTime,
          },
        },
      }
    }),

  setLintResult: (result) => set({ lintResult: result }),

  setTotalDuration: (ms) => set({ totalDurationMs: ms }),

  setChangedFiles: (files) => set({ changedFiles: files }),

  setPrUrl: (url) => set({ prUrl: url }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}))
