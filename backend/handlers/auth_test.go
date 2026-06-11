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
