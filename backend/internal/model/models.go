package model

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Password  string    `json:"-"` // hashed, never expose
	AvatarURL string    `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Project struct {
	ID                       uuid.UUID `json:"id"`
	UserID                   uuid.UUID `json:"user_id"`
	Name                     string    `json:"name"`
	Description              string    `json:"description,omitempty"`
	GitURL                   string    `json:"git_url,omitempty"`
	IsPublic                 bool      `json:"is_public"`
	SourceRepoID             *string   `json:"source_repo_id,omitempty"`
	VmID                     *string   `json:"vm_id,omitempty"`
	PreviewURL               *string   `json:"preview_url,omitempty"`
	DevCommandTerminalURL    *string   `json:"dev_command_terminal_url,omitempty"`
	AdditionalTerminalsURL   *string   `json:"additional_terminals_url,omitempty"`
	ProductionDomain         *string   `json:"production_domain,omitempty"`
	ProductionDeploymentID   *string   `json:"production_deployment_id,omitempty"`
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

type Conversation struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID             uuid.UUID `json:"id"`
	ConversationID uuid.UUID `json:"conversation_id"`
	Role           string    `json:"role"` // "user" | "assistant"
	Content        string    `json:"content"`
	ToolCalls      *string   `json:"tool_calls,omitempty"`
	ToolResults    *string   `json:"tool_results,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}
