package repositories

import (
	"adorable-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MessageRepository struct {
	db *gorm.DB
}

func NewMessageRepository(db *gorm.DB) *MessageRepository {
	return &MessageRepository{db: db}
}

func (r *MessageRepository) Create(msg *models.Message) error {
	return r.db.Create(msg).Error
}

func (r *MessageRepository) FindByConversationID(conversationID uuid.UUID) ([]models.Message, error) {
	var messages []models.Message
	err := r.db.Where("conversation_id = ?", conversationID).Order("created_at ASC").Find(&messages).Error
	return messages, err
}

func (r *MessageRepository) CreateMany(messages []models.Message) error {
	return r.db.Create(&messages).Error
}
