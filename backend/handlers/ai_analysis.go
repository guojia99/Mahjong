package handlers

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"

	"mahjong-backend/config"
	"mahjong-backend/models"
	"mahjong-backend/mortal"

	"github.com/gin-gonic/gin"
)

func mortalGradeTiers() []mortal.GradeTier {
	if config.Cfg == nil || len(config.Cfg.AiGradeTiers) == 0 {
		return mortal.DefaultGradeTiers()
	}
	out := make([]mortal.GradeTier, 0, len(config.Cfg.AiGradeTiers))
	for _, t := range config.Cfg.AiGradeTiers {
		out = append(out, mortal.GradeTier{Grade: t.Grade, Min: t.Min})
	}
	return out
}

func mortalClient() *mortal.Client {
	url := "http://127.0.0.1:9996"
	if config.Cfg != nil && config.Cfg.MortalBaseURL != "" {
		url = config.Cfg.MortalBaseURL
	}
	return mortal.NewClient(url)
}

func aiSummaryForGame(game *models.Game) gin.H {
	if !mortal.IsAnalysisDataCurrent(game.AiAnalysisStatus, game.AiAnalysisData) {
		status := game.AiAnalysisStatus
		if status == "done" {
			status = "outdated"
		}
		return gin.H{
			"status":            status,
			"has_ai_analysis":   false,
			"analysis_version":  mortal.AnalysisVersion,
			"stored_version":    mortal.StoredAnalysisVersion(game.AiAnalysisData),
		}
	}
	var ar mortal.AnalysisResult
	if err := json.Unmarshal([]byte(game.AiAnalysisData), &ar); err != nil {
		return gin.H{"status": "failed", "has_ai_analysis": false}
	}
	bySeat := make([]gin.H, 0, len(ar.Players))
	for _, p := range ar.Players {
		kyokuScores := make([]gin.H, 0, len(p.Kyoku))
		for _, k := range p.Kyoku {
			kyokuScores = append(kyokuScores, gin.H{
				"kyoku_index": k.KyokuIndex,
				"avg":         k.Avg,
				"grade":       k.Grade,
			})
		}
		bySeat = append(bySeat, gin.H{
			"seat":        p.Seat,
			"match_avg":   p.MatchAvg,
			"match_grade": p.MatchGrade,
			"kyoku":       kyokuScores,
		})
	}
	return gin.H{
		"status":            "done",
		"has_ai_analysis":   true,
		"analyzed_at":       formatTimePointer(game.AiAnalyzedAt),
		"model_tag":         ar.ModelTag,
		"analysis_version":  ar.Version,
		"players":           bySeat,
	}
}

func aiSummaryForViewer(game *models.Game, viewerSeat int) gin.H {
	base := aiSummaryForGame(game)
	if base["has_ai_analysis"] != true {
		return base
	}
	var ar mortal.AnalysisResult
	_ = json.Unmarshal([]byte(game.AiAnalysisData), &ar)
	for _, p := range ar.Players {
		if p.Seat == viewerSeat {
			base["viewer"] = gin.H{
				"seat":        p.Seat,
				"match_avg":   p.MatchAvg,
				"match_grade": p.MatchGrade,
			}
			break
		}
	}
	return base
}

// GameAiAnalysisDetail returns full AI analysis for replay (detail only).
func GameAiAnalysisDetail(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	if err := config.DB.First(&game, "id = ?", pk).Error; err != nil {
		respondError(c, http.StatusNotFound, "对局不存在")
		return
	}
	if !mortal.IsAnalysisDataCurrent(game.AiAnalysisStatus, game.AiAnalysisData) {
		status := game.AiAnalysisStatus
		if status == "done" {
			status = "outdated"
		}
		respondOK(c, gin.H{
			"status":            status,
			"error":             game.AiAnalysisError,
			"has_ai_analysis":   false,
			"analysis_version":  mortal.AnalysisVersion,
			"stored_version":    mortal.StoredAnalysisVersion(game.AiAnalysisData),
		})
		return
	}
	var ar mortal.AnalysisResult
	if err := json.Unmarshal([]byte(game.AiAnalysisData), &ar); err != nil {
		respondError(c, http.StatusInternalServerError, "解析 AI 数据失败")
		return
	}
	respondOK(c, gin.H{
		"status":          "done",
		"has_ai_analysis": true,
		"analyzed_at":     formatTimePointer(game.AiAnalyzedAt),
		"analysis":        ar,
		"grade_tiers":     mortalGradeTiers(),
	})
}

