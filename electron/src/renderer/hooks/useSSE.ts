import { useRef, useCallback } from 'react'
import { useChatStore, Message, ToolCall } from '../store/chatStore'
import { useUserStore } from '../store/userStore'
import { usePipelineStore } from '../store/pipelineStore'

declare global {
  interface Window {
    electronAPI?: {
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
    }
  }
}

function parseSSEEvent(raw: string): { event_type: string; data: any } | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'data: [DONE]') return null
  if (!trimmed.startsWith('data:')) return null
  const jsonStr = trimmed.slice(5).trim()
  if (!jsonStr) return null

  let event: any
  try {
    event = JSON.parse(jsonStr)
  } catch {
    console.warn('[SSE] Failed to parse event JSON, skipping:', jsonStr?.slice(0, 100))
    return null
  }

  let innerData: any
  let evType = ''
  try {
    if (event.data) {
      if (typeof event.data === 'string') {
        try {
          innerData = JSON.parse(event.data)
        } catch {
          innerData = event
        }
      } else {
        innerData = event.data
      }
    } else {
      innerData = event
    }
    evType = innerData.event_type || innerData.event || ''
  } catch {
    innerData = event
    evType = event.event || event.event_type || ''
  }

  if (!evType) return null
  return { event_type: evType, data: innerData }
}

// Fallback timeout for SSE streams (in milliseconds)
const SSE_TIMEOUT_MS = 90_000

