package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"

	"mahjong-backend/auth"
	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	var user models.User
	if err := config.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		respondError(c, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	if !user.IsActive {
		respondError(c, http.StatusUnauthorized, "User not active")
		return
	}

	if !auth.CheckPassword(req.Password, user.Password) {
		respondError(c, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	if !user.IsStaff {
		respondError(c, http.StatusForbidden, "Admin only")
		return
	}

	tokenStr := generateToken()
	config.DB.Where("user_id = ?", user.ID).Delete(&middleware.AuthToken{})
	token := middleware.AuthToken{Key: tokenStr, UserID: user.ID}
	config.DB.Create(&token)

	respondOK(c, gin.H{
		"token": token.Key,
		"user": gin.H{
			"id":         user.ID,
			"username":   user.Username,
			"created_at": formatTime(user.CreatedAt),
			"is_admin":   user.IsStaff,
		},
	})
}

func Logout(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Not authenticated")
		return
	}
	config.DB.Where("user_id = ?", user.ID).Delete(&middleware.AuthToken{})
	respondOK(c, gin.H{"message": "Logged out"})
}

func Me(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Not authenticated")
		return
	}
	respondOK(c, gin.H{
		"id":         user.ID,
		"username":   user.Username,
		"created_at": formatTime(user.CreatedAt),
		"is_admin":   user.IsStaff,
	})
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])[:40]
}

