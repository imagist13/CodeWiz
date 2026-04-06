package services

import (
	"adorable-backend/internal/models"
	"adorable-backend/internal/repositories"
	"errors"

	"github.com/google/uuid"
)

type MessageService struct {
	msgRepo    *repositories.MessageRepository
	convRepo   *repositories.ConversationRepository
}

func NewMessageService(msgRepo *repositories.MessageRepository, convRepo *repositories.ConversationRepository) *MessageService {
	return &MessageService{
		msgRepo:  msgRepo,
		convRepo: convRepo,
	}
}

func (s *MessageService) GetByConversationID(conversationID uuid.UUID) ([]models.Message, error) {
	return s.msgRepo.FindByConversationID(conversationID)
}

func (s *MessageService) Create(conversationID uuid.UUID, role, content string, toolCalls *models.JSONB) (*models.Message, error) {
	conv, err := s.convRepo.FindByID(conversationID)
	if err != nil || conv == nil {
		return nil, errors.New("conversation not found")
	}

	msg := &models.Message{
		ConversationID: conversationID,
		Role:           role,
		Content:        content,
	}

	if toolCalls != nil {
		msg.ToolCalls = *toolCalls
	}

	err = s.msgRepo.Create(msg)
	return msg, err
}

func (s *MessageService) CreateMany(conversationID uuid.UUID, messages []models.Message) error {
	conv, err := s.convRepo.FindByID(conversationID)
	if err != nil || conv == nil {
		return errors.New("conversation not found")
	}

	for i := range messages {
		messages[i].ConversationID = conversationID
	}

	return s.msgRepo.CreateMany(messages)
}
