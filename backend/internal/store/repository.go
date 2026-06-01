package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/codewize/backend/internal/model"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// ─── User ────────────────────────────────────────────────────────────────────

func (r *Repository) CreateUser(ctx context.Context, user *model.User) error {
	q := `INSERT INTO users (id, email, name, password, avatar_url, created_at, updated_at)
		  VALUES ($1,$2,$3,$4,$5,$6,$7)`
	_, err := r.db.Exec(ctx, q, user.ID, user.Email, user.Name, user.Password, user.AvatarURL, user.CreatedAt, user.UpdatedAt)
	return err
}

func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	q := `SELECT id, email, name, password, avatar_url, created_at, updated_at FROM users WHERE email = $1`
	row := r.db.QueryRow(ctx, q, email)
	return scanUser(row)
}

func (r *Repository) GetUserByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	q := `SELECT id, email, name, password, avatar_url, created_at, updated_at FROM users WHERE id = $1`
	row := r.db.QueryRow(ctx, q, id)
	return scanUser(row)
}

func (r *Repository) UpdateUser(ctx context.Context, id uuid.UUID, name string) (*model.User, error) {
	q := `UPDATE users SET name = $1, updated_at = $2 WHERE id = $3
		  RETURNING id, email, name, password, avatar_url, created_at, updated_at`
	row := r.db.QueryRow(ctx, q, name, time.Now(), id)
	return scanUser(row)
}

// ─── Project ──────────────────────────────────────────────────────────────────

func (r *Repository) CreateProject(ctx context.Context, p *model.Project) error {
	q := `INSERT INTO projects (id, user_id, name, description, git_url, is_public,
		  source_repo_id, vm_id, preview_url, dev_command_terminal_url,
		  additional_terminals_url, production_domain, production_deployment_id,
		  created_at, updated_at)
		  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`
	_, err := r.db.Exec(ctx, q, p.ID, p.UserID, p.Name, p.Description, p.GitURL, p.IsPublic,
		p.SourceRepoID, p.VmID, p.PreviewURL, p.DevCommandTerminalURL,
		p.AdditionalTerminalsURL, p.ProductionDomain, p.ProductionDeploymentID,
		p.CreatedAt, p.UpdatedAt)
	return err
}

func (r *Repository) ListProjects(ctx context.Context, userID uuid.UUID) ([]model.Project, error) {
	q := `SELECT id, user_id, name, description, git_url, is_public,
		  source_repo_id, vm_id, preview_url, dev_command_terminal_url,
		  additional_terminals_url, production_domain, production_deployment_id,
		  created_at, updated_at
		  FROM projects WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := r.db.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var projects []model.Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, *p)
	}
	return projects, rows.Err()
}

func (r *Repository) GetProject(ctx context.Context, id, userID uuid.UUID) (*model.Project, error) {
	q := `SELECT id, user_id, name, description, git_url, is_public,
		  source_repo_id, vm_id, preview_url, dev_command_terminal_url,
		  additional_terminals_url, production_domain, production_deployment_id,
		  created_at, updated_at
		  FROM projects WHERE id = $1 AND user_id = $2`
	row := r.db.QueryRow(ctx, q, id, userID)
	return scanProject(row)
}

func (r *Repository) UpdateProject(ctx context.Context, id, userID uuid.UUID, name, description string) (*model.Project, error) {
	q := `UPDATE projects SET name = $1, description = $2, updated_at = $3 WHERE id = $4 AND user_id = $5
		  RETURNING id, user_id, name, description, git_url, is_public,
		  source_repo_id, vm_id, preview_url, dev_command_terminal_url,
		  additional_terminals_url, production_domain, production_deployment_id,
		  created_at, updated_at`
	row := r.db.QueryRow(ctx, q, name, description, time.Now(), id, userID)
	return scanProject(row)
}

func (r *Repository) DeleteProject(ctx context.Context, id, userID uuid.UUID) error {
	_, err := r.db.Exec(ctx, `DELETE FROM projects WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *Repository) UpdateProjectVM(ctx context.Context, id, userID uuid.UUID, vmID, previewURL, devURL, termURL string) (*model.Project, error) {
	q := `UPDATE projects SET vm_id = $1, preview_url = $2, dev_command_terminal_url = $3,
		  additional_terminals_url = $4, updated_at = $5 WHERE id = $6 AND user_id = $7
		  RETURNING id, user_id, name, description, git_url, is_public,
		  source_repo_id, vm_id, preview_url, dev_command_terminal_url,
		  additional_terminals_url, production_domain, production_deployment_id,
		  created_at, updated_at`
	row := r.db.QueryRow(ctx, q, vmID, previewURL, devURL, termURL, time.Now(), id, userID)
	return scanProject(row)
}

