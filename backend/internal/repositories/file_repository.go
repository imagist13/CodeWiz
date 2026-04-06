package repositories

import (
	"adorable-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FileRepository struct {
	db *gorm.DB
}

func NewFileRepository(db *gorm.DB) *FileRepository {
	return &FileRepository{db: db}
}

func (r *FileRepository) Create(file *models.FileUpload) error {
	return r.db.Create(file).Error
}

func (r *FileRepository) FindByID(id uuid.UUID) (*models.FileUpload, error) {
	var file models.FileUpload
	err := r.db.First(&file, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &file, nil
}

func (r *FileRepository) FindByUserID(userID uuid.UUID) ([]models.FileUpload, error) {
	var files []models.FileUpload
	err := r.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&files).Error
	return files, err
}

func (r *FileRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.FileUpload{}, "id = ?", id).Error
}
