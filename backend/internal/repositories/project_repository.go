package repositories

import (
	"adorable-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ProjectRepository struct {
	db *gorm.DB
}

func NewProjectRepository(db *gorm.DB) *ProjectRepository {
	return &ProjectRepository{db: db}
}

func (r *ProjectRepository) Create(project *models.Project) error {
	return r.db.Create(project).Error
}

func (r *ProjectRepository) FindByID(id uuid.UUID) (*models.Project, error) {
	var project models.Project
	err := r.db.First(&project, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &project, nil
}

func (r *ProjectRepository) FindByUserID(userID uuid.UUID) ([]models.Project, error) {
	var projects []models.Project
	err := r.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&projects).Error
	return projects, err
}

func (r *ProjectRepository) Update(project *models.Project) error {
	return r.db.Save(project).Error
}

func (r *ProjectRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.Project{}, "id = ?", id).Error
}
