package handlers

import (
	"testing"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func leagueTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&models.LeagueSeries{},
		&models.LeagueSeason{},
		&models.LeagueStage{},
		&models.LeagueSeasonPlayer{},
		&models.LeagueStagePlayer{},
		&models.Player{},
	); err != nil {
		t.Fatal(err)
	}
	config.DB = db
}

func leagueTestCreateSeason(t *testing.T, playerCount int) (seasonID string, playerIDs []string) {
	t.Helper()
	series := models.LeagueSeries{ID: newUUID(), Name: "Test Series"}
	if err := config.DB.Create(&series).Error; err != nil {
		t.Fatal(err)
	}
	season := models.LeagueSeason{
		ID: newUUID(), SeriesID: series.ID, SeasonNumber: 1,
		Name: "S1", Status: "registration",
	}
	if err := config.DB.Create(&season).Error; err != nil {
		t.Fatal(err)
	}
	playerIDs = make([]string, 0, playerCount)
	for i := 0; i < playerCount; i++ {
		p := models.Player{ID: newUUID(), Nickname: "P" + string(rune('A'+i))}
		if err := config.DB.Create(&p).Error; err != nil {
			t.Fatal(err)
		}
		playerIDs = append(playerIDs, p.ID)
		config.DB.Create(&models.LeagueSeasonPlayer{
			ID: newUUID(), SeasonID: season.ID, PlayerID: p.ID,
		})
	}
	return season.ID, playerIDs
}

func leagueTestCreateStagePlayers(stageID string, playerIDs []string, pts []float64, group string) {
	for i, pid := range playerIDs {
		pt := 0.0
		if i < len(pts) {
			pt = pts[i]
		}
		config.DB.Create(&models.LeagueStagePlayer{
			ID: newUUID(), StageID: stageID, PlayerID: pid,
			GroupType: group, TotalPT: pt, GamesPlayed: 4,
		})
	}
}

func TestLeagueCreateStandardStagesPlayerCount(t *testing.T) {
	leagueTestDB(t)

	for _, tc := range []struct {
		players    int
		wantStages int
		wantFormat string
		wantErr    bool
	}{
		{10, 0, "", true},
		{12, 6, "compact", false},
		{15, 6, "compact", false},
		{16, 7, "standard", false},
	} {
		seasonID, _ := leagueTestCreateSeason(t, tc.players)
		templates := leagueCompact1216Templates()
		if tc.players >= 16 {
			templates = leagueStandard16Templates()
		}
		if tc.wantErr {
			if leagueSeasonRegisteredPlayerCount(seasonID) >= 12 {
				t.Fatalf("expected <12 players for error case")
			}
			continue
		}
		stages, err := leagueCreateStagesFromTemplates(seasonID, templates)
		if err != nil {
			t.Fatalf("players=%d: %v", tc.players, err)
		}
		if len(stages) != tc.wantStages {
			t.Fatalf("players=%d: got %d stages, want %d", tc.players, len(stages), tc.wantStages)
		}
		format := leagueRulesString(stages[0].PromotionRules.AsMap(), "format")
		if format != tc.wantFormat {
			t.Fatalf("players=%d: format %q, want %q", tc.players, format, tc.wantFormat)
		}
	}
}

