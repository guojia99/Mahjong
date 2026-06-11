package handlers

import (
	"strings"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func clientIP(c *gin.Context) string {
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := c.GetHeader("X-Real-IP"); xri != "" {
		return xri
	}
	return c.ClientIP()
}

func writeLoginLog(userID *uint64, playerID *string, username, ip, action, detail string) {
	config.DB.Create(&models.LoginLog{
		UserID:   userID,
		PlayerID: playerID,
		Username: username,
		IP:       ip,
		Action:   action,
		Detail:   detail,
	})
}

func maskEmail(email string) string {
	if email == "" {
		return ""
	}
	at := strings.LastIndex(email, "@")
	if at <= 1 {
		return email
	}
	return email[:1] + "***" + email[at:]
}

func userRequiresPasswordReset(user *models.User) bool {
	return user.SystemPassword != "" && !user.HasPassword()
}

func userToJSON(user *models.User, mask bool) gin.H {
	email := user.Email
	if mask {
		email = maskEmail(email)
	}
	return gin.H{
		"id":                   user.ID,
		"username":             user.Username,
		"player_id":            user.PlayerID,
		"email":                email,
		"created_at":           formatTime(user.CreatedAt),
		"is_admin":             user.IsStaff,
		"is_active":            user.IsActive,
		"login_fail_count":     user.LoginFailCount,
		"last_login_ip":        user.LastLoginIP,
		"last_login_attempt_at": formatTimePointer(user.LastLoginAttemptAt),
		"locked_until":         formatTimePointer(user.LockedUntil),
		"requires_password_reset": userRequiresPasswordReset(user),
	}
}

func generateSystemPassword() string {
	return uuid.New().String()
}

func saveUserLoginState(user *models.User) {
	config.DB.Model(user).Updates(map[string]interface{}{
		"login_fail_count":      user.LoginFailCount,
		"last_login_attempt_at": user.LastLoginAttemptAt,
		"last_login_ip":         user.LastLoginIP,
		"locked_until":          user.LockedUntil,
	})
}

func normalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}

func emailsMatch(a, b string) bool {
	return normalizeEmail(a) == normalizeEmail(b)
}

func nowUTC() time.Time {
	return time.Now()
}
