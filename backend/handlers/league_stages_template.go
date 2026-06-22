package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

type leagueStageTemplate struct {
	Name           string
	StageType      string
	GamesPerPlayer int
	Uma1st         float64
	Uma2nd         float64
	Uma3rd         float64
	Uma4th         float64
	AllowCompanion bool
	AllowFreeTable bool
	RecordRanking  bool
	PromotionRules map[string]interface{}
}

func leaguePromotionRules(rules map[string]interface{}) models.JSONField {
	if rules == nil {
		return leagueEmptyJSONField()
	}
	b, _ := json.Marshal(rules)
	return models.JSONField(b)
}

func leagueSeasonRegisteredPlayerCount(seasonID string) int {
	var count int64
	config.DB.Model(&models.LeagueSeasonPlayer{}).Where("season_id = ?", seasonID).Count(&count)
	return int(count)
}

func leagueStandard16Templates() []leagueStageTemplate {
	uma := []float64{20, 10, -10, -20}
	return []leagueStageTemplate{
		{
			Name: "积分赛", StageType: "swiss", GamesPerPlayer: 8,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":              "standard",
				"swiss_winners_count": 8,
			},
		},
		{
			Name: "淘汰赛第一阶段", StageType: "elimination_1", GamesPerPlayer: 4,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":          "standard",
				"winners_bypass":  4,
				"winners_keep":    4,
				"losers_promote":  4,
				"losers_keep":     8,
			},
		},
		{
			Name: "淘汰赛第二阶段", StageType: "elimination_2", GamesPerPlayer: 4,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":             "standard",
				"winners_to_winners": 4,
				"winners_to_losers":  4,
				"losers_to_losers":   4,
			},
		},
		{
			Name: "淘汰赛第三阶段", StageType: "elimination_3", GamesPerPlayer: 4,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":                   "standard",
				"winners_direct_semifinal": 4,
				"winners_to_revival":       4,
				"losers_to_revival":        4,
				"losers_eliminate":         4,
			},
		},
		{
			Name: "复活赛", StageType: "revival", GamesPerPlayer: 4,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: false, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":         "standard",
				"mixed_promote":  4,
			},
		},
		{
			Name: "半决赛", StageType: "semifinal", GamesPerPlayer: 6,
			Uma1st: 50, Uma2nd: 10, Uma3rd: -15, Uma4th: -40,
			AllowCompanion: false, AllowFreeTable: false, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":  "standard",
				"advance": 4,
			},
		},
		{
			Name: "决赛", StageType: "final", GamesPerPlayer: 4,
			Uma1st: 50, Uma2nd: 10, Uma3rd: -15, Uma4th: -40,
			AllowCompanion: false, AllowFreeTable: false, RecordRanking: true,
			PromotionRules: map[string]interface{}{"format": "standard"},
		},
	}
}

func leagueCompact1216Templates() []leagueStageTemplate {
	uma := []float64{20, 10, -10, -20}
	return []leagueStageTemplate{
		{
			Name: "积分赛", StageType: "swiss", GamesPerPlayer: 8,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":              "compact",
				"swiss_winners_count": 6,
			},
		},
		{
			Name: "淘汰赛第一阶段", StageType: "elimination_1", GamesPerPlayer: 4,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":         "compact",
				"winners_keep":   4,
				"winners_demote": 2,
				"losers_promote": 2,
				"losers_keep":    4,
			},
		},
		{
			Name: "淘汰赛第二阶段", StageType: "elimination_2", GamesPerPlayer: 4,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":                   "compact",
				"winners_direct_semifinal": 2,
				"winners_to_mixed":         4,
				"losers_to_mixed":          4,
				"losers_eliminate":         2,
			},
		},
		{
			Name: "淘汰赛第三阶段", StageType: "elimination_3", GamesPerPlayer: 4,
			Uma1st: uma[0], Uma2nd: uma[1], Uma3rd: uma[2], Uma4th: uma[3],
			AllowCompanion: true, AllowFreeTable: true, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":          "compact",
				"mixed":           true,
				"mixed_promote":   6,
				"mixed_eliminate": 2,
			},
		},
		{
			Name: "半决赛", StageType: "semifinal", GamesPerPlayer: 6,
			Uma1st: 50, Uma2nd: 10, Uma3rd: -15, Uma4th: -40,
			AllowCompanion: false, AllowFreeTable: false, RecordRanking: true,
			PromotionRules: map[string]interface{}{
				"format":  "compact",
				"advance": 4,
			},
		},
		{
			Name: "决赛", StageType: "final", GamesPerPlayer: 4,
			Uma1st: 50, Uma2nd: 10, Uma3rd: -15, Uma4th: -40,
			AllowCompanion: false, AllowFreeTable: false, RecordRanking: true,
			PromotionRules: map[string]interface{}{"format": "compact"},
		},
	}
}

