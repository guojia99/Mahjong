package handlers

import (
	"net/http"
	"strings"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func LoginLogList(c *gin.Context) {
	page := parseQueryInt(c, "page", 1)
	pageSize := parseQueryInt(c, "page_size", 50)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	q := config.DB.Model(&models.LoginLog{}).Order("id DESC")
	if uid := c.Query("user_id"); uid != "" {
		q = q.Where("user_id = ?", uid)
	}
	if pid := c.Query("player_id"); pid != "" {
		q = q.Where("player_id = ?", pid)
	}
	if username := strings.TrimSpace(c.Query("username")); username != "" {
		q = q.Where("username LIKE ?", "%"+username+"%")
	}

	var total int64
	q.Count(&total)

	var logs []models.LoginLog
	if err := q.Offset(offset).Limit(pageSize).Find(&logs).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to list login logs")
		return
	}

	items := make([]gin.H, 0, len(logs))
	for _, log := range logs {
		item := gin.H{
			"id":         log.ID,
			"username":   log.Username,
			"ip":         log.IP,
			"action":     log.Action,
			"detail":     log.Detail,
			"created_at": formatTime(log.CreatedAt),
		}
		if log.UserID != nil {
			item["user_id"] = *log.UserID
		}
		if log.PlayerID != nil {
			item["player_id"] = *log.PlayerID
		}
		items = append(items, item)
	}

	respondOK(c, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}
