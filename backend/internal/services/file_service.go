package services

import (
	"adorable-backend/internal/models"
	"adorable-backend/internal/repositories"
	"errors"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

type FileService struct {
	fileRepo *repositories.FileRepository
	uploadDir string
}

func NewFileService(fileRepo *repositories.FileRepository, uploadDir string) *FileService {
	return &FileService{
		fileRepo:  fileRepo,
		uploadDir: uploadDir,
	}
}

func (s *FileService) Upload(userID uuid.UUID, filename string, size int64, mimeType string, reader io.Reader) (*models.FileUpload, error) {
	if err := os.MkdirAll(s.uploadDir, 0755); err != nil {
		return nil, err
	}

	id := uuid.New()
	ext := filepath.Ext(filename)
	newFilename := id.String() + ext
	filePath := filepath.Join(s.uploadDir, newFilename)

	file, err := os.Create(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	written, err := io.Copy(file, reader)
	if err != nil {
		os.Remove(filePath)
		return nil, err
	}

	upload := &models.FileUpload{
		ID:       id,
		UserID:   userID,
		Filename: filename,
		FilePath: filePath,
		FileSize: written,
		MimeType: mimeType,
	}

	err = s.fileRepo.Create(upload)
	if err != nil {
		os.Remove(filePath)
		return nil, err
	}

	return upload, nil
}

func (s *FileService) GetByID(id uuid.UUID) (*models.FileUpload, error) {
	return s.fileRepo.FindByID(id)
}

func (s *FileService) GetByUserID(userID uuid.UUID) ([]models.FileUpload, error) {
	return s.fileRepo.FindByUserID(userID)
}

func (s *FileService) Delete(id, userID uuid.UUID) error {
	upload, err := s.fileRepo.FindByID(id)
	if err != nil {
		return err
	}

	if upload.UserID != userID {
		return errors.New("unauthorized")
	}

	if err := os.Remove(upload.FilePath); err != nil && !os.IsNotExist(err) {
		return err
	}

	return s.fileRepo.Delete(id)
}
