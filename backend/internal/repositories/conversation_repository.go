package repositories

import (
	"adorable-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ConversationRepository struct {
	db *gorm.DB
}

func NewConversationRepository(db *gorm.DB) *ConversationRepository {
	return &ConversationRepository{db: db}
}

func (r *ConversationRepository) Create(conv *models.Conversation) error {
	return r.db.Create(conv).Error
}

func (r *ConversationRepository) FindByID(id uuid.UUID) (*models.Conversation, error) {
	var conv models.Conversation
	err := r.db.Preload("Messages").First(&conv, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &conv, nil
}

func (r *ConversationRepository) FindByProjectID(projectID uuid.UUID) ([]models.Conversation, error) {
	var conversations []models.Conversation
	err := r.db.Where("project_id = ?", projectID).Order("created_at DESC").Find(&conversations).Error
	return conversations, err
}

func (r *ConversationRepository) Update(conv *models.Conversation) error {
	return r.db.Save(conv).Error
}

func (r *ConversationRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.Conversation{}, "id = ?", id).Error
}
