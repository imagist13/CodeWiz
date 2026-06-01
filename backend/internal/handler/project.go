package handler

import (
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/codewize/backend/internal/middleware"
	"github.com/codewize/backend/internal/model"
	"github.com/codewize/backend/internal/store"
)

type ProjectHandler struct {
	repo *store.Repository
}

func NewProjectHandler(repo *store.Repository) *ProjectHandler {
	return &ProjectHandler{repo: repo}
}

type CreateProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UpdateProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UpdateVMRequest struct {
	VmID                  string `json:"vm_id"`
	PreviewURL            string `json:"preview_url"`
	DevCommandTerminalURL  string `json:"dev_command_terminal_url"`
	AdditionalTerminalsURL string `json:"additional_terminals_url"`
}

type UpdateProductionDomainRequest struct {
	Domain string `json:"domain"`
}

func (h *ProjectHandler) List(c echo.Context) error {
	userID := middleware.GetUserID(c)
	projects, err := h.repo.ListProjects(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if projects == nil {
		projects = []model.Project{}
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": projects})
}

func (h *ProjectHandler) Get(c echo.Context) error {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}

	p, err := h.repo.GetProject(c.Request().Context(), id, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "project not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": p})
}

func (h *ProjectHandler) Create(c echo.Context) error {
	userID := middleware.GetUserID(c)
	var req CreateProjectRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.Name == "" {
		req.Name = "Untitled project"
	}

	now := model.Conversation{}.CreatedAt // reuse time
	p := &model.Project{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        req.Name,
		Description: req.Description,
		IsPublic:    false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	_ = now // silence unused

	if err := h.repo.CreateProject(c.Request().Context(), p); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{"data": p})
}

func (h *ProjectHandler) Update(c echo.Context) error {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}

	var req UpdateProjectRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	p, err := h.repo.UpdateProject(c.Request().Context(), id, userID, req.Name, req.Description)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "project not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"data": p})
}

func (h *ProjectHandler) Delete(c echo.Context) error {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}

	if err := h.repo.DeleteProject(c.Request().Context(), id, userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *ProjectHandler) UpdateVM(c echo.Context) error {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}

	var req UpdateVMRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	vmID := req.VmID
	previewURL := req.PreviewURL
	devURL := req.DevCommandTerminalURL
	termURL := req.AdditionalTerminalsURL

	p, err := h.repo.UpdateProjectVM(c.Request().Context(), id, userID, vmID, previewURL, devURL, termURL)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "project not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"data": p})
}

func (h *ProjectHandler) UpdateProductionDomain(c echo.Context) error {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid project id")
	}

	var req UpdateProductionDomainRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	p, err := h.repo.UpdateProductionDomain(c.Request().Context(), id, userID, req.Domain)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "project not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"data": p})
}
