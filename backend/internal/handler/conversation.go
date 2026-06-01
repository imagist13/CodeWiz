package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/codewize/backend/internal/middleware"
	"github.com/codewize/backend/internal/model"
	"github.com/codewize/backend/internal/store"
)

type ConversationHandler struct {
	repo *store.Repository
}

func NewConversationHandler(repo *store.Repository) *ConversationHandler {
	return &ConversationHandler{repo: repo}
}

type CreateConversationRequest struct {
	Title string `json:"title"`
}

type MessageHandler struct {
	repo *store.Repository
}

func NewMessageHandler(repo *store.Repository) *MessageHandler {
	return &MessageHandler{repo: repo}
}

func (h *ConversationHandler) List(c echo.Context) error {
	userID := middleware.GetUserID(c)
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}

	// Validate access
	ok, err := h.repo.ValidateProjectAccess(c.Request().Context(), projectID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if !ok {
		return echo.NewHTTPError(http.StatusNotFound, "project not found")
	}

	convs, err := h.repo.ListConversations(c.Request().Context(), projectID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if convs == nil {
		convs = []model.Conversation{}
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": convs})
}

func (h *ConversationHandler) Create(c echo.Context) error {
	userID := middleware.GetUserID(c)
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}

	// Validate access
	ok, err := h.repo.ValidateProjectAccess(c.Request().Context(), projectID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if !ok {
		return echo.NewHTTPError(http.StatusNotFound, "project not found")
	}

	var req CreateConversationRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Title == "" {
		req.Title = "New conversation"
	}

	now := time.Now()
	conv := &model.Conversation{
		ID:        uuid.New(),
		ProjectID: projectID,
		Title:     req.Title,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := h.repo.CreateConversation(c.Request().Context(), conv); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{"data": conv})
}

func (h *ConversationHandler) Get(c echo.Context) error {
	userID := middleware.GetUserID(c)
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}
	convID, err := uuid.Parse(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid conversation id")
	}

	conv, err := h.repo.GetConversation(c.Request().Context(), convID, projectID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "conversation not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	messages, err := h.repo.ListMessages(c.Request().Context(), convID, 100)
	if err != nil {
		messages = []model.Message{}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"data":      conv,
		"messages":  messages,
	})
}

func (h *ConversationHandler) Delete(c echo.Context) error {
	userID := middleware.GetUserID(c)
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}
	convID, err := uuid.Parse(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid conversation id")
	}

	if err := h.repo.DeleteConversation(c.Request().Context(), convID, projectID, userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *MessageHandler) List(c echo.Context) error {
	userID := middleware.GetUserID(c)
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}
	convID, err := uuid.Parse(c.Param("cid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid conversation id")
	}

	// Validate project access
	ok, err := h.repo.ValidateProjectAccess(c.Request().Context(), projectID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if !ok {
		return echo.NewHTTPError(http.StatusNotFound, "project not found")
	}

	// Validate conversation belongs to project
	_, err = h.repo.GetConversation(c.Request().Context(), convID, projectID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "conversation not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	messages, err := h.repo.ListMessages(c.Request().Context(), convID, 100)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if messages == nil {
		messages = []model.Message{}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"data": messages})
}
