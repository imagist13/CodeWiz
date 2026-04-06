package main

import (
	"adorable-backend/internal/config"
	"adorable-backend/internal/handlers"
	"adorable-backend/internal/models"
	"adorable-backend/internal/repositories"
	"adorable-backend/internal/router"
	"adorable-backend/internal/services"
	"log"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	log.Printf("[env] JWT_SECRET env before load: %q", os.Getenv("JWT_SECRET"))
	if err := godotenv.Load(); err != nil {
		log.Printf("[env] godotenv.Load() skipped (no .env in cwd)")
	}
	if err := godotenv.Load("../.env"); err != nil {
		log.Printf("[env] godotenv.Load(../.env) skipped: %v", err)
	}
	log.Printf("[env] JWT_SECRET after load: %q", os.Getenv("JWT_SECRET"))

	cfg := config.Load()

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).Error; err != nil {
		log.Printf("warn: CREATE EXTENSION pgcrypto: %v", err)
	}

	if err := autoMigrate(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Database schema migrated (AutoMigrate OK)")

	userRepo := repositories.NewUserRepository(db)
	projectRepo := repositories.NewProjectRepository(db)
	convRepo := repositories.NewConversationRepository(db)
	msgRepo := repositories.NewMessageRepository(db)
	fileRepo := repositories.NewFileRepository(db)

	authService := services.NewAuthService(userRepo, cfg)
	userService := services.NewUserService(userRepo)
	projectService := services.NewProjectService(projectRepo)
	convService := services.NewConversationService(convRepo, projectRepo)
	msgService := services.NewMessageService(msgRepo, convRepo)
	fileService := services.NewFileService(fileRepo, "./uploads")

	_ = handlers.NewFileHandler(fileService, "./uploads")

	r := router.SetupRouter(
		cfg,
		authService,
		projectService,
		convService,
		msgService,
		userService,
	)

	log.Printf("Server starting on port %s", cfg.ServerPort)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func autoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.User{},
		&models.Project{},
		&models.Conversation{},
		&models.Message{},
		&models.FileUpload{},
	)
}
