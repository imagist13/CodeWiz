package config

import (
	"os"
)

type Config struct {
	ServerPort  string
	DatabaseURL string
	JWTSecret   string
}

func Load() *Config {
	return &Config{
		ServerPort:           getEnv("SERVER_PORT", "8080"),
		DatabaseURL:          getEnv("DATABASE_URL", "host=localhost user=postgres password=postgres dbname=adorable port=5432 sslmode=disable"),
		JWTSecret:            getEnv("JWT_SECRET", "adorable-dev-secret-change-in-prod"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
