package handlers

import (
	"fmt"
	"sort"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"
)

func leagueMatchSortTime(m *models.LeagueMatch) time.Time {
	if m.Game != nil && !m.Game.StartTime.IsZero() {
		return m.Game.StartTime
	}
	return m.CreatedAt
}

// leagueResolveCompanionPlayers merges manual companions with players who have
// already completed the required games for this stage.
func leagueResolveCompanionPlayers(stage *models.LeagueStage, scheduled, manual []string, gamesPlayed map[string]int) []string {
	seen := make(map[string]bool, len(scheduled))
	companions := make([]string, 0, len(manual)+len(scheduled))
	for _, id := range manual {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		companions = append(companions, id)
	}
	required := stage.GamesPerPlayer
	if required <= 0 {
		return companions
	}
	for _, id := range scheduled {
		if id == "" || seen[id] {
			continue
		}
		if gamesPlayed[id] >= required {
			seen[id] = true
			companions = append(companions, id)
		}
	}
	return companions
}

// leagueCompanionPlayersForScheduled recalculates stage PT and merges manual + auto companions.
// Manual companions are limited to 2 and require allow_companion; full players are always auto-marked.
func leagueCompanionPlayersForScheduled(stage *models.LeagueStage, stageID string, scheduled, manual []string) ([]string, map[string]int, error) {
	if manual == nil {
		manual = []string{}
	}
	if len(manual) > 2 {
		return nil, nil, fmt.Errorf("陪打选手最多 2 名")
	}
	if len(manual) > 0 && !stage.AllowCompanion {
		return nil, nil, fmt.Errorf("当前赛段未开放陪打")
	}
	leagueRecalculateStagePT(stageID)
	gamesPlayed := leagueStageGamesPlayedMap(stageID)
	companions := leagueResolveCompanionPlayers(stage, scheduled, manual, gamesPlayed)
	return companions, gamesPlayed, nil
}

func leagueStageGamesPlayedMap(stageID string) map[string]int {
	var sps []models.LeagueStagePlayer
	config.DB.Where("stage_id = ?", stageID).Find(&sps)
	out := make(map[string]int, len(sps))
	for _, sp := range sps {
		out[sp.PlayerID] = sp.GamesPlayed
	}
	return out
}

func leagueCompanionSetForMatch(stage *models.LeagueStage, match *models.LeagueMatch, playedBefore map[string]int) map[string]bool {
	set := make(map[string]bool)
	for _, cid := range leagueJSONFieldToStringList(match.CompanionPlayers) {
		if cid != "" {
			set[cid] = true
		}
	}
	required := stage.GamesPerPlayer
	if required <= 0 || match.Game == nil {
		return set
	}
	for _, gp := range match.Game.GamePlayers {
		if playedBefore[gp.PlayerID] >= required {
			set[gp.PlayerID] = true
		}
	}
	return set
}

func leagueMergeCompanionPlayers(stage *models.LeagueStage, match *models.LeagueMatch, companionSet map[string]bool) {
	if len(companionSet) == 0 {
		return
	}
	ids := make([]string, 0, len(companionSet))
	for id := range companionSet {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	field := leagueStringListToJSONField(ids)
	if string(match.CompanionPlayers) == string(field) {
		return
	}
	config.DB.Model(match).Update("companion_players", field)
	match.CompanionPlayers = field
}

func leagueSortMatchesByTime(matches []models.LeagueMatch) {
	sort.Slice(matches, func(i, j int) bool {
		ti, tj := leagueMatchSortTime(&matches[i]), leagueMatchSortTime(&matches[j])
		if ti.Equal(tj) {
			if matches[i].CreatedAt.Equal(matches[j].CreatedAt) {
				return matches[i].ID < matches[j].ID
			}
			return matches[i].CreatedAt.Before(matches[j].CreatedAt)
		}
		return ti.Before(tj)
	})
}
