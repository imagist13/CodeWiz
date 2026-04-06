package handlers

import (
	"adorable-backend/internal/services"
	"adorable-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ConversationHandler struct {
	convService *services.ConversationService
}

func NewConversationHandler(convService *services.ConversationService) *ConversationHandler {
	return &ConversationHandler{convService: convService}
}

type CreateConversationRequest struct {
	Title string `json:"title"`
}

func (h *ConversationHandler) List(c *gin.Context) {
	projectIDStr := c.Param("repoId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		response.BadRequest(c, "Invalid project ID")
		return
	}

	conversations, err := h.convService.GetByProjectID(projectID)
	if err != nil {
		response.InternalError(c, "Failed to list conversations")
		return
	}

	response.Success(c, conversations)
}

func (h *ConversationHandler) Get(c *gin.Context) {
	idStr := c.Param("conversationId")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "Invalid conversation ID")
		return
	}

	conv, err := h.convService.GetByID(id)
	if err != nil {
		response.NotFound(c, "Conversation not found")
		return
	}

	response.Success(c, conv)
}

func (h *ConversationHandler) Create(c *gin.Context) {
	projectIDStr := c.Param("repoId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		response.BadRequest(c, "Invalid project ID")
		return
	}

	var req CreateConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Title = ""
	}

	conv, err := h.convService.Create(projectID, req.Title)
	if err != nil {
		response.InternalError(c, "Failed to create conversation")
		return
	}

	response.Created(c, conv)
}

func (h *ConversationHandler) Delete(c *gin.Context) {
	idStr := c.Param("conversationId")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "Invalid conversation ID")
		return
	}

	if err := h.convService.Delete(id); err != nil {
		response.InternalError(c, "Failed to delete conversation")
		return
	}

	response.Success(c, gin.H{"message": "Conversation deleted"})
}
