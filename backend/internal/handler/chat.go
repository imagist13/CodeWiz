package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/codewize/backend/internal/middleware"
	"github.com/codewize/backend/internal/model"
	"github.com/codewize/backend/internal/service"
	"github.com/codewize/backend/internal/service/tool"
	"github.com/codewize/backend/internal/store"
	"github.com/codewize/backend/pkg/llm"
)

type ChatHandler struct {
	llmClient *llm.Client
	repo      *store.Repository
	wsHub     *Hub
	toolExec  *tool.Executor
}

func NewChatHandler(llmClient *llm.Client, repo *store.Repository, hub *Hub, toolExec *tool.Executor) *ChatHandler {
	return &ChatHandler{
		llmClient: llmClient,
		repo:      repo,
		wsHub:     hub,
		toolExec:  toolExec,
	}
}

type ChatStreamRequest struct {
	Messages       []llm.HistoryMessage `json:"messages"`
	RepoID         string              `json:"repo_id"`
	ConversationID string              `json:"conversation_id"`
}

type ToolCall struct {
	ID       string `json:"id"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type SSEWriter struct {
	flusher http.Flusher
	writer  io.Writer
}

func (w *SSEWriter) Write(data []byte) (int, error) {
	if w.flusher != nil {
		w.flusher.Flush()
	}
	return w.writer.Write(data)
}

func (h *ChatHandler) Stream(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "unauthorized")
	}

	var req ChatStreamRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	// Validate conversation access
	projectID, err := uuid.Parse(req.RepoID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid repo_id")
	}

	ok, err := h.repo.ValidateProjectAccess(c.Request().Context(), projectID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if !ok {
		return echo.NewHTTPError(http.StatusNotFound, "project not found")
	}

	convID, _ := uuid.Parse(req.ConversationID)

	// Set SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no")
	c.Response().WriteHeader(http.StatusOK)

	flusher, ok := c.Response().Writer.(http.Flusher)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "streaming not supported")
	}
	sse := &SSEWriter{flusher: flusher, writer: c.Response().Writer}

	ctx := c.Request().Context()

	// Build system prompt with tool definitions
	systemPrompt := h.buildSystemPrompt()
	allMessages := append([]llm.HistoryMessage{{Role: "system", Content: systemPrompt}}, req.Messages...)

	// Streaming chat with tool call detection
	if err := h.streamWithTools(ctx, sse, allMessages, req.RepoID); err != nil {
		h.sendSSEEvent(sse, "error", map[string]string{"message": err.Error()})
	}

	// Save final assistant message
	h.saveAssistantMessage(ctx, convID, h.assembleText(), nil, nil)

	return nil
}

func (h *ChatHandler) streamWithTools(ctx context.Context, sse *SSEWriter, messages []llm.HistoryMessage, repoID string) error {
	provider := os.Getenv("LLM_PROVIDER")
	if provider == "" {
		provider = "openai"
	}

	tokenCh, errCh := h.llmClient.StreamChat(ctx, provider, messages)

	var fullText strings.Builder
	toolCallsInProgress := make(map[string]*ToolCall)
	var pendingCall *ToolCall

	for {
		select {
		case token, ok := <-tokenCh:
			if !ok {
				return nil
			}
			fullText.WriteString(token)
			h.sendSSEEvent(sse, "message", map[string]string{"content": token})

		case err, ok := <-errCh:
			if ok && err != nil {
				h.sendSSEEvent(sse, "error", map[string]string{"message": err.Error()})
			}
			if !ok {
				return nil
			}

		case <-ctx.Done():
			return ctx.Err()
		}

		// Simple tool call detection: look for JSON-like blocks
		text := fullText.String()
		if h.detectToolCall(text, &pendingCall) {
			// Emit tool call event
			if pendingCall != nil {
				h.sendSSEEvent(sse, "tool_call", map[string]interface{}{
					"toolCallId": pendingCall.ID,
					"toolName":   pendingCall.Function.Name,
					"args":       pendingCall.Function.Arguments,
				})

				// Execute tool
				args := parseArgs(pendingCall.Function.Arguments)
				result, err := h.toolExec.Execute(ctx, args, repoID)
				if err != nil {
					result = map[string]interface{}{"error": err.Error(), "ok": false}
				}

				h.sendSSEEvent(sse, "tool_result", map[string]interface{}{
					"toolCallId": pendingCall.ID,
					"result":     result,
				})

				// Append tool result to messages and continue
				resultJSON, _ := json.Marshal(result)
				messages = append(messages,
					llm.HistoryMessage{
						Role:    "assistant",
						Content: text,
					},
					llm.HistoryMessage{
						Role:    "user",
						Content: fmt.Sprintf("[TOOL_RESULT id=%s] %s", pendingCall.ID, string(resultJSON)),
					},
				)

				// Reset for next iteration
				fullText.Reset()
				pendingCall = nil
				h.clearBuffer()

				// Recurse with updated messages
				return h.streamWithTools(ctx, sse, messages, repoID)
			}
		}
	}
}

func (h *ChatHandler) detectToolCall(text string, out **ToolCall) bool {
	// Look for tool_calls JSON array at end of text
	start := strings.LastIndex(text, "```json")
	if start < 0 {
		start = strings.LastIndex(text, "```")
	}
	if start < 0 {
		start = strings.LastIndex(text, "{")
	}
	if start < 0 {
		return false
	}

	candidate := text[start:]
	if !strings.Contains(candidate, `"function"`) && !strings.Contains(candidate, `"name"`) {
		return false
	}

	// Try to parse as tool call
	var tc struct {
		ID       string `json:"id"`
		Function struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
		} `json:"function"`
	}
	if err := json.Unmarshal([]byte(candidate), &tc); err != nil {
		// Try array format
		var arr []struct {
			ID       string `json:"id"`
			Function struct {
				Name      string `json:"name"`
				Arguments string `json:"arguments"`
			} `json:"function"`
		}
		if err := json.Unmarshal([]byte(candidate), &arr); err != nil || len(arr) == 0 {
			return false
		}
		tc = arr[0]
	}

	if tc.ID != "" && tc.Function.Name != "" {
		*out = &tc
		return true
	}
	return false
}