// GameAiAnalysisTrigger manually queues analysis (staff).
func GameAiAnalysisTrigger(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	if err := config.DB.First(&game, "id = ?", pk).Error; err != nil {
		respondError(c, http.StatusNotFound, "对局不存在")
		return
	}
	if game.GameType != "online" || len(paipuActionsFromGameData(game.PaipuData)) == 0 {
		respondError(c, http.StatusBadRequest, "仅支持含 actions 的线上牌谱")
		return
	}
	config.DB.Model(&game).Updates(map[string]interface{}{
		"ai_analysis_status": "pending",
		"ai_analysis_error":  "",
		"ai_analyzed_at":     nil,
	})
	respondOK(c, gin.H{"status": "pending"})
}

// AiGradeTiers returns configurable grade thresholds.
func AiGradeTiers(c *gin.Context) {
	respondOK(c, gin.H{"tiers": mortalGradeTiers()})
}

// AiPaipuStatsRanking returns per-player average AI scores across games.
func AiPaipuStatsRanking(c *gin.Context) {
	minGames := parseQueryInt(c, "min_games", 1)
	var games []models.Game
	config.DB.Where("game_type = ? AND ai_analysis_status = ?", "online", "done").Find(&games)

	type bucket struct {
		sum   float64
		count int
		name  string
	}
	buckets := map[string]*bucket{}

	var accounts []models.MahjongSoulAccount
	config.DB.Where("player_id IS NOT NULL").Find(&accounts)
	uidToPlayer := map[int64]string{}
	playerNames := map[string]string{}
	for _, acc := range accounts {
		if acc.PlayerID != nil {
			uidToPlayer[acc.UID] = *acc.PlayerID
			playerNames[*acc.PlayerID] = acc.Nickname
		}
	}

	for i := range games {
		g := &games[i]
		if !mortal.IsAnalysisDataCurrent(g.AiAnalysisStatus, g.AiAnalysisData) {
			continue
		}
		var ar mortal.AnalysisResult
		if err := json.Unmarshal([]byte(g.AiAnalysisData), &ar); err != nil {
			continue
		}
		playersList := paipuPlayersList(g.PaipuData)
		suMap := seatUIDMap(playersList)
		for _, p := range ar.Players {
			uid, ok := suMap[p.Seat]
			if !ok {
				continue
			}
			pid, ok := uidToPlayer[uid]
			if !ok || pid == "" {
				continue
			}
			b, ok := buckets[pid]
			if !ok {
				b = &bucket{name: playerNames[pid]}
				buckets[pid] = b
			}
			for _, k := range p.Kyoku {
				if len(k.Decisions) > 0 {
					b.sum += float64(k.Avg)
					b.count++
				}
			}
		}
	}

	type row struct {
		PlayerID string  `json:"player_id"`
		Nickname string  `json:"nickname"`
		Avg      float64 `json:"avg"`
		Games    int     `json:"games"`
	}
	var rows []row
	for pid, b := range buckets {
		if b.count < minGames {
			continue
		}
		rows = append(rows, row{
			PlayerID: pid,
			Nickname: b.name,
			Avg:      float64(int(b.sum/float64(b.count)*100)) / 100,
			Games:    b.count,
		})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Avg > rows[j].Avg })
	respondOK(c, rows)
}

