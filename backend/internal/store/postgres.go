package store

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		host := getEnv("POSTGRES_HOST", "localhost")
		port := getEnv("POSTGRES_PORT", "5432")
		user := getEnv("POSTGRES_USER", "codewize")
		pass := getEnv("POSTGRES_PASSWORD", "codewize")
		dbname := getEnv("POSTGRES_DB", "codewize")
		dsn = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
			user, pass, host, port, dbname)
	}

	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse database config: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	if err := initSchema(ctx, pool); err != nil {
		return nil, fmt.Errorf("init schema: %w", err)
	}

	return pool, nil
}

func initSchema(ctx context.Context, pool *pgxpool.Pool) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id UUID PRIMARY KEY,
		email VARCHAR(255) UNIQUE NOT NULL,
		name VARCHAR(255) NOT NULL DEFAULT '',
		password VARCHAR(255) NOT NULL,
		avatar_url VARCHAR(512) NOT NULL DEFAULT '',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS projects (
		id UUID PRIMARY KEY,
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		git_url VARCHAR(512) NOT NULL DEFAULT '',
		is_public BOOLEAN NOT NULL DEFAULT FALSE,
		source_repo_id VARCHAR(255) DEFAULT NULL,
		vm_id VARCHAR(255) DEFAULT NULL,
		preview_url VARCHAR(512) DEFAULT NULL,
		dev_command_terminal_url VARCHAR(512) DEFAULT NULL,
		additional_terminals_url VARCHAR(512) DEFAULT NULL,
		production_domain VARCHAR(255) DEFAULT NULL,
		production_deployment_id VARCHAR(255) DEFAULT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS conversations (
		id UUID PRIMARY KEY,
		project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		title VARCHAR(512) NOT NULL DEFAULT '',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS messages (
		id UUID PRIMARY KEY,
		conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
		role VARCHAR(32) NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		tool_calls TEXT DEFAULT NULL,
		tool_results TEXT DEFAULT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
	CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
	CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
	CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
	`
	_, err := pool.Exec(ctx, schema)
	return err
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
