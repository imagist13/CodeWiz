package handlers

import (
	"adorable-backend/internal/services"
	"adorable-backend/pkg/response"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(authService *services.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: email and password (min 6 chars) required")
		return
	}

	user, err := h.authService.Register(req.Email, req.Password, req.Name)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	jwtToken, err := h.authService.GenerateToken(user)
	if err != nil {
		response.InternalError(c, "Failed to generate token")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"token": jwtToken,
			"user":  user,
		},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: email and password required")
		return
	}

	user, err := h.authService.Login(req.Email, req.Password)
	if err != nil {
		response.Unauthorized(c, "Invalid credentials")
		return
	}

	jwtToken, err := h.authService.GenerateToken(user)
	if err != nil {
		response.InternalError(c, "Failed to generate token")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"token": jwtToken,
			"user":  user,
		},
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	userID, ok := userIDVal.(uuid.UUID)
	if !ok {
		response.Unauthorized(c, "Invalid user ID")
		return
	}

	user, err := h.authService.GetUserByID(userID)
	if err != nil {
		response.NotFound(c, "User not found")
		return
	}

	response.Success(c, user)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}
