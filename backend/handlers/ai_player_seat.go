package handlers

import (
	"mahjong-backend/models"
	"mahjong-backend/mortal"

	"github.com/gin-gonic/gin"
)

// aiSeatForGamePlayer returns the majsoul/paipu seat index used by Mortal analysis for this game player.
func aiSeatForGamePlayer(game *models.Game, gp *models.GamePlayer) int {
	if game == nil || gp == nil {
		return 0
	}
	seatUID := mortal.PaipuAccountIDsBySeat(game.PaipuData)
	if len(seatUID) == 0 {
		return gp.SeatNumber
	}
	uidToPlayer := map[int64]string{}
	for i := range game.GamePlayers {
		g := &game.GamePlayers[i]
		if g.Player == nil {
			continue
		}
		for _, acc := range g.Player.MajsoulAccounts {
			uidToPlayer[acc.UID] = g.PlayerID
		}
	}
	for seat, uid := range seatUID {
		if uidToPlayer[uid] == gp.PlayerID {
			return seat
		}
	}
	return gp.SeatNumber
}

func seatToPlayerIDFromPaipu(game *models.Game) map[int]string {
	out := map[int]string{}
	if game == nil {
		return out
	}
	seatUID := mortal.PaipuAccountIDsBySeat(game.PaipuData)
	if len(seatUID) == 0 {
		return out
	}
	uidToPlayer := map[int64]string{}
	for i := range game.GamePlayers {
		gp := &game.GamePlayers[i]
		if gp.Player == nil {
			continue
		}
		for _, acc := range gp.Player.MajsoulAccounts {
			uidToPlayer[acc.UID] = gp.PlayerID
		}
	}
	for seat, uid := range seatUID {
		if pid, ok := uidToPlayer[uid]; ok {
			out[seat] = pid
		}
	}
	return out
}

func enrichAiSummaryPlayerIDs(game *models.Game, summary gin.H) {
	if game == nil || summary["has_ai_analysis"] != true {
		return
	}
	raw, ok := summary["players"].([]gin.H)
	if !ok {
		return
	}
	seatToPID := seatToPlayerIDFromPaipu(game)
	for _, row := range raw {
		seat := intFromAny(row["seat"])
		if pid, ok := seatToPID[seat]; ok {
			row["player_id"] = pid
		}
	}
}

func intFromAny(v interface{}) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	}
	return 0
}
