package handlers

import (
	"math"
	"net/http"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// --- UmaConfig CRUD ---

func UmaConfigList(c *gin.Context) {
	var configs []models.UmaConfig
	config.DB.Order("player_count, game_mode").Find(&configs)
	result := make([]gin.H, 0, len(configs))
	for _, cfg := range configs {
		result = append(result, serializeUmaConfig(&cfg))
	}
	respondOK(c, result)
}

func UmaConfigCreate(c *gin.Context) {
	var req struct {
		Name        string  `json:"name"`
		PlayerCount int     `json:"player_count"`
		GameMode    string  `json:"game_mode"`
		Uma1st      float64 `json:"uma_1st"`
		Uma2nd      float64 `json:"uma_2nd"`
		Uma3rd      float64 `json:"uma_3rd"`
		Uma4th      float64 `json:"uma_4th"`
		BaseScore   float64 `json:"base_score"`
		IsActive    bool    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	cfg := models.UmaConfig{
		ID:          newUUID(),
		Name:        req.Name,
		PlayerCount: req.PlayerCount,
		GameMode:    req.GameMode,
		Uma1st:      req.Uma1st,
		Uma2nd:      req.Uma2nd,
		Uma3rd:      req.Uma3rd,
		Uma4th:      req.Uma4th,
		BaseScore:   req.BaseScore,
		IsActive:    req.IsActive,
	}
	config.DB.Create(&cfg)
	respondCreated(c, serializeUmaConfig(&cfg))
}

func UmaConfigDetail(c *gin.Context) {
	pk := c.Param("pk")
	var cfg models.UmaConfig
	if err := config.DB.Where("id = ?", pk).First(&cfg).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	respondOK(c, serializeUmaConfig(&cfg))
}

func UmaConfigUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var cfg models.UmaConfig
	if err := config.DB.Where("id = ?", pk).First(&cfg).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req struct {
		Name        *string  `json:"name"`
		PlayerCount *int     `json:"player_count"`
		GameMode    *string  `json:"game_mode"`
		Uma1st      *float64 `json:"uma_1st"`
		Uma2nd      *float64 `json:"uma_2nd"`
		Uma3rd      *float64 `json:"uma_3rd"`
		Uma4th      *float64 `json:"uma_4th"`
		BaseScore   *float64 `json:"base_score"`
		IsActive    *bool    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.PlayerCount != nil {
		updates["player_count"] = *req.PlayerCount
	}
	if req.GameMode != nil {
		updates["game_mode"] = *req.GameMode
	}
	if req.Uma1st != nil {
		updates["uma_1st"] = *req.Uma1st
	}
	if req.Uma2nd != nil {
		updates["uma_2nd"] = *req.Uma2nd
	}
	if req.Uma3rd != nil {
		updates["uma_3rd"] = *req.Uma3rd
	}
	if req.Uma4th != nil {
		updates["uma_4th"] = *req.Uma4th
	}
	if req.BaseScore != nil {
		updates["base_score"] = *req.BaseScore
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if len(updates) > 0 {
		config.DB.Model(&cfg).Updates(updates)
	}
	config.DB.First(&cfg, "id = ?", pk)
	respondOK(c, serializeUmaConfig(&cfg))
}

func UmaConfigDelete(c *gin.Context) {
	pk := c.Param("pk")
	config.DB.Where("id = ?", pk).Delete(&models.UmaConfig{})
	respondNoContent(c)
}

func serializeUmaConfig(cfg *models.UmaConfig) gin.H {
	return gin.H{
		"id":           cfg.ID,
		"name":         cfg.Name,
		"player_count": cfg.PlayerCount,
		"game_mode":    cfg.GameMode,
		"uma_1st":      cfg.Uma1st,
		"uma_2nd":      cfg.Uma2nd,
		"uma_3rd":      cfg.Uma3rd,
		"uma_4th":      cfg.Uma4th,
		"base_score":   cfg.BaseScore,
		"is_active":    cfg.IsActive,
		"created_at":   formatTime(cfg.CreatedAt),
		"updated_at":   formatTime(cfg.UpdatedAt),
	}
}

// --- RankTier CRUD ---

func TierList(c *gin.Context) {
	var tiers []models.RankTier
	config.DB.Order("level_order").Find(&tiers)
	result := make([]gin.H, 0, len(tiers))
	for _, t := range tiers {
		result = append(result, serializeTier(&t))
	}
	respondOK(c, result)
}

func TierCreate(c *gin.Context) {
	var req struct {
		Name           string  `json:"name"`
		LevelOrder     int     `json:"level_order"`
		InitialScore   float64 `json:"initial_score"`
		PromotionScore float64 `json:"promotion_score"`
		DajiangScore   float64 `json:"dajiang_score"`
		FourthPenalty  float64 `json:"fourth_penalty"`
		IsProtected    bool    `json:"is_protected"`
		BgColor        string  `json:"bg_color"`
		BgGradient     string  `json:"bg_gradient"`
		Description    string  `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	tier := models.RankTier{
		ID:             newUUID(),
		Name:           req.Name,
		LevelOrder:     req.LevelOrder,
		InitialScore:   req.InitialScore,
		PromotionScore: req.PromotionScore,
		DajiangScore:   req.DajiangScore,
		FourthPenalty:  req.FourthPenalty,
		IsProtected:    req.IsProtected,
		BgColor:        req.BgColor,
		BgGradient:     req.BgGradient,
		Description:    req.Description,
	}
	config.DB.Create(&tier)
	respondCreated(c, serializeTier(&tier))
}

func TierDetail(c *gin.Context) {
	pk := c.Param("pk")
	var tier models.RankTier
	if err := config.DB.Where("id = ?", pk).First(&tier).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	respondOK(c, serializeTier(&tier))
}

func TierUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var tier models.RankTier
	if err := config.DB.Where("id = ?", pk).First(&tier).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if len(req) > 0 {
		config.DB.Model(&tier).Updates(req)
	}
	config.DB.First(&tier, "id = ?", pk)
	respondOK(c, serializeTier(&tier))
}

func TierDelete(c *gin.Context) {
	pk := c.Param("pk")
	config.DB.Where("id = ?", pk).Delete(&models.RankTier{})
	respondNoContent(c)
}

func serializeTier(t *models.RankTier) gin.H {
	return gin.H{
		"id":              t.ID,
		"name":            t.Name,
		"level_order":     t.LevelOrder,
		"initial_score":   t.InitialScore,
		"promotion_score": t.PromotionScore,
		"dajiang_score":   t.DajiangScore,
		"fourth_penalty":  t.FourthPenalty,
		"is_protected":    t.IsProtected,
		"bg_color":        t.BgColor,
		"bg_gradient":     t.BgGradient,
		"description":     t.Description,
		"created_at":      formatTime(t.CreatedAt),
		"updated_at":      formatTime(t.UpdatedAt),
	}
}

// --- Recalculate ---

func RankingRecalculate(c *gin.Context) {
	config.DB.Where("1=1").Delete(&models.GameRankingResult{})

	var tiers []models.RankTier
	config.DB.Order("level_order").Find(&tiers)
	if len(tiers) == 0 {
		respondOK(c, gin.H{"message": "No tiers configured"})
		return
	}

	config.DB.Model(&models.PlayerRankingScore{}).Where("1=1").Update("game_count", 0)

	var games []models.Game
	config.DB.Where("player_count = 4 AND game_mode = ?", "half_match").Find(&games)

	for _, game := range games {
		settleGameRankingInternal(&game, tiers)
	}

	var scores []models.PlayerRankingScore
	config.DB.Preload("Tier").Order("score DESC").Find(&scores)
	respondOK(c, gin.H{
		"message":           "Recalculation complete",
		"players_processed": len(scores),
	})
}

func SettleGameRanking(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	if err := config.DB.Where("id = ?", pk).First(&game).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}

	var tiers []models.RankTier
	config.DB.Order("level_order").Find(&tiers)
	if len(tiers) == 0 {
		respondError(c, http.StatusBadRequest, "No tiers configured")
		return
	}

	settleGameRankingInternal(&game, tiers)
	respondOK(c, gin.H{"message": "Settled"})
}

func settleGameRankingInternal(game *models.Game, tiers []models.RankTier) {
	if game.PlayerCount != 4 || game.GameMode != "half_match" {
		return
	}

	var gps []models.GamePlayer
	config.DB.Where("game_id = ? AND score IS NOT NULL", game.ID).Order("score DESC").Find(&gps)
	if len(gps) == 0 {
		return
	}

	umaCfg := getActiveUmaConfig(game.PlayerCount, game.GameMode)
	umaList := umaCfg.GetUmaList()
	baseScore := umaCfg.BaseScore

	config.DB.Where("game_id = ?", game.ID).Delete(&models.GameRankingResult{})

	for i, gp := range gps {
		if i >= len(umaList) {
			break
		}

		var prs models.PlayerRankingScore
		currentTier := &tiers[0]
		currentScore := tiers[0].InitialScore

		if err := config.DB.Preload("Tier").Where("player_id = ?", gp.PlayerID).First(&prs).Error; err == nil && prs.Tier != nil {
			currentTier = prs.Tier
			currentScore = prs.Score
		}

		uma := umaList[i]
		basicPT := (float64(*gp.Score) - baseScore) / 10.0
		dajiang := 0.0
		fourthPenalty := 0.0
		extraDajiang := 0.0
		if i == 0 {
			dajiang = currentTier.DajiangScore
		}
		if i == len(gps)-1 && len(gps) == 4 {
			fourthPenalty = currentTier.FourthPenalty
		}
		if i == 0 && *gp.Score >= 450 {
			extraDajiang = currentTier.DajiangScore
		}

		delta := math.Round((basicPT+uma+float64(dajiang)-float64(fourthPenalty)+float64(extraDajiang))*100) / 100
		newScore := currentScore + delta

		finalTier, finalScore := resolveTier(newScore, currentTier, tiers)

		result := models.GameRankingResult{
			ID:          newUUID(),
			GameID:      game.ID,
			PlayerID:    gp.PlayerID,
			Rank:        i + 1,
			Delta:       delta,
			OldTierName: currentTier.Name,
			NewTierName: finalTier.Name,
			OldScore:    currentScore,
			NewScore:    finalScore,
		}
		config.DB.Create(&result)

		updates := map[string]interface{}{
			"score":      finalScore,
			"game_count": gorm.Expr("game_count + 1"),
		}
		if finalTier != nil {
			updates["tier_id"] = finalTier.ID
		}
		config.DB.Model(&models.PlayerRankingScore{}).Where("player_id = ?", gp.PlayerID).Updates(updates)
	}
}

func resolveTier(newScore float64, currentTier *models.RankTier, tiers []models.RankTier) (*models.RankTier, float64) {
	if newScore < 0 {
		newScore = 0
	}

	var huntianTier *models.RankTier
	var tierBeforeHuntian *models.RankTier
	for i := range tiers {
		if tiers[i].LevelOrder >= 15 && huntianTier == nil {
			huntianTier = &tiers[i]
		}
		if tiers[i].LevelOrder == 14 {
			tierBeforeHuntian = &tiers[i]
		}
	}

	if huntianTier != nil && tierBeforeHuntian != nil {
		if huntianTier.ID == currentTier.ID {
			if newScore < 6000 {
				return tierBeforeHuntian, 5000
			}
			return huntianTier, newScore
		}
		if tierBeforeHuntian.ID == currentTier.ID {
			if newScore >= 7000 {
				return huntianTier, newScore
			}
			return tierBeforeHuntian, newScore
		}
	}

	for idx, tier := range tiers {
		var nextTier *models.RankTier
		if idx+1 < len(tiers) {
			nextTier = &tiers[idx+1]
		}

		if tier.LevelOrder == 14 && nextTier != nil && nextTier.LevelOrder >= 15 {
			threshold := tier.InitialScore + tier.PromotionScore
			if currentTier != nil && currentTier.LevelOrder == tier.LevelOrder {
				if newScore >= threshold {
					if nextTier != nil {
						newScore = nextTier.InitialScore + (newScore - threshold)
					} else {
						newScore = threshold
					}
					return nextTier, newScore
				}
				return currentTier, newScore
			}
			continue
		}

		if tier.ID == currentTier.ID {
			threshold := tier.InitialScore + tier.PromotionScore
			if newScore >= threshold {
				if nextTier != nil {
					newScore = nextTier.InitialScore + (newScore - threshold)
				} else {
					newScore = threshold
				}
				return nextTier, newScore
			}

			if !tier.IsProtected || newScore >= 0 {
				return currentTier, newScore
			}
			return currentTier, tier.InitialScore
		}
	}

	return &tiers[0], newScore
}

func getActiveUmaConfig(playerCount int, gameMode string) models.UmaConfig {
	var cfg models.UmaConfig
	if err := config.DB.Where("player_count = ? AND game_mode = ? AND is_active = ?", playerCount, gameMode, true).First(&cfg).Error; err == nil {
		return cfg
	}
	defaultUma := map[int][]float64{
		4: {30, 10, -10, -30},
		3: {30, 0, -30},
	}
	umaList := defaultUma[4]
	if list, ok := defaultUma[playerCount]; ok {
		umaList = list
	}
	baseScore := 250.0
	if playerCount == 3 {
		baseScore = 350
	}
	return models.UmaConfig{
		Uma1st:    umaList[0],
		Uma2nd:    umaList[1],
		Uma3rd:    umaList[2],
		BaseScore: baseScore,
	}
}

// --- Leaderboard ---

func RankingLeaderboard(c *gin.Context) {
	var scores []models.PlayerRankingScore
	config.DB.Preload("Tier").Order("score DESC").Find(&scores)
	result := make([]gin.H, 0, len(scores))
	for _, s := range scores {
		var player models.Player
		config.DB.Where("id = ?", s.PlayerID).First(&player)
		result = append(result, gin.H{
			"player":     getPlayerListData(&player),
			"score":      s.Score,
			"game_count": s.GameCount,
			"tier":       serializeTier(s.Tier),
		})
	}
	respondOK(c, result)
}

func PlayerRanking(c *gin.Context) {
	pk := c.Param("pk")
	var prs models.PlayerRankingScore
	if err := config.DB.Preload("Tier").Where("player_id = ?", pk).First(&prs).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var player models.Player
	config.DB.Where("id = ?", pk).First(&player)
	respondOK(c, gin.H{
		"player":     getPlayerListData(&player),
		"score":      prs.Score,
		"game_count": prs.GameCount,
		"tier":       serializeTier(prs.Tier),
	})
}

func PlayerGameRankingResults(c *gin.Context) {
	pk := c.Param("pk")
	var results []models.GameRankingResult
	config.DB.Where("player_id = ?", pk).Order("created_at DESC").Find(&results)
	out := make([]gin.H, 0, len(results))
	for _, r := range results {
		out = append(out, gin.H{
			"id":           r.ID,
			"game_id":      r.GameID,
			"player_id":    r.PlayerID,
			"rank":         r.Rank,
			"delta":        r.Delta,
			"old_tier_name": r.OldTierName,
			"new_tier_name": r.NewTierName,
			"old_score":    r.OldScore,
			"new_score":    r.NewScore,
			"created_at":   formatTime(r.CreatedAt),
		})
	}
	respondOK(c, out)
}
