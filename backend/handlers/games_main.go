package handlers

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func serializeGameList(game *models.Game) gin.H {
	players := make([]gin.H, 0, len(game.GamePlayers))
	for _, gp := range game.GamePlayers {
		pData := gin.H{"id": "", "nickname": ""}
		if gp.Player != nil {
			pData = getPlayerBrief(gp.Player)
		}
		players = append(players, gin.H{
			"player":         pData,
			"seat_number":    gp.SeatNumber,
			"score":          gp.Score,
			"is_dealer_start": gp.IsDealerStart,
		})
	}

	handRecords := make([]gin.H, 0, len(game.HandRecords))
	for _, hr := range game.HandRecords {
		pData := gin.H{"id": "", "nickname": ""}
		if hr.Player != nil {
			pData = getPlayerBrief(hr.Player)
		}
		handRecords = append(handRecords, gin.H{
			"id":            hr.ID,
			"player":        pData,
			"record_type":   hr.RecordType,
			"yakuman_names": hr.YakumanNames,
		})
	}

	hasPaipuData := false
	paipuHasActions := false
	if !game.PaipuData.IsNil() && game.PaipuData.Len() > 0 {
		hasPaipuData = true
		pdMap := game.PaipuData.AsMap()
		if actions, ok := pdMap["actions"]; ok {
			if arr, ok := actions.([]interface{}); ok && len(arr) > 0 {
				paipuHasActions = true
			}
		}
		if !paipuHasActions {
			if nested, ok := pdMap["majsoul_record_detail"]; ok {
				if nestedMap, ok := nested.(map[string]interface{}); ok {
					if actions, ok := nestedMap["actions"]; ok {
						if arr, ok := actions.([]interface{}); ok && len(arr) > 0 {
							paipuHasActions = true
						}
					}
				}
			}
		}
	}

	result := gin.H{
		"id":                game.ID,
		"game_type":         game.GameType,
		"game_mode":         game.GameMode,
		"player_count":      game.PlayerCount,
		"start_time":        formatTime(game.StartTime),
		"end_time":          formatTimePointer(game.EndTime),
		"source_url":        game.SourceURL,
		"has_paipu_data":    hasPaipuData,
		"paipu_has_actions": paipuHasActions,
		"players":           players,
		"is_scored":         game.IsScored(),
		"created_at":        formatTime(game.CreatedAt),
		"hand_records":      handRecords,
		"is_league_game":    game.LeagueMatch != nil,
		"league_series_name": nil,
		"league_season_name": nil,
		"league_stage_name": nil,
		"league_logo_url":   nil,
	}

	if game.LeagueMatch != nil && game.LeagueMatch.Stage != nil {
		st := game.LeagueMatch.Stage
		if st.Season != nil && st.Season.Series != nil {
			s := st.Season.Series
			result["league_series_name"] = s.Name
			result["league_season_name"] = st.Season.Name
			result["league_stage_name"] = st.Name
			if s.LogoAssetID != nil {
				result["league_logo_url"] = "/api/v1/leagues/media/" + *s.LogoAssetID + "/"
			}
		}
	}

	return result
}

func serializeGameDetail(game *models.Game) gin.H {
	data := serializeGameList(game)

	players := make([]gin.H, 0, len(game.GamePlayers))
	for _, gp := range game.GamePlayers {
		pData := gin.H{
			"id": "", "nickname": "", "real_name": "",
			"majsoul_uids": []interface{}{}, "majsoul_accounts": []interface{}{},
		}
		if gp.Player != nil {
			pData = serializePlayerGameDetail(gp.Player)
		}
		players = append(players, gin.H{
			"player":          pData,
			"seat_number":     gp.SeatNumber,
			"score":           gp.Score,
			"is_dealer_start": gp.IsDealerStart,
		})
	}
	data["players"] = players
	data["paipu_data"] = game.PaipuData

	roomInfo := gin.H{"id": nil, "name": nil}
	if game.Room != nil {
		roomInfo = gin.H{"id": game.Room.ID, "name": game.Room.Name}
	}
	data["room"] = roomInfo

	return data
}

