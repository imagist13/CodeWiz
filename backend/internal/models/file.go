package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FileUpload struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key" json:"id"`
	UserID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"user_id"`
	Filename  string         `gorm:"size:255;not null" json:"filename"`
	FilePath  string         `gorm:"type:text;not null" json:"file_path"`
	FileSize  int64          `json:"file_size"`
	MimeType  string         `gorm:"size:100" json:"mime_type"`
	CreatedAt time.Time      `gorm:"default:now()" json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (FileUpload) TableName() string {
	return "file_uploads"
}

func (f *FileUpload) BeforeCreate(tx *gorm.DB) error {
	if f.ID == uuid.Nil {
		f.ID = uuid.New()
	}
	return nil
}