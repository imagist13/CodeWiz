package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email     string         `gorm:"uniqueIndex;size:255;not null" json:"email"`
	Password  string         `gorm:"size:255;not null" json:"-"`
	Name      string         `gorm:"size:255" json:"name"`
	AvatarURL string         `gorm:"type:text" json:"avatar_url"`
	CreatedAt time.Time      `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time      `gorm:"default:now()" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Projects  []Project      `gorm:"foreignKey:UserID" json:"projects,omitempty"`
}

func (User) TableName() string {
	return "users"
}
