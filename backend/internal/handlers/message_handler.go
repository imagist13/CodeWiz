package handlers

import (
	"adorable-backend/internal/services"
	"adorable-backend/pkg/response"

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
	Role     string `json:"role" binding:"required"`
	Content  string `json:"content"`
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
