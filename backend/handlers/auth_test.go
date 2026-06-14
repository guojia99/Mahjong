package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"mahjong-backend/auth"
	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAuthTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Player{}, &models.VerificationCode{}, &models.LoginLog{}, &middleware.AuthToken{}); err != nil {
		t.Fatal(err)
	}
	config.DB = db
	return db
}

func TestLoginWithSystemPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	pid := "auth-test-player"
	config.DB.Create(&models.Player{ID: pid, Nickname: "testuser"})
	user := models.User{
		Username:       "testuser",
		Password:       "",
		SystemPassword: "sys-uuid-1234",
		Email:          "testuser@example.com",
		PlayerID:       &pid,
		IsActive:       true,
	}
	if err := config.DB.Create(&user).Error; err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(map[string]string{
		"username":        "testuser",
		"system_password": "sys-uuid-1234",
	})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/auth/login/", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	Login(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["requires_password_reset"] != true {
		t.Fatalf("expected requires_password_reset true, got %v", resp["requires_password_reset"])
	}
}

func TestChangePassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	user := models.User{
		Username: "changepw",
		Password: auth.HashPassword("oldpass1"),
		IsActive: true,
	}
	if err := config.DB.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	token := middleware.AuthToken{Key: "change-pw-token", UserID: user.ID}
	if err := config.DB.Create(&token).Error; err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(map[string]string{
		"old_password": "oldpass1",
		"new_password": "newpass2",
	})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/auth/change-password/", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.Header.Set("Authorization", "Token change-pw-token")

	ChangePassword(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updated models.User
	if err := config.DB.First(&updated, user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !auth.CheckPassword("newpass2", updated.Password) {
		t.Fatal("expected password updated")
	}
}

func TestRefreshToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	user := models.User{
		Username: "refreshuser",
		Password: auth.HashPassword("secret12"),
		IsActive: true,
	}
	if err := config.DB.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	oldToken := "refresh-old-token-12345678901234567890"
	if err := config.DB.Create(&middleware.AuthToken{Key: oldToken, UserID: user.ID}).Error; err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/auth/refresh/", nil)
	c.Request.Header.Set("Authorization", "Token "+oldToken)

	RefreshToken(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	newToken, ok := resp["token"].(string)
	if !ok || newToken == "" || newToken == oldToken {
		t.Fatalf("expected new token, got %v", resp["token"])
	}

	var stored middleware.AuthToken
	if err := config.DB.Where("user_id = ?", user.ID).First(&stored).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Key != newToken {
		t.Fatalf("expected stored token %q, got %q", newToken, stored.Key)
	}

	var oldCount int64
	config.DB.Model(&middleware.AuthToken{}).Where("key = ?", oldToken).Count(&oldCount)
	if oldCount != 0 {
		t.Fatal("old token should no longer exist")
	}
}

func TestLoginLockedUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	locked := time.Now().Add(15 * time.Minute)
	user := models.User{
		Username: "locked",
		Password: auth.HashPassword("secret12"),
		IsActive: true,
		LockedUntil: &locked,
	}
	if err := config.DB.Create(&user).Error; err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(map[string]string{
		"username": "locked",
		"password": "secret12",
	})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/auth/login/", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")

	Login(c)
	if w.Code != http.StatusLocked {
		t.Fatalf("expected 423, got %d", w.Code)
	}
}