func TestLeagueCompactElim1Promotion(t *testing.T) {
	leagueTestDB(t)
	seasonID, playerIDs := leagueTestCreateSeason(t, 12)
	stages, err := leagueCreateStagesFromTemplates(seasonID, leagueCompact1216Templates())
	if err != nil {
		t.Fatal(err)
	}

	elim1 := stages[1]
	winners := playerIDs[:6]
	losers := playerIDs[6:]
	leagueTestCreateStagePlayers(elim1.ID, winners, []float64{10, 9, 8, 7, 6, 5}, "winners")
	leagueTestCreateStagePlayers(elim1.ID, losers, []float64{4, 3, 2, 1, 0, -1}, "losers")
	config.DB.Model(&elim1).Update("status", "finished")

	added, _, err := leagueApplyStagePromotionCore(elim1.ID)
	if err != nil {
		t.Fatal(err)
	}
	if added != 12 {
		t.Fatalf("added %d players, want 12", added)
	}

	elim2 := stages[2]
	var elim2Players []models.LeagueStagePlayer
	config.DB.Where("stage_id = ?", elim2.ID).Find(&elim2Players)
	winnersCount, losersCount := 0, 0
	for _, sp := range elim2Players {
		switch sp.GroupType {
		case "winners":
			winnersCount++
		case "losers":
			losersCount++
		}
	}
	if winnersCount != 6 || losersCount != 6 {
		t.Fatalf("elim2 groups: winners=%d losers=%d, want 6/6", winnersCount, losersCount)
	}

	var eliminated int64
	config.DB.Model(&models.LeagueStagePlayer{}).
		Where("stage_id = ? AND is_eliminated = ?", elim1.ID, true).
		Count(&eliminated)
	if eliminated != 0 {
		t.Fatalf("expected 0 eliminations for 12 players, got %d", eliminated)
	}
}

func TestLeagueCompactSwissGrouping(t *testing.T) {
	leagueTestDB(t)
	seasonID, playerIDs := leagueTestCreateSeason(t, 13)
	stages, _ := leagueCreateStagesFromTemplates(seasonID, leagueCompact1216Templates())
	swiss, elim1 := stages[0], stages[1]

	pts := make([]float64, len(playerIDs))
	for i := range playerIDs {
		pts[i] = float64(len(playerIDs) - i)
	}
	leagueTestCreateStagePlayers(swiss.ID, playerIDs, pts, "none")
	config.DB.Model(&swiss).Update("status", "finished")

	added, _, err := leagueApplyStagePromotionCore(swiss.ID)
	if err != nil {
		t.Fatal(err)
	}
	if added != 13 {
		t.Fatalf("added %d, want 13", added)
	}

	var wCount, lCount int64
	config.DB.Model(&models.LeagueStagePlayer{}).Where("stage_id = ? AND group_type = ?", elim1.ID, "winners").Count(&wCount)
	config.DB.Model(&models.LeagueStagePlayer{}).Where("stage_id = ? AND group_type = ?", elim1.ID, "losers").Count(&lCount)
	if wCount != 6 || lCount != 7 {
		t.Fatalf("swiss split winners=%d losers=%d, want 6/7", wCount, lCount)
	}
}

func TestLeagueRecalculateStagePTWithPreloadedPlayer(t *testing.T) {
	leagueTestDB(t)
	seasonID, playerIDs := leagueTestCreateSeason(t, 4)
	stages, _ := leagueCreateStagesFromTemplates(seasonID, leagueCompact1216Templates())
	swiss := stages[0]

	for i, pid := range playerIDs {
		config.DB.Create(&models.LeagueStagePlayer{
			ID: newUUID(), StageID: swiss.ID, PlayerID: pid,
			GroupType: "none", TotalPT: float64(10 - i), GamesPlayed: 1,
		})
	}

	// Must not panic: Preload("Player") + Updates used to trigger unaddressable reflect panic.
	leagueRecalculateStagePT(swiss.ID)

	var sps []models.LeagueStagePlayer
	config.DB.Where("stage_id = ?", swiss.ID).Find(&sps)
	if len(sps) != 4 {
		t.Fatalf("expected 4 stage players, got %d", len(sps))
	}
}

func TestLeagueCompactElim3NoGroups(t *testing.T) {
	leagueTestDB(t)
	seasonID, _ := leagueTestCreateSeason(t, 14)
	stages, _ := leagueCreateStagesFromTemplates(seasonID, leagueCompact1216Templates())
	elim3 := stages[3]
	if elim3.HasGroups() {
		t.Fatal("compact elimination_3 should not have groups")
	}
}
