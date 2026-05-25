package middleware

import (
	"net/http"
	"strings"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

type AuthToken struct {
	Key     string      `gorm:"primaryKey;size:40" json:"key"`
	UserID  uint64      `gorm:"column:user_id;uniqueIndex;not null" json:"-"`
	User    *models.User `gorm:"foreignKey:UserID" json:"-"`
	Created string      `gorm:"column:created" json:"-"`
}

func (AuthToken) TableName() string { return "authtoken_token" }

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := extractToken(c)
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}
		var authToken AuthToken
		if err := config.DB.Preload("User").Where("key = ?", tokenStr).First(&authToken).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}
		if authToken.User == nil || !authToken.User.IsActive {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not active"})
			c.Abort()
			return
		}
		c.Set("user", authToken.User)
		c.Set("userID", authToken.User.ID)
		c.Next()
	}
}

func AdminOrReadOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}
		user, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}
		u, ok := user.(*models.User)
		if !ok || !u.IsStaff {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func extractToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Token ") {
		return strings.TrimPrefix(auth, "Token ")
	}
	auth = c.GetHeader("X-Token")
	if auth != "" {
		return auth
	}
	return ""
}

func GetUser(c *gin.Context) *models.User {
	if u, exists := c.Get("user"); exists {
		if user, ok := u.(*models.User); ok {
			return user
		}
	}
	return nil
}
