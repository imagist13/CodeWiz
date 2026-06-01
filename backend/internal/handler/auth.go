package handler

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/codewize/backend/internal/middleware"
	"github.com/codewize/backend/internal/model"
	"github.com/codewize/backend/internal/service"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string      `json:"token"`
	User  interface{} `json:"user"`
}

func (h *AuthHandler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email and password are required")
	}
	if len(req.Password) < 6 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 6 characters")
	}

	user, token, err := h.svc.Register(c.Request().Context(), req.Email, req.Password, req.Name)
	if err != nil {
		if errors.Is(err, service.ErrUserExists) {
			return echo.NewHTTPError(http.StatusConflict, "user already exists")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusCreated, AuthResponse{
		Token: token,
		User:  toUserJSON(user),
	})
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email and password are required")
	}

	user, token, err := h.svc.Login(c.Request().Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, AuthResponse{
		Token: token,
		User:  toUserJSON(user),
	})
}

func (h *AuthHandler) Me(c echo.Context) error {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetUserByID(c.Request().Context(), userID)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "user not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, user)
}

func (h *AuthHandler) Logout(c echo.Context) error {
	// JWT is stateless; client discards token. This endpoint exists for API compatibility.
	return c.JSON(http.StatusOK, map[string]string{"message": "logged out"})
}

func toUserJSON(user *model.User) map[string]interface{} {
	return map[string]interface{}{
		"id":         user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"avatar_url": user.AvatarURL,
		"created_at": user.CreatedAt,
		"updated_at": user.UpdatedAt,
	}
}
