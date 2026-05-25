package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func I18nLanguages(c *gin.Context) {
	languages := []gin.H{
		{"code": "zh-hans", "name": "简体中文"},
		{"code": "zh-hant", "name": "繁體中文"},
		{"code": "en", "name": "English"},
		{"code": "ja", "name": "日本語"},
	}
	c.JSON(http.StatusOK, gin.H{"languages": languages})
}
