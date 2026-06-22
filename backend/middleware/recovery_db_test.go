package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupRecoveryTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.LeagueStagePlayer{}); err != nil {
		t.Fatal(err)
	}
	config.DB = db
}

func TestRecoveryWithDBRollbackReleasesSQLite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupRecoveryTestDB(t)

	r := gin.New()
	r.Use(RecoveryWithDBRollback())
	r.GET("/panic", func(c *gin.Context) {
		tx := config.DB.Begin()
		_ = tx
		panic("test panic mid-tx")
	})
	r.GET("/ok", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/panic", nil))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panic route status=%d want 500", w.Code)
	}

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/ok", nil))
	if w2.Code != http.StatusOK {
		t.Fatalf("after panic, ok route status=%d want 200 body=%s", w2.Code, w2.Body.String())
	}
}
