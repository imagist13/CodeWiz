package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key" json:"id"`
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

// BeforeCreate ensures id is set: GORM may otherwise send a zero UUID / omit default,
// which violates NOT NULL when the DB column has no working default.
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}
