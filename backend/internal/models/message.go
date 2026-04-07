package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ToolCall struct {
	ToolName string `json:"tool_name"`
	Input    any    `json:"input"`
}

type Message struct {
	ID             uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ConversationID uuid.UUID      `gorm:"type:uuid;not null;index" json:"conversation_id"`
	Role           string         `gorm:"size:50;not null" json:"role"`
	Content        string         `gorm:"type:text" json:"content"`
	ToolCalls      JSONB          `gorm:"type:jsonb" json:"tool_calls,omitempty"`
	ToolCallID     string         `gorm:"size:255" json:"tool_call_id,omitempty"`
	CreatedAt      time.Time      `gorm:"default:now()" json:"created_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Message) TableName() string {
	return "messages"
}

type JSONB map[string]any

func (j JSONB) Value() (driver.Value, error) {
	return json.Marshal(j)
}

func (j *JSONB) Scan(value any) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, j)
}
