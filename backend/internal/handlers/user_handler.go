package handlers

import (
	"adorable-backend/internal/middleware"
	"adorable-backend/internal/services"
	"adorable-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UserHandler struct {
	userService *services.UserService
}

func NewUserHandler(userService *services.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

type UpdateUserRequest struct {
	Name string `json:"name"`
}

func (h *UserHandler) GetProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	user, err := h.userService.GetByID(userID)
	if err != nil {
		response.NotFound(c, "User not found")
		return
	}

	response.Success(c, user)
}

func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	user, err := h.userService.UpdateProfile(userID, req.Name)
	if err != nil {
		response.InternalError(c, "Failed to update profile")
		return
	}

	response.Success(c, user)
}
