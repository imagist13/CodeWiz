package middleware

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/codewize/backend/internal/service"
)

const UserIDKey = "user_id"

func JWTAuth(authService *service.AuthService) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing authorization header")
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid authorization header format")
			}

			token := parts[1]
			claims, err := authService.ValidateToken(token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired token")
			}

			userID, err := uuid.Parse(claims.UserID)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid user id in token")
			}

			c.Set(UserIDKey, userID)
			return next(c)
		}
	}
}

func GetUserID(c echo.Context) uuid.UUID {
	id, _ := c.Get(UserIDKey).(uuid.UUID)
	return id
}
