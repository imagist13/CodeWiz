package router

import (
	"adorable-backend/internal/config"
	"adorable-backend/internal/handlers"
	"adorable-backend/internal/middleware"
	"adorable-backend/internal/services"

	"github.com/gin-gonic/gin"
)

func SetupRouter(
	cfg *config.Config,
	authService *services.AuthService,
	projectService *services.ProjectService,
	convService *services.ConversationService,
	msgService *services.MessageService,
	userService *services.UserService,
) *gin.Engine {
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	authHandler := handlers.NewAuthHandler(authService)
	userHandler := handlers.NewUserHandler(userService)
	projectHandler := handlers.NewProjectHandler(projectService)
	convHandler := handlers.NewConversationHandler(convService)
	msgHandler := handlers.NewMessageHandler(msgService)

	auth := r.Group("/auth")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/logout", authHandler.Logout)
		auth.GET("/me", middleware.AuthMiddleware(authService), authHandler.Me)
	}

	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware(authService))
	{
		api.GET("/user", userHandler.GetProfile)
		api.PUT("/user", userHandler.UpdateProfile)

		api.GET("/projects", projectHandler.List)
		api.POST("/projects", projectHandler.Create)
		api.GET("/projects/:id", projectHandler.Get)
		api.PUT("/projects/:id", projectHandler.Update)
		api.DELETE("/projects/:id", projectHandler.Delete)

		api.GET("/repos/:repoId/conversations", convHandler.List)
		api.POST("/repos/:repoId/conversations", convHandler.Create)
		api.GET("/repos/:repoId/conversations/:conversationId", convHandler.Get)
		api.DELETE("/repos/:repoId/conversations/:conversationId", convHandler.Delete)

		api.GET("/conversations/:id/messages", msgHandler.List)
	}

	return r
}
