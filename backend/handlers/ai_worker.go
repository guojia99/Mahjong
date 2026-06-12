package handlers

import (
	"log"
	"sync/atomic"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"
	"mahjong-backend/mortal"
)

const aiWorkerInterval = 30 * time.Minute

var aiWorkerBusy atomic.Bool

// StartAiAnalysisWorker polls pending online games and runs Mortal analysis for each configured backend.
func StartAiAnalysisWorker() {
	go func() {
		//runAiAnalysisBatch()
		ticker := time.NewTicker(aiWorkerInterval)
		defer ticker.Stop()
		for range ticker.C {
			runAiAnalysisBatch()
		}
	}()
	log.Println("AI analysis worker started (interval:", aiWorkerInterval, ", multi-model)")
}

func runAiAnalysisBatch() {
	if !aiWorkerBusy.CompareAndSwap(false, true) {
		return
	}
	defer aiWorkerBusy.Store(false)

	backends := config.MortalBackends()
	if len(backends) == 0 {
		return
	}
	games := gamesNeedingAiAnalysis()
	if len(games) == 0 {
		return
	}
	log.Printf("AI analysis batch: %d game(s), %d mortal backend(s)", len(games), len(backends))

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
		processGameAiAnalysisMulti(g)
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
		store, err := mortal.ParseAnalysisStore(g.AiAnalysisData)
		if err != nil {
			if len(paipuActionsFromGameData(g.PaipuData)) > 0 {
				out = append(out, g)
			}
			continue
		}
		if mortal.IsStoreCurrent(store) {
			continue
		}
		if len(paipuActionsFromGameData(g.PaipuData)) == 0 {
			continue
		}
		log.Printf("AI analysis outdated game %s (need version %d for all backends)", g.ID, mortal.AnalysisVersion)
		out = append(out, g)
	}
	return out
}

func processGameAiAnalysisMulti(game *models.Game) {
	start := time.Now()
	log.Printf("AI analysis started game %s", game.ID)

	store, err := mortal.ParseAnalysisStore(game.AiAnalysisData)
	if err != nil {
		store = &mortal.AnalysisStore{Version: mortal.AnalysisStoreVersion, Models: map[string]*mortal.ModelEntry{}}
	}

	config.DB.Model(game).Updates(map[string]interface{}{
		"ai_analysis_status": "processing",
		"ai_analysis_error":  "",
	})

	backends := config.MortalBackends()
	anySuccess := false
	var lastErr string

	persist := func() {
		persistAnalysisStore(game, store)
	}

	for _, b := range backends {
		key := mortal.ModelKey(b.Name, b.Version)
		if mortal.IsModelCurrent(store.Models[key]) {
			continue
		}
		client := mortal.NewClient(b.URL)
		if err := client.Health(); err != nil {
			log.Printf("AI analysis skip backend %s (%s): %v", key, b.URL, err)
			mortal.MarkModelFailed(store, key, b.Name, b.Version, b.URL, truncateErr(err.Error(), 480))
			lastErr = err.Error()
			persist()
			continue
		}
		mortal.MarkModelProcessing(store, key, b.Name, b.Version, b.URL)
		persist()

		result, err := mortal.AnalyzeGame(game.ID, game.PaipuData, client, mortalGradeTiers(), b.Name, b.Version)
		if err != nil {
			mortal.MarkModelFailed(store, key, b.Name, b.Version, b.URL, truncateErr(err.Error(), 480))
			lastErr = err.Error()
			log.Printf("AI analysis failed game %s backend %s: %v", game.ID, key, err)
			persist()
			continue
		}
		mortal.MarkModelDone(store, key, b.Name, b.Version, b.URL, result)
		anySuccess = true
		log.Printf("AI analysis completed game %s backend %s model=%s", game.ID, key, result.ModelTag)
		persist()
	}

	status := persistAnalysisStore(game, store)
	if status == "" && !anySuccess && lastErr != "" {
		config.DB.Model(game).Update("ai_analysis_error", truncateErr(lastErr, 480))
	}
	log.Printf("AI analysis game %s finished status=%s (%s)", game.ID, status, time.Since(start).Round(time.Second))
}

// persistAnalysisStore writes ai_analysis_data and derived status after each model slot update.
func persistAnalysisStore(game *models.Game, store *mortal.AnalysisStore) string {
	field, err := mortal.StoreToJSONField(store)
	if err != nil {
		log.Printf("AI analysis save failed game %s: %v", game.ID, err)
		config.DB.Model(game).Updates(map[string]interface{}{
			"ai_analysis_status": "failed",
			"ai_analysis_error":  truncateErr(err.Error(), 480),
		})
		return "failed"
	}
	status := mortal.AggregateStatus(store)
	updates := map[string]interface{}{
		"ai_analysis_data":   field,
		"ai_analysis_status": status,
	}
	if status == "done" {
		now := time.Now()
		updates["ai_analyzed_at"] = &now
		updates["ai_analysis_error"] = ""
	}
	config.DB.Model(game).Updates(updates)
	return status
}

func truncateErr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// RunAiAnalysisForGameID is used by CLI to analyze one game synchronously (all backends).
func RunAiAnalysisForGameID(gameID string) error {
	var game models.Game
	if err := config.DB.First(&game, "id = ?", gameID).Error; err != nil {
		return err
	}
	processGameAiAnalysisMulti(&game)
	config.DB.First(&game, "id = ?", gameID)
	if game.AiAnalysisStatus == "failed" {
		return errFromString(game.AiAnalysisError)
	}
	if game.AiAnalysisStatus != "done" {
		return errFromString("analysis incomplete: " + game.AiAnalysisStatus)
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
