package handlers

import (
	"math"
	"net/http"
	"sort"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

var leagueStatTypes = map[string]bool{
	"1st": true, "2nd": true, "3rd": true, "4th": true,
	"avg_rank": true, "high_score": true,
	"avg_win_point": true, "total_kan": true,
}

type leagueStatsAccumulator struct {
	Total     int
	Ranks     [5]int
	HighScore *int
	RankSum   int
	Player    *models.Player

	OnlineGames   int
	MinkanActions int
	AnkanActions  int
	WinPointsSum  int
	Wins          int
}

func LeagueStageStats(c *gin.Context) {
	pk := c.Param("pk")
	statType := c.DefaultQuery("stat_type", "1st")
	if !leagueStatTypes[statType] {
		statType = "1st"
	}
	result := leagueAggregateStageStats(pk, statType)
	respondOK(c, result)
}

func LeagueSeasonStats(c *gin.Context) {
	pk := c.Param("pk")
	statType := c.DefaultQuery("stat_type", "1st")
	if !leagueStatTypes[statType] {
		statType = "1st"
	}
	var season models.LeagueSeason
	if err := config.DB.Where("id = ?", pk).First(&season).Error; err != nil {
		respondError(c, http.StatusNotFound, "Season not found")
		return
	}
	result := leagueAggregateSeasonStats(pk, statType)
	respondOK(c, result)
}

func leagueAggregateStageStats(stageID, statType string) []gin.H {
	var stage models.LeagueStage
	if err := config.DB.Where("id = ?", stageID).First(&stage).Error; err != nil {
		return []gin.H{}
	}
	var matches []models.LeagueMatch
	config.DB.Preload("Game.GamePlayers.Player").Where("stage_id = ?", stageID).Find(&matches)
	acc := make(map[string]*leagueStatsAccumulator)
	playedCount := make(map[string]int)
	leagueProcessMatchesForStats(&stage, matches, playedCount, acc)
	return leagueBuildStatsResult(acc, statType)
}

func leagueAggregateSeasonStats(seasonID, statType string) []gin.H {
	var stages []models.LeagueStage
	config.DB.Where("season_id = ?", seasonID).Find(&stages)
	acc := make(map[string]*leagueStatsAccumulator)
	for i := range stages {
		stage := &stages[i]
		var matches []models.LeagueMatch
		config.DB.Preload("Game.GamePlayers.Player").Where("stage_id = ?", stage.ID).Find(&matches)
		playedCount := make(map[string]int)
		leagueProcessMatchesForStats(stage, matches, playedCount, acc)
	}
	return leagueBuildStatsResult(acc, statType)
}

func leagueProcessMatchesForStats(
	stage *models.LeagueStage,
	matches []models.LeagueMatch,
	playedCount map[string]int,
	acc map[string]*leagueStatsAccumulator,
) {
	leagueSortMatchesByTime(matches)
	for i := range matches {
		match := &matches[i]
		if match.Game == nil {
			continue
		}
		gps := match.Game.GamePlayers
		if len(gps) == 0 {
			continue
		}
		allScored := true
		for _, gp := range gps {
			if gp.Score == nil {
				allScored = false
				break
			}
		}
		if !allScored {
			continue
		}

		companionSet := leagueCompanionSetForMatch(stage, match, playedCount)
		leagueMergeCompanionPlayers(stage, match, companionSet)

		for _, gp := range gps {
			if companionSet[gp.PlayerID] {
				continue
			}
			a := leagueGetOrCreateStatsAcc(acc, &gp)
			a.Total++
			if gp.Score != nil {
				if a.HighScore == nil || *gp.Score > *a.HighScore {
					hs := *gp.Score
					a.HighScore = &hs
				}
			}
			rank := rankInGameGPS(gps, gp.PlayerID)
			if rank >= 1 && rank <= 4 {
				a.Ranks[rank]++
				a.RankSum += rank
			}
		}

		if match.Game.GameType == "online" && !match.Game.PaipuData.IsNil() {
			actions := paipuActionsFromGameData(match.Game.PaipuData)
			if len(actions) > 0 {
				seatStat, _ := aggregatePaipuPerGameStats(actions)
				seatToPlayer := leagueSeatToPlayerMap(gps)
				for _, pid := range seatToPlayer {
					if companionSet[pid] {
						continue
					}
					leagueGetOrCreateStatsAccByID(acc, pid, gps).OnlineGames++
				}
				for seat, s := range seatStat {
					if s == nil {
						continue
					}
					pid, ok := seatToPlayer[seat]
					if !ok || companionSet[pid] {
						continue
					}
					a := leagueGetOrCreateStatsAccByID(acc, pid, gps)
					a.MinkanActions += s.MinkanActions
					a.AnkanActions += s.AnkanActions
					a.WinPointsSum += s.WinPointsSum
					a.Wins += s.Wins
				}
			}
		}

		for _, gp := range gps {
			if !companionSet[gp.PlayerID] {
				playedCount[gp.PlayerID]++
			}
		}
	}
}

func leagueSeatToPlayerMap(gps []models.GamePlayer) map[int]string {
	out := make(map[int]string)
	for _, gp := range gps {
		out[gp.SeatNumber] = gp.PlayerID
	}
	return out
}

func leagueGetOrCreateStatsAcc(acc map[string]*leagueStatsAccumulator, gp *models.GamePlayer) *leagueStatsAccumulator {
	return leagueGetOrCreateStatsAccByID(acc, gp.PlayerID, []models.GamePlayer{*gp})
}

func leagueGetOrCreateStatsAccByID(acc map[string]*leagueStatsAccumulator, pid string, gps []models.GamePlayer) *leagueStatsAccumulator {
	if a, ok := acc[pid]; ok {
		return a
	}
	a := &leagueStatsAccumulator{}
	for _, gp := range gps {
		if gp.PlayerID == pid && gp.Player != nil {
			a.Player = gp.Player
			break
		}
	}
	if a.Player == nil {
		var p models.Player
		if err := config.DB.Where("id = ?", pid).First(&p).Error; err == nil {
			a.Player = &p
		}
	}
	acc[pid] = a
	return a
}

func leagueBuildStatsResult(acc map[string]*leagueStatsAccumulator, statType string) []gin.H {
	rankKeyMap := map[string]int{"1st": 1, "2nd": 2, "3rd": 3, "4th": 4}
	type sortItem struct {
		pid   string
		rate  float64
		count int
		total int
	}
	items := make([]sortItem, 0, len(acc))

	for pid, s := range acc {
		if s.Player == nil {
			continue
		}
		var rate float64
		var count, total int
		var include bool

		if target, ok := rankKeyMap[statType]; ok {
			if s.Total == 0 {
				continue
			}
			rate = math.Round(float64(s.Ranks[target])/float64(s.Total)*10000) / 100
			count = s.Ranks[target]
			total = s.Total
			include = true
		} else {
			switch statType {
			case "avg_rank":
				if s.Total == 0 {
					continue
				}
				rate = math.Round(float64(s.RankSum)/float64(s.Total)*100) / 100
				count = s.Total
				total = s.Total
				include = true
			case "high_score":
				if s.HighScore == nil {
					continue
				}
				rate = float64(*s.HighScore)
				count = s.Total
				total = s.Total
				include = true
			case "avg_win_point":
				if s.Wins <= 0 {
					continue
				}
				rate = round1(float64(s.WinPointsSum) / float64(s.Wins))
				count = s.WinPointsSum
				total = s.Wins
				include = true
			case "total_kan":
				if s.OnlineGames == 0 {
					continue
				}
				rate = float64(s.MinkanActions + s.AnkanActions)
				count = s.MinkanActions + s.AnkanActions
				total = s.OnlineGames
				include = true
			}
		}
		if include {
			items = append(items, sortItem{pid: pid, rate: rate, count: count, total: total})
		}
	}

	reverse := statType != "avg_rank"
	sort.Slice(items, func(i, j int) bool {
		if reverse {
			return items[i].rate > items[j].rate
		}
		return items[i].rate < items[j].rate
	})

	result := make([]gin.H, 0, len(items))
	for _, it := range items {
		s := acc[it.pid]
		result = append(result, gin.H{
			"player": getPlayerListData(s.Player),
			"rate":   it.rate,
			"count":  it.count,
			"total":  it.total,
		})
	}
	return result
}
