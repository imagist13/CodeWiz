package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Conversation struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ProjectID uuid.UUID      `gorm:"type:uuid;not null;index" json:"project_id"`
	Title     string         `gorm:"size:255" json:"title"`
	CreatedAt time.Time      `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time      `gorm:"default:now()" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Messages  []Message      `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}

func (Conversation) TableName() string {
	return "conversations"
}
