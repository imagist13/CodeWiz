package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"github.com/codewize/backend/internal/handler"
	"github.com/codewize/backend/internal/middleware"
	"github.com/codewize/backend/internal/service"
	"github.com/codewize/backend/internal/service/tool"
	"github.com/codewize/backend/internal/store"
	"github.com/codewize/backend/pkg/llm"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ─── Database ──────────────────────────────────────────────────────────────
	db, err := store.Connect(ctx)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Connected to database")

	repo := store.NewRepository(db)

	// ─── Services ──────────────────────────────────────────────────────────────
	authSvc := service.NewAuthService(repo)

	// ─── Tool Executor ─────────────────────────────────────────────────────────
	toolExec := tool.NewExecutor()
	log.Printf("Registered %d tools", len(toolExec.ListTools()))

	// ─── LLM Client ────────────────────────────────────────────────────────────
	llmClient := llm.New()

	// ─── WebSocket Hub ─────────────────────────────────────────────────────────
	hub := handler.NewHub()
	go hub.Run()
	log.Println("WebSocket hub started")

	// ─── Handlers ──────────────────────────────────────────────────────────────
	authHandler := handler.NewAuthHandler(authSvc)
	projectHandler := handler.NewProjectHandler(repo)
	convHandler := handler.NewConversationHandler(repo)
	msgHandler := handler.NewMessageHandler(repo)
	chatHandler := handler.NewChatHandler(llmClient, repo, hub, toolExec)
	wsHandler := handler.NewWSHandler(hub)

	// ─── Echo ─────────────────────────────────────────────────────────────────
	e := echo.New()
	e.HideBanner = true

	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	e.Use(echomw.CORS())

	// Health check
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	// ─── Routes ────────────────────────────────────────────────────────────────
	// Public auth routes
	e.POST("/auth/register", authHandler.Register)
	e.POST("/auth/login", authHandler.Login)
	e.POST("/auth/logout", authHandler.Logout)

	// Protected routes
	authGroup := e.Group("")
	authGroup.Use(middleware.JWTAuth(authSvc))

	authGroup.GET("/auth/me", authHandler.Me)

	// Projects
	authGroup.GET("/api/projects", projectHandler.List)
	authGroup.GET("/api/projects/:id", projectHandler.Get)
	authGroup.POST("/api/projects", projectHandler.Create)
	authGroup.PUT("/api/projects/:id", projectHandler.Update)
	authGroup.DELETE("/api/projects/:id", projectHandler.Delete)
	authGroup.PUT("/api/projects/:id/vm", projectHandler.UpdateVM)
	authGroup.PUT("/api/projects/:id/production-domain", projectHandler.UpdateProductionDomain)

	// Conversations
	authGroup.GET("/api/repos/:id/conversations", convHandler.List)
	authGroup.POST("/api/repos/:id/conversations", convHandler.Create)
	authGroup.GET("/api/repos/:id/conversations/:cid", convHandler.Get)
	authGroup.DELETE("/api/repos/:id/conversations/:cid", convHandler.Delete)

	// Messages
	authGroup.GET("/api/repos/:id/conversations/:cid/messages", msgHandler.List)

	// Chat streaming
	authGroup.POST("/api/chat", chatHandler.Stream)

	// WebSocket
	authGroup.GET("/api/ws", wsHandler.Handle)

	// ─── Start ────────────────────────────────────────────────────────────────
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	go func() {
		log.Printf("Starting server on :%s", port)
		if err := e.Start(":" + port); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}
	log.Println("Server stopped")
}
