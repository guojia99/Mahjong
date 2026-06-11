package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mahjong-backend/auth"
	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func TestPlayerResetSystemPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	pid := "player-uuid-1"
	player := models.Player{ID: pid, Nickname: "TestPlayer"}
	if err := config.DB.Create(&player).Error; err != nil {
		t.Fatal(err)
	}
	user := models.User{
		Username: "testplayer",
		Password: "md5$abc",
		Email:    "test@example.com",
		PlayerID: &pid,
		IsActive: true,
	}
	if err := config.DB.Create(&user).Error; err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/players/"+pid+"/reset-system-password/", nil)
	c.Params = gin.Params{{Key: "pk", Value: pid}}
	c.Set("user", &models.User{IsStaff: true})

	PlayerResetSystemPassword(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	sp, _ := resp["system_password"].(string)
	if sp == "" {
		t.Fatal("expected system_password in response")
	}
}

func TestPlayerResetSystemPasswordRequiresEmail(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	pid := "player-no-email"
	config.DB.Create(&models.Player{ID: pid, Nickname: "NoEmail"})
	user := models.User{Username: "noemail", PlayerID: &pid, IsActive: true}
	config.DB.Create(&user)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/players/"+pid+"/reset-system-password/", nil)
	c.Params = gin.Params{{Key: "pk", Value: pid}}
	c.Set("user", &models.User{IsStaff: true})

	PlayerResetSystemPassword(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestFindUserForLoginByNickname(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	pid := "player-uuid-3"
	player := models.Player{ID: pid, Nickname: "雀士A"}
	config.DB.Create(&player)
	user := models.User{Username: "player_a", PlayerID: &pid, Password: auth.HashPassword("secret12"), IsActive: true}
	config.DB.Create(&user)

	found, err := findUserForLogin("雀士A")
	if err != nil || found == nil {
		t.Fatal("expected user found by nickname")
	}
	if found.ID != user.ID {
		t.Fatal("wrong user")
	}
}

func TestPlayerBindAccount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	pid := "player-bind-1"
	config.DB.Create(&models.Player{ID: pid, Nickname: "BindMe"})
	user := models.User{Username: "legacy_admin", Email: "admin@example.com", IsStaff: true, IsActive: true}
	config.DB.Create(&user)

	body, _ := json.Marshal(map[string]interface{}{"user_id": user.ID})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/players/"+pid+"/bind-account/", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "pk", Value: pid}}
	c.Set("user", &models.User{IsStaff: true})

	PlayerBindAccount(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var linked models.User
	config.DB.First(&linked, user.ID)
	if linked.PlayerID == nil || *linked.PlayerID != pid {
		t.Fatal("expected user bound to player")
	}
}

func TestPlayerEnableAccount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)

	pid := "player-uuid-2"
	player := models.Player{ID: pid, Nickname: "Newbie"}
	if err := config.DB.Create(&player).Error; err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(map[string]interface{}{
		"email":    "newbie@example.com",
		"is_admin": false,
	})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/players/"+pid+"/enable-account/", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "pk", Value: pid}}
	c.Set("user", &models.User{IsStaff: true})

	PlayerEnableAccount(c)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}
