package handlers

import (
	"adorable-backend/internal/middleware"
	"adorable-backend/internal/services"
	"adorable-backend/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ProjectHandler struct {
	projectService *services.ProjectService
}

func NewProjectHandler(projectService *services.ProjectService) *ProjectHandler {
	return &ProjectHandler{projectService: projectService}
}

type CreateProjectRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

type UpdateProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *ProjectHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	projects, err := h.projectService.GetByUserID(userID)
	if err != nil {
		response.InternalError(c, "Failed to list projects")
		return
	}

	response.Success(c, projects)
}

func (h *ProjectHandler) Get(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "Invalid project ID")
		return
	}

	project, err := h.projectService.GetByID(id)
	if err != nil {
		response.NotFound(c, "Project not found")
		return
	}

	if project.UserID != userID && !project.IsPublic {
		response.Forbidden(c, "Access denied")
		return
	}

	response.Success(c, project)
}

func (h *ProjectHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	var req CreateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	project, err := h.projectService.Create(userID, req.Name, req.Description)
	if err != nil {
		response.InternalError(c, "Failed to create project")
		return
	}

	response.Created(c, project)
}

func (h *ProjectHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "Invalid project ID")
		return
	}

	var req UpdateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	project, err := h.projectService.Update(id, userID, req.Name, req.Description)
	if err != nil {
		response.InternalError(c, "Failed to update project")
		return
	}

	response.Success(c, project)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "Invalid project ID")
		return
	}

	if err := h.projectService.Delete(id, userID); err != nil {
		response.InternalError(c, "Failed to delete project")
		return
	}

	response.Success(c, gin.H{"message": "Project deleted"})
}
