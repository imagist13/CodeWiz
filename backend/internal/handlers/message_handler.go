package handlers

import (
	"codewiz-backend/internal/models"
	"codewiz-backend/internal/services"
	"codewiz-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type MessageHandler struct {
	msgService *services.MessageService
}

func NewMessageHandler(msgService *services.MessageService) *MessageHandler {
	return &MessageHandler{msgService: msgService}
}

type CreateMessageRequest struct {
	Role      string            `json:"role" binding:"required"`
	Content   string            `json:"content"`
	ToolCalls *models.JSONB     `json:"tool_calls"`
}

func (h *MessageHandler) List(c *gin.Context) {
	convIDStr := c.Param("id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		response.BadRequest(c, "Invalid conversation ID")
		return
	}

	messages, err := h.msgService.GetByConversationID(convID)
	if err != nil {
		response.InternalError(c, "Failed to list messages")
		return
	}

	response.Success(c, messages)
}

// Create adds a new message to an existing conversation.
// Used by the AI service to persist assistant responses.
func (h *MessageHandler) Create(c *gin.Context) {
	convIDStr := c.Param("conversationId")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		response.BadRequest(c, "Invalid conversation ID")
		return
	}

	var req CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	if req.Role != "user" && req.Role != "assistant" {
		response.BadRequest(c, "role must be 'user' or 'assistant'")
		return
	}

	msg, err := h.msgService.Create(convID, req.Role, req.Content, req.ToolCalls)
	if err != nil {
		if err.Error() == "conversation not found" {
			response.NotFound(c, "Conversation not found")
			return
		}
		response.InternalError(c, "Failed to create message")
		return
	}

	response.Created(c, msg)
}