// PlayerAiMatchScoreSeries returns chronological match-level AI scores for one player (online paipu with analysis).
func PlayerAiMatchScoreSeries(c *gin.Context) {
	pk := c.Param("pk")
	playerCount := c.Query("player_count")
	gameMode := c.Query("game_mode")
	gameType := c.Query("game_type")
	recentLimit := parseQueryInt(c, "recent_limit", 50)
	if recentLimit != 10 && recentLimit != 20 && recentLimit != 50 && recentLimit != 100 {
		recentLimit = 50
	}

	empty := func() {
		respondOK(c, gin.H{
			"total_games":     0,
			"avg_match_score": nil,
			"series":          []interface{}{},
		})
	}

	if gameType == "offline" {
		empty()
		return
	}

	var gameIDs []string
	q := config.DB.Model(&models.Game{}).
		Where("game_type = ? AND ai_analysis_status = ?", "online", "done")
	if playerCount != "" {
		q = q.Where("player_count = ?", parseQueryInt(c, "player_count", 4))
	}
	if gameMode != "" {
		q = q.Where("game_mode = ?", gameMode)
	}
	q.Pluck("id", &gameIDs)
	if len(gameIDs) == 0 {
		empty()
		return
	}

	var gps []models.GamePlayer
	config.DB.Preload("Game").Where("player_id = ? AND game_id IN ? AND score IS NOT NULL", pk, gameIDs).Find(&gps)
	sort.Slice(gps, func(i, j int) bool {
		gi, gj := gps[i].Game, gps[j].Game
		if gi == nil || gj == nil {
			return false
		}
		ti := gi.StartTime
		if gi.EndTime != nil {
			ti = *gi.EndTime
		}
		tj := gj.StartTime
		if gj.EndTime != nil {
			tj = *gj.EndTime
		}
		if !ti.Equal(tj) {
			return ti.After(tj)
		}
		return gi.CreatedAt.After(gj.CreatedAt)
	})

	rows := make([]gin.H, 0, len(gps))
	for _, gp := range gps {
		game := gp.Game
		if game == nil {
			continue
		}
		if !mortal.IsAnalysisDataCurrent(game.AiAnalysisStatus, game.AiAnalysisData) {
			continue
		}
		var ar mortal.AnalysisResult
		if err := json.Unmarshal([]byte(game.AiAnalysisData), &ar); err != nil {
			continue
		}
		matchAvg := 0
		matchGrade := ""
		found := false
		for _, p := range ar.Players {
			if p.Seat == gp.SeatNumber {
				matchAvg = p.MatchAvg
				matchGrade = p.MatchGrade
				found = true
				break
			}
		}
		if !found {
			continue
		}
		ti := game.StartTime
		if game.EndTime != nil {
			ti = *game.EndTime
		}
		rows = append(rows, gin.H{
			"game_id":      game.ID,
			"start_time":   formatTime(ti),
			"match_avg":    matchAvg,
			"match_grade":  matchGrade,
			"player_count": game.PlayerCount,
			"game_mode":    game.GameMode,
			"game_type":    game.GameType,
		})
	}

	if len(rows) == 0 {
		empty()
		return
	}

	recent := rows
	if len(recent) > recentLimit {
		recent = recent[:recentLimit]
	}

	chrono := make([]gin.H, len(recent))
	for i, r := range recent {
		chrono[len(recent)-1-i] = r
	}

	series := make([]gin.H, 0, len(chrono))
	sum := 0
	for idx, r := range chrono {
		avg, _ := r["match_avg"].(int)
		sum += avg
		series = append(series, gin.H{
			"game_index":   idx,
			"game_id":      r["game_id"],
			"start_time":   r["start_time"],
			"match_avg":    r["match_avg"],
			"match_grade":  r["match_grade"],
			"player_count": r["player_count"],
			"game_mode":    r["game_mode"],
			"game_type":    r["game_type"],
		})
	}

	avgScore := math.Round(float64(sum)/float64(len(chrono))*100) / 100
	respondOK(c, gin.H{
		"total_games":     len(chrono),
		"avg_match_score": avgScore,
		"series":          series,
	})
}
