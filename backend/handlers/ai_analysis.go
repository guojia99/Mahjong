package handlers

import (
	"encoding/json"
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
