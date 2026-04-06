package handlers

import (
	"adorable-backend/internal/middleware"
	"adorable-backend/internal/services"
	"adorable-backend/pkg/response"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type FileHandler struct {
	fileService *services.FileService
	uploadDir   string
}

func NewFileHandler(fileService *services.FileService, uploadDir string) *FileHandler {
	os.MkdirAll(uploadDir, 0755)
	return &FileHandler{fileService: fileService, uploadDir: uploadDir}
}

func (h *FileHandler) Upload(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "No file uploaded")
		return
	}

	src, err := file.Open()
	if err != nil {
		response.InternalError(c, "Failed to open file")
		return
	}
	defer src.Close()

	upload, err := h.fileService.Upload(userID, file.Filename, file.Size, file.Header.Get("Content-Type"), src)
	if err != nil {
		response.InternalError(c, "Failed to save file")
		return
	}

	response.Created(c, upload)
}

func (h *FileHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "Invalid file ID")
		return
	}

	upload, err := h.fileService.GetByID(id)
	if err != nil {
		response.NotFound(c, "File not found")
		return
	}

	c.File(upload.FilePath)
}

func (h *FileHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	files, err := h.fileService.GetByUserID(userID)
	if err != nil {
		response.InternalError(c, "Failed to list files")
		return
	}

	response.Success(c, files)
}

func (h *FileHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		response.Unauthorized(c, "Not authenticated")
		return
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "Invalid file ID")
		return
	}

	if err := h.fileService.Delete(id, userID); err != nil {
		response.InternalError(c, "Failed to delete file")
		return
	}

	response.Success(c, gin.H{"message": "File deleted"})
}