func serializePlayerGameDetail(p *models.Player) gin.H {
	uids := make([]int64, 0)
	accounts := make([]gin.H, 0)
	for _, acc := range p.MajsoulAccounts {
		uids = append(uids, acc.UID)
		accounts = append(accounts, gin.H{
			"id":         acc.ID,
			"uid":        acc.UID,
			"nickname":   acc.Nickname,
			"player":     acc.PlayerID,
			"created_at": formatTime(acc.CreatedAt),
		})
	}
	return gin.H{
		"id":               p.ID,
		"nickname":         p.Nickname,
		"real_name":        p.RealName,
		"majsoul_uids":     uids,
		"majsoul_accounts": accounts,
		"created_at":       formatTime(p.CreatedAt),
		"updated_at":       formatTime(p.UpdatedAt),
	}
}

func calculatePT(game *models.Game) map[string]float64 {
	var gps []models.GamePlayer
	config.DB.Where("game_id = ? AND score IS NOT NULL", game.ID).Order("score DESC").Find(&gps)
	if len(gps) == 0 {
		return map[string]float64{}
	}

	baseScore := 250.0
	umaMap := []float64{30, 10, -10, -30}
	if game.PlayerCount == 3 {
		baseScore = 350
		umaMap = []float64{30, 0, -30}
	}

	result := make(map[string]float64)
	for i, gp := range gps {
		if i < len(umaMap) && gp.Score != nil {
			scorePT := float64(*gp.Score-int(baseScore)) / 10.0
			result[gp.PlayerID] = math.Round((scorePT+umaMap[i])*100) / 100
		}
	}
	return result
}

func annotateGamesWithPT(games []models.Game, data []gin.H) {
	gameMap := make(map[string]*models.Game, len(games))
	for i := range games {
		gameMap[games[i].ID] = &games[i]
	}
	for _, item := range data {
		gid, _ := item["id"].(string)
		g := gameMap[gid]
		if g != nil {
			item["pt"] = calculatePT(g)
		}
	}
}

func GameList(c *gin.Context) {
	qs := config.DB.Model(&models.Game{}).
		Where("id IN (SELECT game_id FROM game_players WHERE score IS NOT NULL)")

	if pc := c.Query("player_count"); pc != "" {
		qs = qs.Where("player_count = ?", pc)
	}
	if gm := c.Query("game_mode"); gm != "" {
		qs = qs.Where("game_mode = ?", gm)
	}
	if gt := c.Query("game_type"); gt != "" {
		qs = qs.Where("game_type = ?", gt)
	}
	if lg := c.Query("league"); lg != "" {
		switch lg {
		case "1", "true", "yes":
			qs = qs.Where("id IN (SELECT game_id FROM league_matches)")
		case "0", "false", "no":
			qs = qs.Where("id NOT IN (SELECT game_id FROM league_matches)")
		}
	}

	var total int64
	qs.Count(&total)

	page := parseQueryInt(c, "page", 1)
	pageSize := parseQueryInt(c, "page_size", 20)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 1
	}
	if pageSize > 100 {
		pageSize = 100
	}

	var games []models.Game
	qs.Preload("GamePlayers.Player").
		Preload("HandRecords.Player").
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&games)

	result := make([]gin.H, 0, len(games))
	for i := range games {
		result = append(result, serializeGameList(&games[i]))
	}
	annotateGamesWithPT(games, result)

	respondOK(c, gin.H{
		"count":     total,
		"page":      page,
		"page_size": pageSize,
		"results":   result,
	})
}

func GameDetail(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	if err := config.DB.Preload("GamePlayers.Player").
		Preload("HandRecords.Player").
		Preload("LeagueMatch.Stage.Season.Series").
		Where("id = ?", pk).First(&game).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	respondOK(c, data)
}

func GameUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	if err := config.DB.Where("id = ?", pk).First(&game).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req struct {
		GameMode    string `json:"game_mode"`
		PlayerCount *int   `json:"player_count"`
		StartTime   string `json:"start_time"`
		EndTime     string `json:"end_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	updates := make(map[string]interface{})
	if req.GameMode != "" {
		updates["game_mode"] = req.GameMode
	}
	if req.PlayerCount != nil {
		updates["player_count"] = *req.PlayerCount
	}
	if req.StartTime != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04", req.StartTime, time.Local); err == nil {
			updates["start_time"] = t
		}
	}
	if req.EndTime != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04", req.EndTime, time.Local); err == nil {
			updates["end_time"] = &t
		}
	}
	if len(updates) > 0 {
		config.DB.Model(&game).Updates(updates)
	}
	config.DB.Preload("GamePlayers.Player").
		Preload("HandRecords.Player").
		Preload("LeagueMatch.Stage.Season.Series").
		First(&game, "id = ?", pk)
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	respondOK(c, data)
}

func GameDelete(c *gin.Context) {
	pk := c.Param("pk")
	config.DB.Where("id = ?", pk).Delete(&models.Game{})
	respondNoContent(c)
}

func GameSubmitScores(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	if err := config.DB.Preload("GamePlayers").Where("id = ?", pk).First(&game).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req struct {
		Scores []struct {
			PlayerID     string `json:"player_id"`
			Score        int    `json:"score"`
			IsDealerStart bool  `json:"is_dealer_start"`
			SeatNumber   *int   `json:"seat_number"`
		} `json:"scores"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if len(req.Scores) == 0 {
		respondError(c, http.StatusBadRequest, "No scores provided")
		return
	}
	playerIDs := make(map[string]bool)
	for _, s := range req.Scores {
		if playerIDs[s.PlayerID] {
			respondError(c, http.StatusBadRequest, "Duplicate player")
			return
		}
		playerIDs[s.PlayerID] = true
	}
	total := 0
	for _, s := range req.Scores {
		total += s.Score
	}
	pc := len(req.Scores)
	if pc == 4 && total != 1000 {
		respondError(c, http.StatusUnprocessableEntity, "4-player scores must sum to 1000")
		return
	}
	if pc == 3 && total != 1050 {
		respondError(c, http.StatusUnprocessableEntity, "3-player scores must sum to 1050")
		return
	}
	hasDealer := false
	for _, s := range req.Scores {
		if s.IsDealerStart {
			hasDealer = true
			break
		}
	}
	if !hasDealer {
		req.Scores[0].IsDealerStart = true
	}

	for _, s := range req.Scores {
		config.DB.Model(&models.GamePlayer{}).
			Where("game_id = ? AND player_id = ?", pk, s.PlayerID).
			Updates(map[string]interface{}{
				"score":           s.Score,
				"is_dealer_start": s.IsDealerStart,
				"seat_number":     s.SeatNumber,
			})
	}

	config.DB.Preload("GamePlayers.Player").
		Preload("HandRecords.Player").
		Preload("LeagueMatch.Stage.Season.Series").
		First(&game, "id = ?", pk)
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	respondOK(c, data)
}