func leagueCreateStagesFromTemplates(seasonID string, templates []leagueStageTemplate) ([]models.LeagueStage, error) {
	stages := make([]models.LeagueStage, 0, len(templates))
	for idx, tpl := range templates {
		stage := models.LeagueStage{
			ID:             newUUID(),
			SeasonID:       seasonID,
			Name:           tpl.Name,
			StageType:      tpl.StageType,
			Status:         "pending",
			Order:          idx + 1,
			GamesPerPlayer: tpl.GamesPerPlayer,
			Uma1st:         tpl.Uma1st,
			Uma2nd:         tpl.Uma2nd,
			Uma3rd:         tpl.Uma3rd,
			Uma4th:         tpl.Uma4th,
			BaseScore:      25000,
			AllowCompanion: tpl.AllowCompanion,
			AllowFreeTable: tpl.AllowFreeTable,
			RecordRanking:  tpl.RecordRanking,
			PromotionRules: leaguePromotionRules(tpl.PromotionRules),
		}
		if err := config.DB.Create(&stage).Error; err != nil {
			return nil, err
		}
		stages = append(stages, stage)
	}
	return stages, nil
}

func leagueRespondCreatedStages(c *gin.Context, seasonID string, format string, playerCount int) {
	var stages []models.LeagueStage
	config.DB.Where("season_id = ?", seasonID).Order("`order`").Find(&stages)
	stageIDs := make([]string, 0, len(stages))
	for _, st := range stages {
		stageIDs = append(stageIDs, st.ID)
	}
	playerCounts := leagueLoadStagePlayerCounts(stageIDs)
	gameCounts := leagueLoadStageGameCounts(stageIDs)
	result := make([]gin.H, 0, len(stages))
	for i := range stages {
		result = append(result, serializeLeagueStage(&stages[i], playerCounts, gameCounts))
	}
	respondOK(c, gin.H{
		"message":       "Standard stages created",
		"format":        format,
		"player_count":  playerCount,
		"stages":        result,
	})
}

func LeagueCreateStandardStages(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	config.DB.Where("id = ?", pk).First(&season)
	if season.ID == "" {
		respondError(c, http.StatusNotFound, "Season not found")
		return
	}
	if season.Status != "registration" {
		respondError(c, http.StatusBadRequest, "Season already started")
		return
	}

	playerCount := leagueSeasonRegisteredPlayerCount(pk)
	if playerCount < 12 {
		respondError(c, http.StatusBadRequest, fmt.Sprintf("Need at least 12 registered players (current: %d)", playerCount))
		return
	}

	config.DB.Where("season_id = ?", pk).Delete(&models.LeagueStage{})

	var templates []leagueStageTemplate
	format := "standard"
	if playerCount >= 16 {
		templates = leagueStandard16Templates()
	} else {
		format = "compact"
		templates = leagueCompact1216Templates()
	}

	if _, err := leagueCreateStagesFromTemplates(pk, templates); err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to create stage: "+err.Error())
		return
	}
	leagueRespondCreatedStages(c, pk, format, playerCount)
}
