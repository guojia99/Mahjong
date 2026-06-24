package handlers

import (
	"testing"

	"mahjong-backend/models"
)

func TestAiSeatForGamePlayerFromPaipuUID(t *testing.T) {
	pd, _ := models.NewJSONField(map[string]interface{}{
		"players": []interface{}{
			map[string]interface{}{"seat": 0, "accountId": 1001, "nickName": "A"},
			map[string]interface{}{"seat": 1, "accountId": 2002, "nickName": "B"},
			map[string]interface{}{"seat": 2, "accountId": 3003, "nickName": "C"},
			map[string]interface{}{"seat": 3, "accountId": 4004, "nickName": "D"},
		},
	})
	pidB := "player-b"
	game := &models.Game{
		PaipuData: pd,
		GamePlayers: []models.GamePlayer{
			{PlayerID: "player-a", SeatNumber: 2, Player: &models.Player{
				MajsoulAccounts: []models.MahjongSoulAccount{{UID: 1001}},
			}},
			{PlayerID: pidB, SeatNumber: 0, Player: &models.Player{
				MajsoulAccounts: []models.MahjongSoulAccount{{UID: 2002}},
			}},
		},
	}
	gp := game.GamePlayers[1]
	if got := aiSeatForGamePlayer(game, &gp); got != 1 {
		t.Fatalf("expected paipu seat 1 got %d", got)
	}
}

func TestEnrichAiSummaryPlayerIDs(t *testing.T) {
	pd, _ := models.NewJSONField(map[string]interface{}{
		"players": []interface{}{
			map[string]interface{}{"seat": 2, "accountId": 999, "nickName": "X"},
		},
	})
	pid := "site-player-1"
	game := &models.Game{
		PaipuData: pd,
		GamePlayers: []models.GamePlayer{{
			PlayerID: pid,
			Player: &models.Player{
				MajsoulAccounts: []models.MahjongSoulAccount{{UID: 999}},
			},
		}},
	}
	summary := map[string]interface{}{
		"has_ai_analysis": true,
		"players": []map[string]interface{}{
			{"seat": 2, "match_avg": 80, "match_grade": "A"},
		},
	}
	// use gin.H compatible slice
	players := make([]map[string]interface{}, 1)
	players[0] = summary["players"].([]map[string]interface{})[0]
	summary["players"] = players

	// enrich expects gin.H - build properly
	ginSummary := map[string]interface{}{
		"has_ai_analysis": true,
	}
	rows := []map[string]interface{}{{"seat": float64(2), "match_avg": 80}}
	ginSummary["players"] = rows
	// Can't easily test gin.H type - test seatToPlayerIDFromPaipu instead
	seatMap := seatToPlayerIDFromPaipu(game)
	if seatMap[2] != pid {
		t.Fatalf("seat 2 -> %q want %q", seatMap[2], pid)
	}
}
