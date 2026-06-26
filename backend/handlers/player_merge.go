package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func PlayerMerge(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil || !user.IsStaff {
		respondError(c, http.StatusForbidden, "Admin required")
		return
	}

	targetID := c.Param("pk")
	var req struct {
		SourcePlayerID string `json:"source_player_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.SourcePlayerID == "" {
		respondError(c, http.StatusBadRequest, "Missing source_player_id")
		return
	}
	sourceID := req.SourcePlayerID
	if sourceID == targetID {
		respondError(c, http.StatusBadRequest, "Cannot merge player into itself")
		return
	}

	var target, source models.Player
	if err := config.DB.Where("id = ?", targetID).First(&target).Error; err != nil {
		respondError(c, http.StatusNotFound, "Target player not found")
		return
	}
	if err := config.DB.Where("id = ?", sourceID).First(&source).Error; err != nil {
		respondError(c, http.StatusNotFound, "Source player not found")
		return
	}

	if err := mergePlayersIntoTarget(targetID, sourceID); err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	config.DB.Preload("MajsoulAccounts").First(&target, "id = ?", targetID)
	data := getPlayerDetailData(&target)
	attachPlayerAccountForAdmin(data, target.ID)
	respondOK(c, data)
}

func mergePlayersIntoTarget(targetID, sourceID string) error {
	return config.DB.Transaction(func(tx *gorm.DB) error {
		if err := mergeMajsoulAccounts(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := mergeGamePlayers(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := tx.Model(&models.HandRecord{}).Where("player_id = ?", sourceID).
			Update("player_id", targetID).Error; err != nil {
			return err
		}
		if err := mergeRoomPlayers(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := mergeLeagueSeasonPlayers(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := mergeLeagueStagePlayers(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := mergeLeagueMatchPlayerRefs(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := mergePlayerRankingScores(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := mergeGameRankingResults(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := mergeUserPlayerLinks(tx, targetID, sourceID); err != nil {
			return err
		}
		if err := tx.Model(&models.LoginLog{}).Where("player_id = ?", sourceID).
			Update("player_id", targetID).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", sourceID).Delete(&models.Player{}).Error; err != nil {
			return err
		}
		return nil
	})
}

func mergeMajsoulAccounts(tx *gorm.DB, targetID, sourceID string) error {
	var accounts []models.MahjongSoulAccount
	if err := tx.Where("player_id = ?", sourceID).Find(&accounts).Error; err != nil {
		return err
	}
	for _, acc := range accounts {
		var conflict models.MahjongSoulAccount
		if err := tx.Where("uid = ? AND player_id IS NOT NULL AND player_id NOT IN ?", acc.UID, []string{targetID, sourceID}).
			First(&conflict).Error; err == nil {
			return fmt.Errorf("雀魂 UID %d 已绑定到其他雀士，无法合并", acc.UID)
		}
		if err := tx.Model(&acc).Update("player_id", targetID).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeGamePlayers(tx *gorm.DB, targetID, sourceID string) error {
	var sourceRows []models.GamePlayer
	if err := tx.Where("player_id = ?", sourceID).Find(&sourceRows).Error; err != nil {
		return err
	}
	for _, row := range sourceRows {
		var targetRow models.GamePlayer
		err := tx.Where("game_id = ? AND player_id = ?", row.GameID, targetID).First(&targetRow).Error
		if err == nil {
			if err := tx.Delete(&row).Error; err != nil {
				return err
			}
			continue
		}
		if err := tx.Model(&row).Update("player_id", targetID).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeRoomPlayers(tx *gorm.DB, targetID, sourceID string) error {
	var sourceRows []models.RoomPlayer
	if err := tx.Where("player_id = ?", sourceID).Find(&sourceRows).Error; err != nil {
		return err
	}
	for _, row := range sourceRows {
		var targetRow models.RoomPlayer
		err := tx.Where("room_id = ? AND player_id = ?", row.RoomID, targetID).First(&targetRow).Error
		if err == nil {
			if err := tx.Delete(&row).Error; err != nil {
				return err
			}
			continue
		}
		if err := tx.Model(&row).Update("player_id", targetID).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeLeagueSeasonPlayers(tx *gorm.DB, targetID, sourceID string) error {
	var sourceRows []models.LeagueSeasonPlayer
	if err := tx.Where("player_id = ?", sourceID).Find(&sourceRows).Error; err != nil {
		return err
	}
	for _, row := range sourceRows {
		var targetRow models.LeagueSeasonPlayer
		err := tx.Where("season_id = ? AND player_id = ?", row.SeasonID, targetID).First(&targetRow).Error
		if err == nil {
			if row.SeedLabel != "" && targetRow.SeedLabel == "" {
				tx.Model(&targetRow).Update("seed_label", row.SeedLabel)
			}
			if err := tx.Delete(&row).Error; err != nil {
				return err
			}
			continue
		}
		if err := tx.Model(&row).Update("player_id", targetID).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeLeagueStagePlayers(tx *gorm.DB, targetID, sourceID string) error {
	var sourceRows []models.LeagueStagePlayer
	if err := tx.Where("player_id = ?", sourceID).Find(&sourceRows).Error; err != nil {
		return err
	}
	for _, row := range sourceRows {
		var targetRow models.LeagueStagePlayer
		err := tx.Where("stage_id = ? AND player_id = ?", row.StageID, targetID).First(&targetRow).Error
		if err == nil {
			mergedPT := targetRow.TotalPT + row.TotalPT
			mergedGames := targetRow.GamesPlayed + row.GamesPlayed
			updates := map[string]interface{}{
				"total_pt":     mergedPT,
				"games_played": mergedGames,
			}
			if row.IsPromoted {
				updates["is_promoted"] = true
			}
			if row.IsEliminated && !targetRow.IsEliminated {
				updates["is_eliminated"] = true
			}
			if err := tx.Model(&targetRow).Updates(updates).Error; err != nil {
				return err
			}
			if err := tx.Delete(&row).Error; err != nil {
				return err
			}
			continue
		}
		if err := tx.Model(&row).Update("player_id", targetID).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeLeagueMatchPlayerRefs(tx *gorm.DB, targetID, sourceID string) error {
	var matches []models.LeagueMatch
	if err := tx.Find(&matches).Error; err != nil {
		return err
	}
	for i := range matches {
		m := &matches[i]
		scheduled := replaceStringListField(m.ScheduledPlayers, sourceID, targetID)
		companions := replaceStringListField(m.CompanionPlayers, sourceID, targetID)
		if string(scheduled) != string(m.ScheduledPlayers) || string(companions) != string(m.CompanionPlayers) {
			if err := tx.Model(m).Updates(map[string]interface{}{
				"scheduled_players": scheduled,
				"companion_players": companions,
			}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func replaceStringListField(jf models.JSONField, from, to string) models.JSONField {
	list := leagueJSONFieldToStringList(jf)
	if len(list) == 0 {
		return jf
	}
	changed := false
	seen := make(map[string]bool, len(list))
	out := make([]string, 0, len(list))
	for _, id := range list {
		if id == from {
			id = to
			changed = true
		}
		if id == "" || seen[id] {
			changed = true
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	if !changed {
		return jf
	}
	b, _ := json.Marshal(out)
	return models.JSONField(b)
}

func mergePlayerRankingScores(tx *gorm.DB, targetID, sourceID string) error {
	var sourceScore models.PlayerRankingScore
	err := tx.Where("player_id = ?", sourceID).First(&sourceScore).Error
	if err == gorm.ErrRecordNotFound {
		return nil
	}
	if err != nil {
		return err
	}
	var targetScore models.PlayerRankingScore
	err = tx.Where("player_id = ?", targetID).First(&targetScore).Error
	if err == gorm.ErrRecordNotFound {
		sourceScore.PlayerID = targetID
		return tx.Save(&sourceScore).Error
	}
	if err != nil {
		return err
	}
	targetScore.Score += sourceScore.Score
	targetScore.GameCount += sourceScore.GameCount
	if err := tx.Save(&targetScore).Error; err != nil {
		return err
	}
	return tx.Delete(&sourceScore).Error
}

func mergeGameRankingResults(tx *gorm.DB, targetID, sourceID string) error {
	var sourceRows []models.GameRankingResult
	if err := tx.Where("player_id = ?", sourceID).Find(&sourceRows).Error; err != nil {
		return err
	}
	for _, row := range sourceRows {
		var targetRow models.GameRankingResult
		err := tx.Where("game_id = ? AND player_id = ?", row.GameID, targetID).First(&targetRow).Error
		if err == nil {
			if err := tx.Delete(&row).Error; err != nil {
				return err
			}
			continue
		}
		if err := tx.Model(&row).Update("player_id", targetID).Error; err != nil {
			return err
		}
	}
	return nil
}

func mergeUserPlayerLinks(tx *gorm.DB, targetID, sourceID string) error {
	var targetUser models.User
	targetHasUser := tx.Where("player_id = ?", targetID).First(&targetUser).Error == nil

	var sourceUser models.User
	if err := tx.Where("player_id = ?", sourceID).First(&sourceUser).Error; err == gorm.ErrRecordNotFound {
		return nil
	} else if err != nil {
		return err
	}

	if targetHasUser {
		return tx.Where("player_id = ?", sourceID).Delete(&models.User{}).Error
	}
	return tx.Model(&sourceUser).Update("player_id", targetID).Error
}
