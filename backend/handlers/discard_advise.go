package handlers

import (
	"fmt"
	"net/http"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/mortal"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// DiscardAdvise runs Mortal on a hand/meld/drawn/dora snapshot for 何切 advice.
func DiscardAdvise(c *gin.Context) {
	var req mortal.DiscardAdviseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	backend, ok := config.BestMortalBackend()
	if !ok {
		respondError(c, http.StatusServiceUnavailable, "no mortal backend configured")
		return
	}
	client := mortal.NewClient(backend.URL)
	if err := client.Health(); err != nil {
		respondError(c, http.StatusServiceUnavailable, "mortal server unavailable")
		return
	}

	modelKey := mortal.ModelKey(backend.Name, backend.Version)
	gameID := fmt.Sprintf("discard-advise-%s", uuid.NewString())
	result, err := mortal.AdviseDiscard(client, gameID, req, modelKey, backend.Name)
	if err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	_ = client.ResetGame(gameID)

	respondOK(c, gin.H{
		"model_key":  modelKey,
		"model_name": backend.Name,
		"model_tag":  result.ModelTag,
		"shanten":    result.Shanten,
		"options":    result.Options,
		"analyzed_at": time.Now().Format(time.RFC3339),
	})
}
