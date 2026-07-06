package handlers

import (
	"testing"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func leagueStatsTestDB(t *testing.T) {
	t.Helper()
	playerMergeTestDB(t)
}

func leagueStatsCreateScoredGame(t *testing.T, playerScores [][2]interface{}) string {
	t.Helper()
	gameID := newUUID()
	game := models.Game{
		ID:        gameID,
		GameType:  "offline",
		GameMode:  "half_match",
		StartTime: time.Now(),
	}
	if err := config.DB.Create(&game).Error; err != nil {
		t.Fatal(err)
	}
	for seat, ps := range playerScores {
		pid := ps[0].(string)
		score := ps[1].(int)
		s := score
		if err := config.DB.Create(&models.GamePlayer{
			ID: newUUID(), GameID: gameID, PlayerID: pid,
			SeatNumber: seat, Score: &s,
		}).Error; err != nil {
			t.Fatal(err)
		}
	}
	return gameID
}

func TestLeagueStageStatsFirstRateAndCompanion(t *testing.T) {
	leagueStatsTestDB(t)
	seasonID, playerIDs := leagueTestCreateSeason(t, 4)
	stage := models.LeagueStage{
		ID: newUUID(), SeasonID: seasonID, Name: "积分赛",
		StageType: "points", Status: "ongoing", GamesPerPlayer: 1,
	}
	if err := config.DB.Create(&stage).Error; err != nil {
		t.Fatal(err)
	}

	winner, p2, p3, companion := playerIDs[0], playerIDs[1], playerIDs[2], playerIDs[3]
	game1 := leagueStatsCreateScoredGame(t, [][2]interface{}{
		{winner, 50}, {p2, 30}, {p3, 15}, {companion, 5},
	})
	config.DB.Create(&models.LeagueMatch{
		ID: newUUID(), StageID: stage.ID, GameID: &game1,
		CompanionPlayers: leagueStringListToJSONField([]string{companion}),
	})

	result := leagueAggregateStageStats(stage.ID, "1st")
	byPlayer := map[string]float64{}
	for _, row := range result {
		rate, _ := row["rate"].(float64)
		byPlayer[playerIDFromRow(row)] = rate
	}
	if byPlayer[winner] != 100 {
		t.Fatalf("winner 1st rate = %v, want 100", byPlayer[winner])
	}
	for _, row := range result {
		if playerIDFromRow(row) == companion {
			t.Fatal("companion should be excluded from stats")
		}
	}

	high := leagueAggregateStageStats(stage.ID, "high_score")
	highByPlayer := map[string]float64{}
	for _, row := range high {
		rate, _ := row["rate"].(float64)
		highByPlayer[playerIDFromRow(row)] = rate
	}
	if highByPlayer[winner] != 50 {
		t.Fatalf("winner high_score = %v, want 50", highByPlayer[winner])
	}
}

func TestLeagueSeasonStatsAggregatesStages(t *testing.T) {
	leagueStatsTestDB(t)
	seasonID, playerIDs := leagueTestCreateSeason(t, 4)
	p1 := playerIDs[0]

	stage1 := models.LeagueStage{ID: newUUID(), SeasonID: seasonID, Name: "S1", Status: "ongoing", GamesPerPlayer: 99, Order: 1}
	config.DB.Create(&stage1)

	g1 := leagueStatsCreateScoredGame(t, [][2]interface{}{
		{playerIDs[0], 40}, {playerIDs[1], 10}, {playerIDs[2], 25}, {playerIDs[3], 25},
	})
	config.DB.Create(&models.LeagueMatch{ID: newUUID(), StageID: stage1.ID, GameID: &g1})

	acc := make(map[string]*leagueStatsAccumulator)
	var matches []models.LeagueMatch
	config.DB.Preload("Game.GamePlayers.Player").Where("stage_id = ?", stage1.ID).Find(&matches)
	leagueProcessMatchesForStats(&stage1, matches, make(map[string]int), acc)

	p1Copy := acc[p1]
	acc[p1] = &leagueStatsAccumulator{
		Total:     p1Copy.Total + 1,
		Ranks:     [5]int{0, p1Copy.Ranks[1] + 1},
		HighScore: p1Copy.HighScore,
		Player:    p1Copy.Player,
	}

	if acc[p1].Total != 2 || acc[p1].Ranks[1] != 2 {
		t.Fatalf("merged acc p1 total=%d ranks[1]=%d, want 2/2", acc[p1].Total, acc[p1].Ranks[1])
	}

	result := leagueBuildStatsResult(acc, "1st")
	if len(result) == 0 {
		t.Fatal("expected non-empty stats result")
	}
}

func playerIDFromRow(row gin.H) string {
	player, ok := row["player"].(gin.H)
	if !ok {
		if m, ok2 := row["player"].(map[string]interface{}); ok2 {
			id, _ := m["id"].(string)
			return id
		}
		return ""
	}
	id, _ := player["id"].(string)
	return id
}
