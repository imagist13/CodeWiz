package services

import (
	"adorable-backend/internal/models"
	"adorable-backend/internal/repositories"
	"errors"

	"github.com/google/uuid"
)

type ConversationService struct {
	convRepo    *repositories.ConversationRepository
	projectRepo *repositories.ProjectRepository
}

func NewConversationService(convRepo *repositories.ConversationRepository, projectRepo *repositories.ProjectRepository) *ConversationService {
	return &ConversationService{
		convRepo:    convRepo,
		projectRepo: projectRepo,
	}
}

func (s *ConversationService) Create(projectID uuid.UUID, title string) (*models.Conversation, error) {
	project, err := s.projectRepo.FindByID(projectID)
	if err != nil {
		return nil, err
	}

	if project == nil {
		return nil, errors.New("project not found")
	}

	conv := &models.Conversation{
		ProjectID: projectID,
		Title:     title,
	}

	err = s.convRepo.Create(conv)
	return conv, err
}

func (s *ConversationService) GetByID(id uuid.UUID) (*models.Conversation, error) {
	return s.convRepo.FindByID(id)
}

func (s *ConversationService) GetByProjectID(projectID uuid.UUID) ([]models.Conversation, error) {
	return s.convRepo.FindByProjectID(projectID)
}

func (s *ConversationService) Delete(id uuid.UUID) error {
	return s.convRepo.Delete(id)
}
