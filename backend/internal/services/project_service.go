package services

import (
	"adorable-backend/internal/models"
	"adorable-backend/internal/repositories"
	"errors"

	"github.com/google/uuid"
)

type ProjectService struct {
	projectRepo *repositories.ProjectRepository
}

func NewProjectService(projectRepo *repositories.ProjectRepository) *ProjectService {
	return &ProjectService{projectRepo: projectRepo}
}

func (s *ProjectService) Create(userID uuid.UUID, name, description string) (*models.Project, error) {
	project := &models.Project{
		UserID:      userID,
		Name:        name,
		Description: description,
	}
	err := s.projectRepo.Create(project)
	return project, err
}

func (s *ProjectService) GetByID(id uuid.UUID) (*models.Project, error) {
	return s.projectRepo.FindByID(id)
}

func (s *ProjectService) GetByUserID(userID uuid.UUID) ([]models.Project, error) {
	return s.projectRepo.FindByUserID(userID)
}

func (s *ProjectService) Update(id, userID uuid.UUID, name, description string) (*models.Project, error) {
	project, err := s.projectRepo.FindByID(id)
	if err != nil {
		return nil, err
	}

	if project.UserID != userID {
		return nil, errors.New("unauthorized")
	}

	project.Name = name
	project.Description = description

	err = s.projectRepo.Update(project)
	return project, err
}

func (s *ProjectService) Delete(id, userID uuid.UUID) error {
	project, err := s.projectRepo.FindByID(id)
	if err != nil {
		return err
	}

	if project.UserID != userID {
		return errors.New("unauthorized")
	}

	return s.projectRepo.Delete(id)
}