func (h *ChatHandler) executeTool(ctx context.Context, name string, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	t, ok := h.toolExec.Get(name)
	if !ok {
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
	return t.Execute(ctx, args, repoID)
}

func (h *ChatHandler) buildSystemPrompt() string {
	tools := h.toolExec.ListTools()
	toolsJSON, _ := json.Marshal(tools)

	toolBlock := string(toolsJSON)
	prompt := `You are a senior software engineer assistant. You help users build, modify, and maintain software projects.

When a user asks you to perform tasks, use the available tools. After using a tool, describe the results to the user.

AVAILABLE TOOLS (use these names exactly):
` + toolBlock + `

Guidelines:
- Read existing files before modifying them
- Write complete, production-ready code
- Always explain what you are doing
- Check if the application is working after making changes
- Use Commit tool to save changes with meaningful messages
- When asked to check the app status, use CheckApp tool

If you need to perform an action, respond with a tool call in this JSON format (as a code block):
` + "```" + `json
{"id": "call_001", "function": {"name": "ToolName", "arguments": {"arg1": "value1"}}}
` + "```"
	return prompt
}

func (h *ChatHandler) sendSSEEvent(sse *SSEWriter, eventType string, data interface{}) {
	bytes, _ := json.Marshal(data)
	line := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, string(bytes))
	sse.Write([]byte(line))
}

func (h *ChatHandler) saveAssistantMessage(ctx context.Context, convID uuid.UUID, content string, toolCalls, toolResults *string) {
	if convID == uuid.Nil || content == "" {
		return
	}
	msg := &model.Message{
		ID:             uuid.New(),
		ConversationID: convID,
		Role:           "assistant",
		Content:        content,
		ToolCalls:      toolCalls,
		ToolResults:    toolResults,
		CreatedAt:      time.Now(),
	}
	h.repo.CreateMessage(ctx, msg)
}

func (h *ChatHandler) assembleText() string {
	return "" // Track accumulated text in the handler struct
}

func (h *ChatHandler) clearBuffer() {
	// Reset accumulated text
}

func parseArgs(argsStr string) map[string]interface{} {
	if argsStr == "" {
		return make(map[string]interface{})
	}
	// Try parsing as JSON object
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(argsStr), &args); err != nil {
		// Try parsing as individual fields
		return make(map[string]interface{})
	}
	return args
}
