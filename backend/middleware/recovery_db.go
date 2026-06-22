package middleware

import (
	"log"
	"net/http"

	"mahjong-backend/config"

	"github.com/gin-gonic/gin"
)

// rollbackSQLite releases a SQLite write lock left open when a handler panics mid-GORM
// operation. With MaxOpenConns=1 a stuck transaction blocks every subsequent request.
func rollbackSQLite() {
	if config.DB == nil {
		return
	}
	_ = config.DB.Rollback()
	sqlDB, err := config.DB.DB()
	if err != nil {
		return
	}
	if _, err := sqlDB.Exec("ROLLBACK"); err != nil {
		log.Printf("[recovery] sqlite rollback: %v", err)
	}
}

// RecoveryWithDBRollback is like gin.Recovery but rolls back SQLite before responding.
func RecoveryWithDBRollback() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(gin.DefaultErrorWriter, func(c *gin.Context, recovered any) {
		rollbackSQLite()
		log.Printf("[Recovery] %v", recovered)
		c.AbortWithStatus(http.StatusInternalServerError)
	})
}