export function useSSE() {
  // Holds the current cleanup functions set up during the latest send() call.
  // Using a ref ensures abort() always calls the latest versions.
  const cleanupRef = useRef<(() => void) | null>(null)
  // Holds the timer ID so abort() can cancel it.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const send = useCallback(async (content: string, conversationId?: string) => {
    const store = useChatStore.getState()
    const pipeline = usePipelineStore.getState()

    store.setStreaming(true)
    store.setError(null)

    const userMsgId = `user-${Date.now()}`
    store.addMessage({
      id: userMsgId,
      role: 'user',
      content,
      timestamp: Date.now(),
    })

    let assistantMsgId: string | null = null
    let buffer = ''
    let done = false

    // Stop streaming and mark done — call directly on the store to avoid stale closures.
    const stopStreaming = (errMsg?: string) => {
      if (done) return
      done = true
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (errMsg) {
        pipeline.setError(errMsg)
        store.setError(errMsg)
      }
      store.setStreaming(false)
    }

    // Timer fallback: if the stream doesn't end in SSE_TIMEOUT_MS, force-stop it.
    timerRef.current = setTimeout(() => {
      console.warn('[SSE] Stream timeout — forcing end')
      stopStreaming('Stream timed out after 90 seconds')
    }, SSE_TIMEOUT_MS)

    const unsubChunk = window.electronAPI?.onSSEChunk((chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const raw of lines) {
        const ev = parseSSEEvent(raw)
        if (!ev) continue

        const { event_type: evType, data } = ev

        // ---- Pipeline Phase Events ----
        if (evType === 'phase_start') {
          pipeline.setPhase(data.phase)
          pipeline.setPhaseStatus(data.phase, 'running')
          pipeline.setPhaseProgress(0, data.description || '')
          continue
        }
        if (evType === 'phase_end') {
          pipeline.setPhaseStatus(data.phase, data.success !== false ? 'done' : 'error')
          pipeline.setPhaseProgress(1, data.description || '')
          continue
        }
        if (evType === 'phase_progress') {
          pipeline.setPhaseProgress(data.progress || 0, data.description || '')
          continue
        }

        // ---- Parallel Tools ----
        if (evType === 'parallel_tools') {
          pipeline.setParallelTools(data.tool_names || [])
          const names = data.tool_names || []
          const ids = data.call_ids || []
          names.forEach((name: string, i: number) => {
            pipeline.addToolExecution(ids[i] || `tc_${i}`, name)
          })
          continue
        }

        // ---- Lint Result ----
        if (evType === 'lint_result') {
          pipeline.setLintResult({
            success: data.success,
            overallPass: data.overall_pass || data.overallPass || false,
            lintPassRate: data.lint_pass_rate || data.lintPassRate || 0,
            testPassRate: data.test_pass_rate || data.testPassRate || 0,
            lintTotal: data.lint_total || data.lintTotal || 0,
            lintPassed: data.lint_passed || data.lintPassed || 0,
            testTotal: data.test_total || data.testTotal || 0,
            testPassed: data.test_passed || data.testPassed || 0,
            filesChecked: data.files_checked || data.filesChecked || 0,
            errors: data.errors || [],
            stdout: data.stdout || '',
            stderr: data.stderr || '',
            repoName: data.repo_name || data.repoName || '',
            durationMs: data.duration_ms || data.durationMs || 0,
          })
          continue
        }

        // ---- Pipeline Summary ----
        if (evType === 'pipeline_summary') {
          pipeline.setTotalDuration(data.total_duration_ms || data.totalDurationMs || 0)
          pipeline.setChangedFiles(data.changed_files || data.changedFiles || [])
          pipeline.setPrUrl(data.pr_url || data.prUrl || null)
          if (data.error) pipeline.setError(data.error)
          continue
        }

        // ---- Tool Lifecycle ----
        if (evType === 'tool.start') {
          pipeline.updateToolExecution(data.call_id || data.call_id || '', { status: 'running' })
          continue
        }
        if (evType === 'tool.end') {
          pipeline.updateToolExecution(data.call_id || data.call_id || '', {
            status: data.success !== false ? 'done' : 'error',
            result: data.content,
            error: data.error,
          })
          continue
        }
        if (evType === 'tool.error') {
          pipeline.updateToolExecution(data.call_id || data.call_id || '', {
            status: 'error',
            error: data.error || data.data,
          })
          continue
        }

        // ---- Thinking ----
        if (evType === 'thinking') {
          const msgs = useChatStore.getState().messages
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.id === assistantMsgId) {
            useChatStore.getState().updateMessage(assistantMsgId, { thinking: (lastMsg.thinking || '') + (data.data || data.thinking || '') })
          }
          continue
        }

        // ---- Text Chunk ----
        if (evType === 'text_chunk' || evType === 'text_delta') {
          if (!assistantMsgId) {
            assistantMsgId = (data.msg_id ?? `assistant-${Date.now()}`) as string
            store.addMessage({
              id: assistantMsgId,
              role: 'assistant',
              content: data.data || data.text || '',
              timestamp: Date.now(),
            })
          } else {
            const msgs = useChatStore.getState().messages
            const lastMsg = msgs[msgs.length - 1]
            if (lastMsg?.id === assistantMsgId) {
              store.updateMessage(assistantMsgId, {
                content: (lastMsg.content || '') + (data.data || data.text || ''),
              })
            }
          }
          continue
        }

        // ---- Tool Call ----
        if (evType === 'tool_call') {
          if (!assistantMsgId) {
            assistantMsgId = `assistant-${Date.now()}`
            store.addMessage({
              id: assistantMsgId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
            })
          }
          const toolCall: ToolCall = {
            id: data.call_id || data.call_id || '',
            name: data.name || data.name || '',
            input: data.input || data.arguments || {},
            status: 'pending',
          }
          const msgs = useChatStore.getState().messages
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.id === assistantMsgId) {
            store.updateMessage(assistantMsgId, {
              tool_calls: [...(lastMsg.tool_calls || []), toolCall],
            })
          }
          pipeline.updateToolExecution(toolCall.id, { status: 'running' })
          continue
        }

        // ---- Tool Result ----
        if (evType === 'tool_result') {
          if (!assistantMsgId) continue
          const msgs = useChatStore.getState().messages
          const lastMsg = msgs[msgs.length - 1]
          const callId = data.call_id || data.call_id || ''
          if (lastMsg?.id === assistantMsgId && lastMsg.tool_calls) {
            const updated = lastMsg.tool_calls.map((tc) =>
              tc.id === callId
                ? { ...tc, result: data.result || '', status: data.error ? 'error' as const : 'done' as const }
                : tc,
            )
            store.updateMessage(assistantMsgId, { tool_calls: updated })
          }
          pipeline.updateToolExecution(callId, {
            status: data.error ? 'error' : 'done',
            result: data.result,
            error: data.error,
          })
          continue
        }

        // ---- Done ----
        if (evType === 'done') {
          stopStreaming()
          continue
        }

        // ---- Error ----
        if (evType === 'error') {
          stopStreaming(String(data.data || data.error || 'Unknown error'))
          continue
        }
      }
    })

    const unsubError = window.electronAPI?.onSSEError((msg: string) => {
      stopStreaming(msg)
    })

    const unsubEnd = window.electronAPI?.onSSEEnd(() => {
      stopStreaming()
    })

    // Store cleanup function in a ref so abort() always calls the current version.
    cleanupRef.current = () => {
      unsubChunk?.()
      unsubError?.()
      unsubEnd?.()
    }

    try {
      await window.electronAPI?.backendSSE({
        message: content,
        conversation_id: conversationId,
        username: conversationId ? useUserStore.getState().username || 'default' : 'default',
        new_engine: true,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg !== 'Request timeout') {
        stopStreaming(msg)
      } else {
        stopStreaming()
      }
    } finally {
      // Detach listeners immediately so they don't fire for the next send() call.
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])  // empty deps: all store access uses .getState() for freshness

  const abort = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Destroy the HTTP connection in the main process so the backend stream stops.
    window.electronAPI?.abortSSE()
    useChatStore.getState().setStreaming(false)
  }, [])

  return { send, abort }
}
