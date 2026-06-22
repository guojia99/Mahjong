package handlers

import (
	"fmt"
	"net/http"
	"sort"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

type leaguePromoPlacement struct {
	PlayerID   string
	StageID    string
	GroupType  string
	Promoted   bool
	Eliminated bool
}

func leagueRulesInt(m map[string]interface{}, key string, def int) int {
	if m == nil {
		return def
	}
	v, ok := m[key]
	if !ok {
		return def
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return def
	}
}

func leagueRulesString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

func leagueStagePlayersSorted(stageID string) ([]models.LeagueStagePlayer, []models.LeagueStagePlayer, []models.LeagueStagePlayer) {
	var currentSPs []models.LeagueStagePlayer
	config.DB.Where("stage_id = ?", stageID).Find(&currentSPs)

	winners := make([]models.LeagueStagePlayer, 0)
	losers := make([]models.LeagueStagePlayer, 0)
	others := make([]models.LeagueStagePlayer, 0)
	for _, sp := range currentSPs {
		switch sp.GroupType {
		case "winners":
			winners = append(winners, sp)
		case "losers":
			losers = append(losers, sp)
		default:
			others = append(others, sp)
		}
	}
	sortByPT := func(list []models.LeagueStagePlayer) {
		sort.Slice(list, func(i, j int) bool { return list[i].TotalPT > list[j].TotalPT })
	}
	sortByPT(winners)
	sortByPT(losers)
	sortByPT(others)
	return winners, losers, others
}

func leagueFindSeasonStage(seasonID, stageType string) *models.LeagueStage {
	var stage models.LeagueStage
	config.DB.Where("season_id = ? AND stage_type = ?", seasonID, stageType).Order("`order`").First(&stage)
	if stage.ID == "" {
		return nil
	}
	return &stage
}

func leagueSlicePlayers(list []models.LeagueStagePlayer, from, count int) []models.LeagueStagePlayer {
	if from >= len(list) || count <= 0 {
		return nil
	}
	end := from + count
	if end > len(list) {
		end = len(list)
	}
	return list[from:end]
}

func leagueMarkEliminated(players []models.LeagueStagePlayer) {
	for _, sp := range players {
		config.DB.Model(&sp).Update("is_eliminated", true)
	}
}

func leagueMarkPromoted(players []models.LeagueStagePlayer) {
	for _, sp := range players {
		config.DB.Model(&sp).Update("is_promoted", true)
	}
}

func leagueApplyPlacements(placements []leaguePromoPlacement) int {
	added := 0
	for _, p := range placements {
		if p.Eliminated {
			continue
		}
		var existing models.LeagueStagePlayer
		if err := config.DB.Where("stage_id = ? AND player_id = ?", p.StageID, p.PlayerID).First(&existing).Error; err == nil {
			continue
		}
		sp := models.LeagueStagePlayer{
			ID:         newUUID(),
			StageID:    p.StageID,
			PlayerID:   p.PlayerID,
			GroupType:  p.GroupType,
			IsPromoted: p.Promoted,
		}
		if sp.GroupType == "" {
			sp.GroupType = "none"
		}
		config.DB.Create(&sp)
		added++
	}
	return added
}

func leaguePlacementFromPlayers(stageID, group string, players []models.LeagueStagePlayer, promoted bool) []leaguePromoPlacement {
	out := make([]leaguePromoPlacement, 0, len(players))
	for _, sp := range players {
		out = append(out, leaguePromoPlacement{
			PlayerID:  sp.PlayerID,
			StageID:   stageID,
			GroupType: group,
			Promoted:  promoted,
		})
	}
	return out
}

func leagueBuildSwissPlacements(stage *models.LeagueStage, nextStage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	_, _, others := leagueStagePlayersSorted(stage.ID)
	winnersCount := leagueRulesInt(rules, "swiss_winners_count", 8)
	if winnersCount <= 0 {
		winnersCount = 8
	}
	if winnersCount > len(others) {
		winnersCount = len(others)
	}
	placements := make([]leaguePromoPlacement, 0, len(others))
	for i, sp := range others {
		group := "losers"
		if i < winnersCount {
			group = "winners"
		}
		placements = append(placements, leaguePromoPlacement{
			PlayerID:  sp.PlayerID,
			StageID:   nextStage.ID,
			GroupType: group,
		})
	}
	return placements
}

func leagueBuildStandardElim1Placements(stage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	winners, losers, _ := leagueStagePlayersSorted(stage.ID)
	elim2 := leagueFindSeasonStage(stage.SeasonID, "elimination_2")
	elim3 := leagueFindSeasonStage(stage.SeasonID, "elimination_3")
	if elim2 == nil || elim3 == nil {
		return nil
	}

	bypass := leagueRulesInt(rules, "winners_bypass", 4)
	keep := leagueRulesInt(rules, "winners_keep", 4)
	losersPromote := leagueRulesInt(rules, "losers_promote", 4)
	losersKeep := leagueRulesInt(rules, "losers_keep", 8)

	placements := make([]leaguePromoPlacement, 0)
	bypassPlayers := leagueSlicePlayers(winners, 0, bypass)
	leagueMarkPromoted(bypassPlayers)
	placements = append(placements, leaguePlacementFromPlayers(elim3.ID, "winners", bypassPlayers, true)...)

	keepPlayers := leagueSlicePlayers(winners, bypass, keep)
	placements = append(placements, leaguePlacementFromPlayers(elim2.ID, "winners", keepPlayers, false)...)

	promotedLosers := leagueSlicePlayers(losers, 0, losersPromote)
	placements = append(placements, leaguePlacementFromPlayers(elim2.ID, "winners", promotedLosers, false)...)

	remainingLosers := leagueSlicePlayers(losers, losersPromote, len(losers))
	keptLosers := leagueSlicePlayers(remainingLosers, 0, losersKeep)
	placements = append(placements, leaguePlacementFromPlayers(elim2.ID, "losers", keptLosers, false)...)

	eliminatedLosers := leagueSlicePlayers(remainingLosers, losersKeep, len(remainingLosers))
	leagueMarkEliminated(eliminatedLosers)
	return placements
}

func leagueBuildStandardElim2Placements(stage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	winners, losers, _ := leagueStagePlayersSorted(stage.ID)
	elim3 := leagueFindSeasonStage(stage.SeasonID, "elimination_3")
	if elim3 == nil {
		return nil
	}

	toWinners := leagueRulesInt(rules, "winners_to_winners", 4)
	toLosers := leagueRulesInt(rules, "winners_to_losers", 4)
	losersToLosers := leagueRulesInt(rules, "losers_to_losers", 4)

	placements := make([]leaguePromoPlacement, 0)
	placements = append(placements, leaguePlacementFromPlayers(elim3.ID, "winners", leagueSlicePlayers(winners, 0, toWinners), false)...)
	placements = append(placements, leaguePlacementFromPlayers(elim3.ID, "losers", leagueSlicePlayers(winners, toWinners, toLosers), false)...)
	placements = append(placements, leaguePlacementFromPlayers(elim3.ID, "losers", leagueSlicePlayers(losers, 0, losersToLosers), false)...)
	return placements
}

func leagueBuildStandardElim3Placements(stage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	winners, losers, _ := leagueStagePlayersSorted(stage.ID)
	semifinal := leagueFindSeasonStage(stage.SeasonID, "semifinal")
	revival := leagueFindSeasonStage(stage.SeasonID, "revival")
	if semifinal == nil || revival == nil {
		return nil
	}

	directSF := leagueRulesInt(rules, "winners_direct_semifinal", 4)
	toRevivalW := leagueRulesInt(rules, "winners_to_revival", 4)
	toRevivalL := leagueRulesInt(rules, "losers_to_revival", 4)
	eliminateL := leagueRulesInt(rules, "losers_eliminate", 4)

	placements := make([]leaguePromoPlacement, 0)
	directPlayers := leagueSlicePlayers(winners, 0, directSF)
	leagueMarkPromoted(directPlayers)
	placements = append(placements, leaguePlacementFromPlayers(semifinal.ID, "none", directPlayers, true)...)

	placements = append(placements, leaguePlacementFromPlayers(revival.ID, "none", leagueSlicePlayers(winners, directSF, toRevivalW), false)...)
	placements = append(placements, leaguePlacementFromPlayers(revival.ID, "none", leagueSlicePlayers(losers, 0, toRevivalL), false)...)

	eliminated := leagueSlicePlayers(losers, toRevivalL, eliminateL)
	if eliminateL <= 0 {
		eliminated = leagueSlicePlayers(losers, toRevivalL, len(losers))
	}
	leagueMarkEliminated(eliminated)
	return placements
}

func leagueBuildRevivalPlacements(stage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	_, _, others := leagueStagePlayersSorted(stage.ID)
	semifinal := leagueFindSeasonStage(stage.SeasonID, "semifinal")
	if semifinal == nil {
		return nil
	}
	promote := leagueRulesInt(rules, "mixed_promote", 4)
	promoted := leagueSlicePlayers(others, 0, promote)
	leagueMarkPromoted(promoted)
	placements := leaguePlacementFromPlayers(semifinal.ID, "none", promoted, true)
	leagueMarkEliminated(leagueSlicePlayers(others, promote, len(others)))
	return placements
}

func leagueBuildCompactElim1Placements(stage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	winners, losers, _ := leagueStagePlayersSorted(stage.ID)
	elim2 := leagueFindSeasonStage(stage.SeasonID, "elimination_2")
	if elim2 == nil {
		return nil
	}

	keep := leagueRulesInt(rules, "winners_keep", 4)
	demote := leagueRulesInt(rules, "winners_demote", 2)
	losersPromote := leagueRulesInt(rules, "losers_promote", 2)
	losersKeep := leagueRulesInt(rules, "losers_keep", 4)

	placements := make([]leaguePromoPlacement, 0)
	placements = append(placements, leaguePlacementFromPlayers(elim2.ID, "winners", leagueSlicePlayers(winners, 0, keep), false)...)
	placements = append(placements, leaguePlacementFromPlayers(elim2.ID, "losers", leagueSlicePlayers(winners, keep, demote), false)...)
	placements = append(placements, leaguePlacementFromPlayers(elim2.ID, "winners", leagueSlicePlayers(losers, 0, losersPromote), false)...)

	remainingLosers := leagueSlicePlayers(losers, losersPromote, len(losers))
	keptLosers := leagueSlicePlayers(remainingLosers, 0, losersKeep)
	placements = append(placements, leaguePlacementFromPlayers(elim2.ID, "losers", keptLosers, false)...)

	eliminated := leagueSlicePlayers(remainingLosers, losersKeep, len(remainingLosers))
	leagueMarkEliminated(eliminated)
	return placements
}

func leagueBuildCompactElim2Placements(stage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	winners, losers, _ := leagueStagePlayersSorted(stage.ID)
	semifinal := leagueFindSeasonStage(stage.SeasonID, "semifinal")
	elim3 := leagueFindSeasonStage(stage.SeasonID, "elimination_3")
	if semifinal == nil || elim3 == nil {
		return nil
	}

	directSF := leagueRulesInt(rules, "winners_direct_semifinal", 2)
	toMixedW := leagueRulesInt(rules, "winners_to_mixed", 4)
	toMixedL := leagueRulesInt(rules, "losers_to_mixed", 4)
	eliminateL := leagueRulesInt(rules, "losers_eliminate", 2)

	placements := make([]leaguePromoPlacement, 0)
	directPlayers := leagueSlicePlayers(winners, 0, directSF)
	leagueMarkPromoted(directPlayers)
	placements = append(placements, leaguePlacementFromPlayers(semifinal.ID, "none", directPlayers, true)...)

	placements = append(placements, leaguePlacementFromPlayers(elim3.ID, "none", leagueSlicePlayers(winners, directSF, toMixedW), false)...)
	placements = append(placements, leaguePlacementFromPlayers(elim3.ID, "none", leagueSlicePlayers(losers, 0, toMixedL), false)...)

	eliminated := leagueSlicePlayers(losers, toMixedL, eliminateL)
	if eliminateL <= 0 {
		eliminated = leagueSlicePlayers(losers, toMixedL, len(losers))
	}
	leagueMarkEliminated(eliminated)
	return placements
}

func leagueBuildCompactElim3Placements(stage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	_, _, others := leagueStagePlayersSorted(stage.ID)
	semifinal := leagueFindSeasonStage(stage.SeasonID, "semifinal")
	if semifinal == nil {
		return nil
	}
	promote := leagueRulesInt(rules, "mixed_promote", 6)
	eliminate := leagueRulesInt(rules, "mixed_eliminate", 2)

	promoted := leagueSlicePlayers(others, 0, promote)
	placements := leaguePlacementFromPlayers(semifinal.ID, "none", promoted, false)
	leagueMarkEliminated(leagueSlicePlayers(others, promote, eliminate))
	return placements
}

func leagueBuildSemifinalPlacements(stage *models.LeagueStage, nextStage *models.LeagueStage, rules map[string]interface{}) []leaguePromoPlacement {
	_, _, others := leagueStagePlayersSorted(stage.ID)
	advance := leagueRulesInt(rules, "advance", 4)
	promoted := leagueSlicePlayers(others, 0, advance)
	placements := leaguePlacementFromPlayers(nextStage.ID, "none", promoted, false)
	leagueMarkEliminated(leagueSlicePlayers(others, advance, len(others)))
	return placements
}

func leagueBuildPromotionPlacements(stage *models.LeagueStage, nextStage *models.LeagueStage) []leaguePromoPlacement {
	rules := stage.PromotionRules.AsMap()
	format := leagueRulesString(rules, "format")

	switch stage.StageType {
	case "swiss":
		return leagueBuildSwissPlacements(stage, nextStage, rules)
	case "elimination_1":
		if format == "compact" {
			return leagueBuildCompactElim1Placements(stage, rules)
		}
		return leagueBuildStandardElim1Placements(stage, rules)
	case "elimination_2":
		if format == "compact" {
			return leagueBuildCompactElim2Placements(stage, rules)
		}
		return leagueBuildStandardElim2Placements(stage, rules)
	case "elimination_3":
		if format == "compact" {
			return leagueBuildCompactElim3Placements(stage, rules)
		}
		return leagueBuildStandardElim3Placements(stage, rules)
	case "revival":
		return leagueBuildRevivalPlacements(stage, rules)
	case "semifinal":
		return leagueBuildSemifinalPlacements(stage, nextStage, rules)
	default:
		return nil
	}
}

func leagueApplyStagePromotionCore(stageID string) (int, string, error) {
	var stage models.LeagueStage
	config.DB.Preload("Season").Where("id = ?", stageID).First(&stage)
	if stage.ID == "" {
		return 0, "", fmt.Errorf("stage not found")
	}
	if stage.Status != "finished" {
		return 0, "", fmt.Errorf("stage must be finished first")
	}

	var nextStage models.LeagueStage
	config.DB.Where("season_id = ? AND `order` > ?", stage.SeasonID, stage.Order).
		Order("`order`").First(&nextStage)
	if nextStage.ID == "" && stage.StageType != "elimination_1" && stage.StageType != "elimination_2" && stage.StageType != "elimination_3" && stage.StageType != "revival" {
		return 0, "", fmt.Errorf("no next stage found")
	}

	placements := leagueBuildPromotionPlacements(&stage, &nextStage)
	if placements == nil {
		return 0, "", fmt.Errorf("unsupported stage promotion: %s", stage.StageType)
	}
	added := leagueApplyPlacements(placements)
	nextID := nextStage.ID
	if added > 0 && nextID == "" {
		nextID = placements[0].StageID
	}
	return added, nextID, nil
}

func LeaguePromoteStage(c *gin.Context) {
	pk := c.Param("pk")
	added, nextStageID, err := leagueApplyStagePromotionCore(pk)
	if err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	respondOK(c, gin.H{
		"message":       "Promotion applied",
		"promoted":      added,
		"next_stage_id": nextStageID,
	})
}

func LeagueApplyStagePromotion(c *gin.Context) {
	LeaguePromoteStage(c)
}

func leagueLoadBypassPlayers(stage *models.LeagueStage) []gin.H {
	if stage.StageType != "elimination_2" && stage.StageType != "elimination_3" {
		return nil
	}
	var priorStages []models.LeagueStage
	config.DB.Where("season_id = ? AND `order` < ?", stage.SeasonID, stage.Order).
		Order("`order`").Find(&priorStages)

	format := ""
	for i := len(priorStages) - 1; i >= 0; i-- {
		rules := priorStages[i].PromotionRules.AsMap()
		if f := leagueRulesString(rules, "format"); f != "" {
			format = f
			break
		}
	}

	var bypassStageOrder int
	switch {
	case format == "compact" && stage.StageType == "elimination_3":
		bypassStageOrder = 0
	case format == "standard" && stage.StageType == "elimination_2":
		bypassStageOrder = 0
	case format == "standard" && stage.StageType == "elimination_3":
		for _, ps := range priorStages {
			if ps.StageType == "elimination_1" {
				bypassStageOrder = ps.Order
				break
			}
		}
	default:
		return nil
	}

	if format == "compact" && stage.StageType == "elimination_3" {
		for _, ps := range priorStages {
			if ps.StageType == "elimination_2" {
				var promoted []models.LeagueStagePlayer
				config.DB.Preload("Player").Where("stage_id = ? AND is_promoted = ?", ps.ID, true).Find(&promoted)
				return leagueBypassPlayerData(promoted)
			}
		}
		return nil
	}

	if bypassStageOrder == 0 {
		return nil
	}
	for _, ps := range priorStages {
		if ps.Order == bypassStageOrder {
			var promoted []models.LeagueStagePlayer
			config.DB.Preload("Player").Where("stage_id = ? AND is_promoted = ?", ps.ID, true).Find(&promoted)
			return leagueBypassPlayerData(promoted)
		}
	}
	return nil
}

func leagueBypassPlayerData(players []models.LeagueStagePlayer) []gin.H {
	out := make([]gin.H, 0, len(players))
	for _, sp := range players {
		if sp.Player == nil {
			continue
		}
		out = append(out, getPlayerListData(sp.Player))
	}
	return out
}
