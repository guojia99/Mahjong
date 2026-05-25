package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/pbkdf2"
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

	if !checkDjangoPassword(req.Password, user.Password) {
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
	b := make([]byte, 20)
	for i := range b {
		b[i] = byte(65 + (i % 26))
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])[:40]
}

func checkDjangoPassword(password, storedHash string) bool {
	if storedHash == "" {
		return false
	}

	if strings.HasPrefix(storedHash, "pbkdf2_sha256$") {
		return checkPBKDF2(password, storedHash)
	}

	if strings.HasPrefix(storedHash, "bcrypt$") || (len(storedHash) == 60 && strings.HasPrefix(storedHash, "$2")) {
		hash := storedHash
		if strings.HasPrefix(hash, "bcrypt$") {
			hash = hash[7:]
		}
		return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
	}

	return bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password)) == nil
}

func checkPBKDF2(password, encoded string) bool {
	parts := strings.SplitN(encoded, "$", 5)
	if len(parts) < 4 {
		return false
	}
	iterations := 0
	fmt.Sscanf(parts[1], "%d", &iterations)
	salt := parts[2]
	storedHash := parts[3]
	derivedKey := pbkdf2SHA256(password, salt, iterations, 32)
	return hex.EncodeToString(derivedKey) == storedHash
}

func pbkdf2SHA256(password, salt string, iterations, keyLen int) []byte {
	return pbkdf2.Key([]byte(password), []byte(salt), iterations, keyLen, sha256.New)
}
