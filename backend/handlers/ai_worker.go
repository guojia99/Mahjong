package handlers

import (
	"log"
	"sync/atomic"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"
	"mahjong-backend/mortal"
)

const aiWorkerInterval = 30 * time.Second

var aiWorkerBusy atomic.Bool

// StartAiAnalysisWorker polls pending online games and runs Mortal analysis.
func StartAiAnalysisWorker() {
	go func() {
		runAiAnalysisBatch()
		ticker := time.NewTicker(aiWorkerInterval)
		defer ticker.Stop()
		for range ticker.C {
			runAiAnalysisBatch()
		}
	}()
	log.Println("AI analysis worker started (interval:", aiWorkerInterval, ", processes all pending per tick)")
}

func runAiAnalysisBatch() {
	if !aiWorkerBusy.CompareAndSwap(false, true) {
		return
	}
	defer aiWorkerBusy.Store(false)

	client := mortalClient()
	if err := client.Health(); err != nil {
		log.Printf("AI analysis batch skipped: mortal unreachable (%s): %v", client.BaseURL, err)
		return
	}
	games := gamesNeedingAiAnalysis()
	if len(games) == 0 {
		return
	}
	log.Printf("AI analysis batch: %d game(s) to process", len(games))

	for i := range games {
		g := &games[i]
		if len(paipuActionsFromGameData(g.PaipuData)) == 0 {
			config.DB.Model(g).Updates(map[string]interface{}{
				"ai_analysis_status": "skipped",
				"ai_analysis_error":  "no actions",
			})
			log.Printf("AI analysis skipped game %s: no paipu actions", g.ID)
			continue
		}
		processGameAiAnalysis(g, client)
	}
}

func gamesNeedingAiAnalysis() []models.Game {
	var pending []models.Game
	config.DB.Where("game_type = ? AND ai_analysis_status IN ?", "online", []string{"", "pending", "failed", "processing"}).
		Order("created_at ASC").
		Find(&pending)

	var done []models.Game
	config.DB.Where("game_type = ? AND ai_analysis_status = ?", "online", "done").
		Order("created_at ASC").
		Find(&done)

	out := make([]models.Game, 0, len(pending)+len(done))
	out = append(out, pending...)
	for i := range done {
		g := done[i]
		if mortal.IsAnalysisDataCurrent(g.AiAnalysisStatus, g.AiAnalysisData) {
			continue
		}
		if len(paipuActionsFromGameData(g.PaipuData)) == 0 {
			continue
		}
		stored := mortal.StoredAnalysisVersion(g.AiAnalysisData)
		log.Printf("AI analysis outdated game %s (stored version %d, want %d)", g.ID, stored, mortal.AnalysisVersion)
		out = append(out, g)
	}
	return out
}

func processGameAiAnalysis(game *models.Game, client *mortal.Client) {
	start := time.Now()
	log.Printf("AI analysis started game %s", game.ID)

	config.DB.Model(game).Updates(map[string]interface{}{
		"ai_analysis_status": "processing",
		"ai_analysis_error":  "",
	})
	result, err := mortal.AnalyzeGame(game.ID, game.PaipuData, client, mortalGradeTiers())
	if err != nil {
		config.DB.Model(game).Updates(map[string]interface{}{
			"ai_analysis_status": "failed",
			"ai_analysis_error":  truncateErr(err.Error(), 480),
		})
		log.Printf("AI analysis failed game %s (%s): %v", game.ID, time.Since(start).Round(time.Second), err)
		// Mortal may have crashed; next health check will skip until `make mortal`.
		return
	}
	field, err := mortal.ToJSONField(result)
	if err != nil {
		config.DB.Model(game).Updates(map[string]interface{}{
			"ai_analysis_status": "failed",
			"ai_analysis_error":  truncateErr(err.Error(), 480),
		})
		log.Printf("AI analysis failed game %s (%s): encode result: %v", game.ID, time.Since(start).Round(time.Second), err)
		return
	}
	now := time.Now()
	config.DB.Model(game).Updates(map[string]interface{}{
		"ai_analysis_data":   field,
		"ai_analyzed_at":     &now,
		"ai_analysis_status": "done",
		"ai_analysis_error":  "",
	})
	log.Printf("AI analysis completed game %s (%s, model=%s, seats=%d)", game.ID, time.Since(start).Round(time.Second), result.ModelTag, len(result.Players))
}

func truncateErr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// RunAiAnalysisForGameID is used by CLI to analyze one game synchronously.
func RunAiAnalysisForGameID(gameID string) error {
	var game models.Game
	if err := config.DB.First(&game, "id = ?", gameID).Error; err != nil {
		return err
	}
	client := mortalClient()
	if err := client.Health(); err != nil {
		return err
	}
	processGameAiAnalysis(&game, client)
	config.DB.First(&game, "id = ?", gameID)
	if game.AiAnalysisStatus == "failed" {
		return errFromString(game.AiAnalysisError)
	}
	return nil
}

func errFromString(s string) error {
	if s == "" {
		s = "analysis failed"
	}
	return &aiAnalysisError{msg: s}
}

type aiAnalysisError struct{ msg string }

func (e *aiAnalysisError) Error() string { return e.msg }