func GameUpdatePlayers(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	config.DB.Preload("GamePlayers").Where("id = ?", pk).First(&game)
	if game.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if game.IsScored() {
		respondError(c, http.StatusConflict, "Game already scored")
		return
	}
	var req struct {
		PlayerIDs []string `json:"player_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	config.DB.Where("game_id = ?", pk).Delete(&models.GamePlayer{})
	for i, pid := range req.PlayerIDs {
		gp := models.GamePlayer{
			ID:         newUUID(),
			GameID:     pk,
			PlayerID:   pid,
			SeatNumber: i,
		}
		config.DB.Create(&gp)
	}
	config.DB.Preload("GamePlayers.Player").
		Preload("HandRecords.Player").
		Preload("LeagueMatch.Stage.Season.Series").
		First(&game, "id = ?", pk)
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	respondOK(c, data)
}

func GameShuffleSeats(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	config.DB.Preload("GamePlayers").Where("id = ?", pk).First(&game)
	if game.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if game.IsScored() {
		respondError(c, http.StatusBadRequest, "Game already scored")
		return
	}
	seats := make([]int, len(game.GamePlayers))
	for i := range seats {
		seats[i] = i
	}
	shuffleSlice(seats)
	for i, gp := range game.GamePlayers {
		config.DB.Model(&gp).Update("seat_number", seats[i])
	}
	config.DB.Preload("GamePlayers.Player").
		Preload("HandRecords.Player").
		Preload("LeagueMatch.Stage.Season.Series").
		First(&game, "id = ?", pk)
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	respondOK(c, data)
}

func BindMajsoulAccount(c *gin.Context) {
	var req struct {
		AccountID string `json:"account_id"`
		PlayerID  string `json:"player_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	var account models.MahjongSoulAccount
	if err := config.DB.Where("id = ?", req.AccountID).First(&account).Error; err != nil {
		respondError(c, http.StatusNotFound, "Account not found")
		return
	}
	if account.PlayerID != nil && *account.PlayerID != req.PlayerID {
		respondError(c, http.StatusBadRequest, "Account already bound to another player")
		return
	}
	config.DB.Model(&account).Update("player_id", req.PlayerID)
	config.DB.Preload("Player").First(&account, "id = ?", account.ID)
	respondOK(c, gin.H{
		"id":         account.ID,
		"uid":        account.UID,
		"nickname":   account.Nickname,
		"player":     account.PlayerID,
		"created_at": formatTime(account.CreatedAt),
	})
}

func UnboundMajsoulAccounts(c *gin.Context) {
	uidList := c.QueryArray("uid")
	if len(uidList) == 0 {
		respondOK(c, []interface{}{})
		return
	}
	var accounts []models.MahjongSoulAccount
	config.DB.Where("uid IN ? AND player_id IS NULL", uidList).Find(&accounts)
	result := make([]gin.H, 0, len(accounts))
	for _, acc := range accounts {
		result = append(result, gin.H{
			"id":         acc.ID,
			"uid":        acc.UID,
			"nickname":   acc.Nickname,
			"player":     acc.PlayerID,
			"created_at": formatTime(acc.CreatedAt),
		})
	}
	respondOK(c, result)
}

func PtRanking(c *gin.Context) {
	playerCount := c.Query("player_count")
	gameMode := c.Query("game_mode")
	gameType := c.Query("game_type")

	type ptRow struct {
		PlayerID string
		TotalPT  float64
	}
	ptMap := make(map[string]*ptRow)

	var gps []models.GamePlayer
	qs := config.DB.Where("score IS NOT NULL")
	if playerCount != "" {
		qs = qs.Joins("JOIN games ON games.id = game_players.game_id AND games.player_count = ?", playerCount)
	}
	if gameMode != "" {
		qs = qs.Joins("JOIN games g ON g.id = game_players.game_id AND g.game_mode = ?", gameMode)
	}
	if gameType == "offline" || gameType == "online" {
		qs = qs.Joins("JOIN games g2 ON g2.id = game_players.game_id AND g2.game_type = ?", gameType)
	}
	qs.Find(&gps)

	gameIDs := make(map[string]bool)
	for _, gp := range gps {
		gameIDs[gp.GameID] = true
	}

	idSlice := make([]string, 0, len(gameIDs))
	for id := range gameIDs {
		idSlice = append(idSlice, id)
	}
	var games []models.Game
	config.DB.Where("id IN ?", idSlice).Find(&games)

	for _, game := range games {
		pt := calculatePT(&game)
		for pid, ptv := range pt {
			if _, ok := ptMap[pid]; !ok {
				ptMap[pid] = &ptRow{PlayerID: pid}
			}
			ptMap[pid].TotalPT += ptv
		}
	}

	type rankItem struct {
		ptRow
		GameCount int
	}
	items := make([]rankItem, 0)
	for pid, row := range ptMap {
		var gc int64
		config.DB.Model(&models.GamePlayer{}).Where("player_id = ? AND score IS NOT NULL", pid).Count(&gc)
		items = append(items, rankItem{ptRow: *row, GameCount: int(gc)})
	}

	sort.Slice(items, func(i, j int) bool { return items[i].TotalPT > items[j].TotalPT })

	result := make([]gin.H, 0, len(items))
	for _, item := range items {
		var player models.Player
		config.DB.Where("id = ?", item.PlayerID).First(&player)
		result = append(result, gin.H{
			"player":     getPlayerListData(&player),
			"total_pt":   math.Round(item.TotalPT*100) / 100,
			"game_count": item.GameCount,
		})
	}
	respondOK(c, result)
}

func FunRanking(c *gin.Context) {
	rankType := c.DefaultQuery("rank_type", "1st")
	playerCount := c.Query("player_count")
	gameMode := c.Query("game_mode")
	gameType := c.Query("game_type")
	minGames := parseQueryInt(c, "min_games", 1)

	type playerStat struct {
		Total     int
		Ranks     [5]int
		ScoreSum  int
		HighScore *int
		LowScore  *int
		RankSum   int
		PlayerObj models.Player
	}

	stats := make(map[string]*playerStat)

	var gps []models.GamePlayer
	qs := config.DB.Where("score IS NOT NULL")
	if playerCount != "" {
		qs = qs.Joins("JOIN games ON games.id = game_players.game_id AND games.player_count = ?", playerCount)
	}
	if gameMode != "" {
		qs = qs.Joins("JOIN games g ON g.id = game_players.game_id AND g.game_mode = ?", gameMode)
	}
	if gameType == "offline" || gameType == "online" {
		qs = qs.Joins("JOIN games g2 ON g2.id = game_players.game_id AND g2.game_type = ?", gameType)
	}
	qs.Preload("Player").Find(&gps)

	for _, gp := range gps {
		pid := gp.PlayerID
		if gp.Player == nil {
			continue
		}
		if _, ok := stats[pid]; !ok {
			stats[pid] = &playerStat{PlayerObj: *gp.Player}
		}
		s := stats[pid]
		s.Total++
		if gp.Score != nil {
			s.ScoreSum += *gp.Score
			if s.HighScore == nil || *gp.Score > *s.HighScore {
				hs := *gp.Score
				s.HighScore = &hs
			}
			if s.LowScore == nil || *gp.Score < *s.LowScore {
				ls := *gp.Score
				s.LowScore = &ls
			}
		}
	}

	gameRanks := make(map[string][]struct {
		PID  string
		Rank int
	})
	for _, gp := range gps {
		gid := gp.GameID
		if _, ok := gameRanks[gid]; !ok {
			var gameGPS []models.GamePlayer
			config.DB.Where("game_id = ? AND score IS NOT NULL", gid).Order("score DESC").Find(&gameGPS)
			ranks := make([]struct {
				PID  string
				Rank int
			}, len(gameGPS))
			for i, g := range gameGPS {
				ranks[i] = struct {
					PID  string
					Rank int
				}{g.PlayerID, i + 1}
			}
			gameRanks[gid] = ranks
		}
		rank := 0
		for _, r := range gameRanks[gid] {
			if r.PID == gp.PlayerID {
				rank = r.Rank
				break
			}
		}
		if rank >= 1 && rank <= 4 {
			stats[gp.PlayerID].Ranks[rank]++
			stats[gp.PlayerID].RankSum += rank
		}
	}

	rankKeyMap := map[string]int{"1st": 1, "2nd": 2, "3rd": 3, "4th": 4}
	items := make([]gin.H, 0)
	for pid, s := range stats {
		if s.Total < minGames {
			continue
		}
		item := gin.H{"player_id": pid, "total": s.Total}
		if target, ok := rankKeyMap[rankType]; ok {
			item["rate"] = math.Round(float64(s.Ranks[target])/float64(s.Total)*10000) / 100
			item["count"] = s.Ranks[target]
		} else if rankType == "avg_rank" {
			item["rate"] = math.Round(float64(s.RankSum)/float64(s.Total)*100) / 100
			item["count"] = s.Total
		} else if rankType == "avg_score" {
			item["rate"] = math.Round(float64(s.ScoreSum)/float64(s.Total)*10) / 10
			item["count"] = s.Total
		} else if rankType == "high_score" {
			item["rate"] = s.HighScore
			item["count"] = s.Total
		} else if rankType == "low_score" {
			item["rate"] = s.LowScore
			item["count"] = s.Total
		} else {
			continue
		}
		items = append(items, item)
	}

	reverse := rankType != "avg_rank" && rankType != "low_score"
	sort.Slice(items, func(i, j int) bool {
		ri, _ := items[i]["rate"].(float64)
		rj, _ := items[j]["rate"].(float64)
		if reverse {
			return ri > rj
		}
		return ri < rj
	})

	result := make([]gin.H, 0, len(items))
	for _, item := range items {
		pid, _ := item["player_id"].(string)
		s := stats[pid]
		result = append(result, gin.H{
			"player": getPlayerListData(&s.PlayerObj),
			"rate":   item["rate"],
			"count":  item["count"],
			"total":  item["total"],
		})
	}
	respondOK(c, result)
}

func YakumanList(c *gin.Context) {
	recordType := c.Query("record_type")
	qs := config.DB.Model(&models.HandRecord{}).Order("created_at DESC")
	if recordType != "" {
		qs = qs.Where("record_type = ?", recordType)
	}
	var records []models.HandRecord
	qs.Preload("Player").Preload("Game").Find(&records)
	result := make([]gin.H, 0, len(records))
	for _, hr := range records {
		result = append(result, serializeHandRecordList(&hr))
	}
	respondOK(c, result)
}

func RecentYakuman(c *gin.Context) {
	limit := parseQueryInt(c, "limit", 10)
	recordType := c.Query("record_type")
	qs := config.DB.Model(&models.HandRecord{}).Order("created_at DESC")
	if recordType != "" {
		qs = qs.Where("record_type = ?", recordType)
	}
	var records []models.HandRecord
	qs.Preload("Player").Preload("Game").Limit(limit).Find(&records)
	result := make([]gin.H, 0, len(records))
	for _, hr := range records {
		result = append(result, serializeHandRecordList(&hr))
	}
	respondOK(c, result)
}

func PlayerYakumans(c *gin.Context) {
	pk := c.Param("pk")
	recordType := c.Query("record_type")
	qs := config.DB.Model(&models.HandRecord{}).Where("player_id = ?", pk).Order("created_at DESC")
	if recordType != "" {
		qs = qs.Where("record_type = ?", recordType)
	}
	var records []models.HandRecord
	qs.Preload("Player").Preload("Game").Find(&records)
	result := make([]gin.H, 0, len(records))
	for _, hr := range records {
		result = append(result, serializeHandRecordList(&hr))
	}
	respondOK(c, result)
}

func serializeHandRecordList(hr *models.HandRecord) gin.H {
	gameInfo := gin.H{
		"game_id":    hr.GameID,
		"room_id":    nil,
		"room_name":  nil,
		"game_mode":  "",
		"start_time": "",
	}
	if hr.Game != nil {
		gameInfo["game_id"] = hr.Game.ID
		gameInfo["game_mode"] = hr.Game.GameMode
		gameInfo["start_time"] = formatTime(hr.Game.StartTime)
		if hr.Game.RoomID != nil {
			gameInfo["room_id"] = *hr.Game.RoomID
		}
	}
	pData := gin.H{"id": "", "nickname": ""}
	if hr.Player != nil {
		pData = getPlayerBrief(hr.Player)
	}
	return gin.H{
		"id":            hr.ID,
		"player":        pData,
		"record_type":   hr.RecordType,
		"yakuman_names": hr.YakumanNames,
		"hand_tiles":    hr.HandTiles,
		"melds":         hr.Melds,
		"winning_tile":  hr.WinningTile,
		"win_type":      hr.WinType,
		"created_at":    formatTime(hr.CreatedAt),
		"game_info":     gameInfo,
	}
}

func HandRecordList(c *gin.Context) {
	pk := c.Param("pk")
	var records []models.HandRecord
	config.DB.Preload("Player").Where("game_id = ?", pk).Order("created_at DESC").Find(&records)
	result := make([]gin.H, 0, len(records))
	for _, hr := range records {
		result = append(result, serializeHandRecordList(&hr))
	}
	respondOK(c, result)
}

func HandRecordCreate(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	config.DB.Preload("GamePlayers").Where("id = ?", pk).First(&game)
	if game.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if !game.IsScored() {
		respondError(c, http.StatusBadRequest, "Game not scored")
		return
	}
	var req struct {
		PlayerID     string                   `json:"player_id"`
		RecordType   string                   `json:"record_type"`
		YakumanNames models.JSONField         `json:"yakuman_names"`
		HandTiles    models.JSONField         `json:"hand_tiles"`
		Melds        models.JSONField         `json:"melds"`
		WinningTile  string                   `json:"winning_tile"`
		WinType      string                   `json:"win_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.YakumanNames.Len() == 0 {
		respondError(c, http.StatusBadRequest, "At least one yakuman name required")
		return
	}
	hr := models.HandRecord{
		ID:           newUUID(),
		GameID:       pk,
		PlayerID:     req.PlayerID,
		RecordType:   req.RecordType,
		YakumanNames: req.YakumanNames,
		HandTiles:    req.HandTiles,
		Melds:        req.Melds,
		WinningTile:  req.WinningTile,
		WinType:      req.WinType,
	}
	config.DB.Create(&hr)
	config.DB.Preload("Player").First(&hr, "id = ?", hr.ID)
	respondCreated(c, serializeHandRecordList(&hr))
}

func HandRecordDelete(c *gin.Context) {
	recordPK := c.Param("record_pk")
	config.DB.Where("id = ? AND game_id = ?", recordPK, c.Param("pk")).Delete(&models.HandRecord{})
	respondNoContent(c)
}

func PlayerStats(c *gin.Context) {
	pk := c.Param("pk")
	playerCount := c.Query("player_count")
	gameMode := c.Query("game_mode")
	gameType := c.Query("game_type")
	recentLimit := parseQueryInt(c, "recent_limit", 50)
	if recentLimit != 10 && recentLimit != 20 && recentLimit != 50 && recentLimit != 100 {
		recentLimit = 50
	}

	qs := config.DB.Model(&models.GamePlayer{}).Where("player_id = ? AND score IS NOT NULL", pk)
	if playerCount != "" {
		qs = qs.Joins("JOIN games ON games.id = game_players.game_id AND games.player_count = ?", playerCount)
	}
	if gameMode != "" {
		qs = qs.Joins("JOIN games g ON g.id = game_players.game_id AND g.game_mode = ?", gameMode)
	}
	if gameType == "offline" || gameType == "online" {
		qs = qs.Joins("JOIN games g2 ON g2.id = game_players.game_id AND g2.game_type = ?", gameType)
	}
	qs = qs.Joins("LEFT JOIN games g3 ON g3.id = game_players.game_id").
		Order("COALESCE(g3.end_time, g3.start_time) DESC, g3.created_at DESC")

	var gps []models.GamePlayer
	qs.Preload("Game").Find(&gps)

	totalGames := len(gps)
	if totalGames == 0 {
		respondOK(c, gin.H{
			"total_games":       0,
			"total_pt":          0,
			"rank_distribution": gin.H{},
			"recent_ranking":    []interface{}{},
			"recent_series":     []interface{}{},
		})
		return
	}

	rankDist := map[int]int{1: 0, 2: 0, 3: 0, 4: 0}
	totalPT := 0.0
	rows := make([]gin.H, 0, len(gps))

	for _, gp := range gps {
		game := gp.Game
		if game == nil {
			continue
		}

		var allGPS []models.GamePlayer
		config.DB.Where("game_id = ? AND score IS NOT NULL", game.ID).Order("score DESC").Find(&allGPS)

		rank := len(allGPS)
		for i, g := range allGPS {
			if g.PlayerID == pk {
				rank = i + 1
				break
			}
		}
		if rank >= 1 && rank <= 4 {
			rankDist[rank]++
		}

		pt := calculatePT(game)
		playerPT := pt[pk]
		totalPT += playerPT

		rows = append(rows, gin.H{
			"game_id":      game.ID,
			"start_time":   formatTime(game.StartTime),
			"rank":         rank,
			"pt":           math.Round(playerPT*100) / 100,
			"score":        gp.Score,
			"player_count": game.PlayerCount,
			"game_mode":    game.GameMode,
			"game_type":    game.GameType,
		})
	}

	rankRates := make(map[string]float64)
	for rank, count := range rankDist {
		rate := 0.0
		if totalGames > 0 {
			rate = math.Round(float64(count)/float64(totalGames)*1000) / 10
		}
		rankRates[fmt.Sprintf("%d", rank)] = rate
	}

	recent := rows
	if len(recent) > recentLimit {
		recent = recent[:recentLimit]
	}

	chronological := make([]gin.H, len(recent))
	for i, r := range recent {
		chronological[len(recent)-1-i] = r
	}

	recentSeries := make([]gin.H, 0, len(chronological))
	cum := 0.0
	for idx, r := range chronological {
		ptv, _ := r["pt"].(float64)
		cum += ptv
		series := make(gin.H)
		for k, v := range r {
			series[k] = v
		}
		series["game_index"] = idx
		series["cumulative_pt"] = math.Round(cum*100) / 100
		recentSeries = append(recentSeries, series)
	}

	respondOK(c, gin.H{
		"total_games":       totalGames,
		"total_pt":          math.Round(totalPT*100) / 100,
		"rank_distribution": rankRates,
		"recent_ranking":    recent,
		"recent_series":     recentSeries,
	})
}