func (r *Repository) UpdateProductionDomain(ctx context.Context, id, userID uuid.UUID, domain string) (*model.Project, error) {
	q := `UPDATE projects SET production_domain = $1, updated_at = $2 WHERE id = $3 AND user_id = $4
		  RETURNING id, user_id, name, description, git_url, is_public,
		  source_repo_id, vm_id, preview_url, dev_command_terminal_url,
		  additional_terminals_url, production_domain, production_deployment_id,
		  created_at, updated_at`
	row := r.db.QueryRow(ctx, q, domain, time.Now(), id, userID)
	return scanProject(row)
}

// ─── Conversation ─────────────────────────────────────────────────────────────

func (r *Repository) CreateConversation(ctx context.Context, c *model.Conversation) error {
	q := `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
		  VALUES ($1,$2,$3,$4,$5)`
	_, err := r.db.Exec(ctx, q, c.ID, c.ProjectID, c.Title, c.CreatedAt, c.UpdatedAt)
	return err
}

func (r *Repository) ListConversations(ctx context.Context, projectID, userID uuid.UUID) ([]model.Conversation, error) {
	q := `SELECT c.id, c.project_id, c.title, c.created_at, c.updated_at
		  FROM conversations c
		  JOIN projects p ON c.project_id = p.id
		  WHERE c.project_id = $1 AND p.user_id = $2
		  ORDER BY c.created_at DESC`
	rows, err := r.db.Query(ctx, q, projectID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var convs []model.Conversation
	for rows.Next() {
		var c model.Conversation
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.Title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		convs = append(convs, c)
	}
	return convs, rows.Err()
}

func (r *Repository) GetConversation(ctx context.Context, id, projectID, userID uuid.UUID) (*model.Conversation, error) {
	q := `SELECT c.id, c.project_id, c.title, c.created_at, c.updated_at
		  FROM conversations c
		  JOIN projects p ON c.project_id = p.id
		  WHERE c.id = $1 AND c.project_id = $2 AND p.user_id = $3`
	row := r.db.QueryRow(ctx, q, id, projectID, userID)
	var c model.Conversation
	err := row.Scan(&c.ID, &c.ProjectID, &c.Title, &c.CreatedAt, &c.UpdatedAt)
	return &c, err
}

func (r *Repository) DeleteConversation(ctx context.Context, id, projectID, userID uuid.UUID) error {
	q := `DELETE FROM conversations c USING projects p
		  WHERE c.id = $1 AND c.project_id = $2 AND c.project_id = p.id AND p.user_id = $3`
	_, err := r.db.Exec(ctx, q, id, projectID, userID)
	return err
}

// ─── Message ──────────────────────────────────────────────────────────────────

func (r *Repository) CreateMessage(ctx context.Context, m *model.Message) error {
	q := `INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_results, created_at)
		  VALUES ($1,$2,$3,$4,$5,$6,$7)`
	_, err := r.db.Exec(ctx, q, m.ID, m.ConversationID, m.Role, m.Content, m.ToolCalls, m.ToolResults, m.CreatedAt)
	return err
}

func (r *Repository) ListMessages(ctx context.Context, conversationID uuid.UUID, limit int) ([]model.Message, error) {
	if limit <= 0 {
		limit = 100
	}
	q := `SELECT id, conversation_id, role, content, tool_calls, tool_results, created_at
		  FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`
	rows, err := r.db.Query(ctx, q, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []model.Message
	for rows.Next() {
		var m model.Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.ToolCalls, &m.ToolResults, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

func scanUser(row pgx.Row) (*model.User, error) {
	var u model.User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Password, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func scanProject(row pgx.Row) (*model.Project, error) {
	var p model.Project
	err := row.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.GitURL, &p.IsPublic,
		&p.SourceRepoID, &p.VmID, &p.PreviewURL, &p.DevCommandTerminalURL,
		&p.AdditionalTerminalsURL, &p.ProductionDomain, &p.ProductionDeploymentID,
		&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ValidateProjectAccess checks that the project belongs to the user.
func (r *Repository) ValidateProjectAccess(ctx context.Context, projectID, userID uuid.UUID) (bool, error) {
	q := `SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND user_id = $2)`
	var exists bool
	err := r.db.QueryRow(ctx, q, projectID, userID).Scan(&exists)
	return exists, err
}

// ErrNotFound is returned when a record is not found.
var ErrNotFound = fmt.Errorf("not found")
