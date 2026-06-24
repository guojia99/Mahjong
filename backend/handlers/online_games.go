package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/majsoulpaipu"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func majsoulPaipuClient() (*majsoulpaipu.Client, error) {
	return majsoulpaipu.NewClientFromConfig(config.ConfigFilePath, majsoulpaipu.AuthConfig{
		Account:         config.Cfg.MajsoulAccount,
		Password:        config.Cfg.MajsoulPassword,
		AccessToken:     config.Cfg.MajsoulAccessToken,
		OAuth2Type:      config.Cfg.MajsoulOAuth2Type,
		LoginRequestB64: config.Cfg.MajsoulLoginRequestB64,
	})
}

func buildOnlinePlayersInfo(rows []majsoulpaipu.PlayerRow) []gin.H {
	uidList := make([]int64, 0, len(rows))
	for _, p := range rows {
		uidList = append(uidList, p.UID)
	}
	var accounts []models.MahjongSoulAccount
	if len(uidList) > 0 {
		config.DB.Where("uid IN ?", uidList).Preload("Player").Find(&accounts)
	}
	uidToAccount := make(map[int64]*models.MahjongSoulAccount, len(accounts))
	for i := range accounts {
		uidToAccount[accounts[i].UID] = &accounts[i]
	}
	out := make([]gin.H, 0, len(rows))
	for _, p := range rows {
		account := uidToAccount[p.UID]
		var playerID, accountID interface{}
		isBound := false
		if account != nil {
			accountID = account.ID
			if account.PlayerID != nil && *account.PlayerID != "" {
				playerID = *account.PlayerID
				isBound = true
			}
		}
		out = append(out, gin.H{
			"seat":        p.Seat,
			"uid":         p.UID,
			"nickname":    p.Nickname,
			"score":       p.Score,
			"player_id":   playerID,
			"account_id":  accountID,
			"is_bound":    isBound,
		})
	}
	return out
}

func onlineParsePayload(result *majsoulpaipu.AnalyzeResult, sourceURL string) gin.H {
	var count int64
	config.DB.Model(&models.Game{}).Where("game_type = ? AND source_url = ?", "online", sourceURL).Count(&count)
	return gin.H{
		"uuid":              result.UUID,
		"start_time":        result.StartTime,
		"end_time":          result.EndTime,
		"game_mode":         result.GameMode,
		"player_count":      result.PlayerCount,
		"players":           buildOnlinePlayersInfo(result.Players),
		"source_url":        sourceURL,
		"duplicate_in_db": count > 0,
		"raw_data":          result.RawData,
	}
}

func OnlineGameParse(c *gin.Context) {
	raw := c.Query("url")
	sourceURL := majsoulpaipu.NormalizeInputURL(raw)
	if sourceURL == "" {
		respondError(c, http.StatusBadRequest, "请提供牌谱链接（需包含 https:// 或 http://）")
		return
	}
	client, err := majsoulPaipuClient()
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	result, err := majsoulpaipu.AnalyzeURL(client, sourceURL)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "解析牌谱失败: "+err.Error())
		return
	}
	respondOK(c, onlineParsePayload(result, sourceURL))
}

func OnlineGameParseBatch(c *gin.Context) {
	var req struct {
		URLs []string `json:"urls"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.URLs) == 0 {
		respondError(c, http.StatusBadRequest, "请提供 urls 数组")
		return
	}
	client, err := majsoulPaipuClient()
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	results := make([]gin.H, 0, len(req.URLs))
	for _, u := range req.URLs {
		line := strings.TrimSpace(u)
		if line == "" {
			results = append(results, gin.H{"source_url": "", "ok": false, "error": "空行"})
			continue
		}
		normalized := majsoulpaipu.NormalizeInputURL(line)
		if normalized == "" {
			results = append(results, gin.H{
				"source_url": line,
				"ok":         false,
				"error":      "未识别到有效的 http(s) 牌谱链接",
			})
			continue
		}
		result, err := majsoulpaipu.AnalyzeURL(client, normalized)
		if err != nil {
			results = append(results, gin.H{
				"source_url": normalized,
				"ok":         false,
				"error":      err.Error(),
			})
			continue
		}
		payload := onlineParsePayload(result, normalized)
		results = append(results, gin.H{
			"source_url":        normalized,
			"ok":                true,
			"duplicate_in_db":   payload["duplicate_in_db"],
			"data":              payload,
		})
	}
	respondOK(c, gin.H{"results": results})
}

func OnlineGameImport(c *gin.Context) {
	user := middleware.GetUser(c)
	var req struct {
		RoomID            string                   `json:"room_id"`
		SourceURL         string                   `json:"source_url"`
		AllowDuplicateURL bool                     `json:"allow_duplicate_url"`
		PlayerData        []map[string]interface{} `json:"player_data"`
		GameMode          string                   `json:"game_mode"`
		PlayerCount       int                      `json:"player_count"`
		PaipuData         map[string]interface{}   `json:"paipu_data"`
		StartTime         *string                  `json:"start_time"`
		EndTime           *string                  `json:"end_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	var room models.Room
	if err := config.DB.Where("id = ?", req.RoomID).First(&room).Error; err != nil {
		respondError(c, http.StatusNotFound, "Room not found")
		return
	}
	if room.RoomType != "online" {
		respondError(c, http.StatusBadRequest, "请选择「线上场」房间")
		return
	}
	if room.Status != "open" {
		respondError(c, http.StatusBadRequest, "房间已关闭，无法导入")
		return
	}
	sourceURL := majsoulpaipu.NormalizeInputURL(req.SourceURL)
	if sourceURL != "" && !req.AllowDuplicateURL {
		var count int64
		config.DB.Model(&models.Game{}).Where("game_type = ? AND source_url = ?", "online", sourceURL).Count(&count)
		if count > 0 {
			respondError(c, http.StatusBadRequest, "该牌谱链接已在系统中存在对局。若仍要再导入一条记录，请在导入页勾选「仍导入本条」后重试。")
			return
		}
	}
	playerCount := req.PlayerCount
	if playerCount == 0 {
		playerCount = len(req.PlayerData)
	}
	startTime := room.SessionTime
	if startTime == nil {
		now := timeNowLocal()
		startTime = &now
	}
	if req.StartTime != nil && *req.StartTime != "" {
		if t, ok := parseTimeString(*req.StartTime); ok {
			startTime = &t
		}
	}
	var endTime *time.Time
	if req.EndTime != nil && *req.EndTime != "" {
		if t, ok := parseTimeString(*req.EndTime); ok {
			endTime = &t
		}
	}
	paipuData := req.PaipuData
	if paipuData == nil {
		paipuData = map[string]interface{}{}
	}
	ensureMajsoulRecordDetail(paipuData)
	paipuField, err := models.NewJSONField(paipuData)
	if err != nil {
		respondError(c, http.StatusBadRequest, "invalid paipu_data")
		return
	}
	gameMode := req.GameMode
	if gameMode == "" {
		gameMode = "half_match"
	}
	var createdByID *uint64
	if user != nil {
		createdByID = &user.ID
	}
	aiStatus := ""
	if len(paipuActionsFromGameData(paipuField)) > 0 {
		aiStatus = "pending"
	}
	game := models.Game{
		ID:               newUUID(),
		RoomID:           &room.ID,
		GameType:         "online",
		GameMode:         gameMode,
		PlayerCount:      playerCount,
		StartTime:        *startTime,
		EndTime:          endTime,
		SourceURL:        sourceURL,
		PaipuData:        paipuField,
		AiAnalysisStatus: aiStatus,
		CreatedByID:      createdByID,
	}
	if err := config.DB.Create(&game).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	for i, pdata := range req.PlayerData {
		playerID, _ := pdata["player_id"].(string)
		if playerID == "" {
			continue
		}
		var player models.Player
		if err := config.DB.Where("id = ?", playerID).First(&player).Error; err != nil {
			continue
		}
		if uidVal := pdata["uid"]; uidVal != nil {
			nick, _ := pdata["majsoul_nickname"].(string)
			if nick == "" {
				nick, _ = pdata["nickname"].(string)
			}
			if err := ensureMajsoulUIDOnPlayer(&player, uidVal, nick); err != nil {
				respondError(c, http.StatusConflict, err.Error())
				return
			}
		}
		var score *int
		if sc, ok := pdata["score"].(float64); ok {
			v := int(sc)
			score = &v
		}
		isDealer := false
		if d, ok := pdata["is_dealer_start"].(bool); ok {
			isDealer = d
		}
		seatNum := i
		if v, ok := pdata["seat_number"].(float64); ok {
			seatNum = int(v)
		} else if v, ok := pdata["seat"].(float64); ok {
			seatNum = int(v)
		}
		gp := models.GamePlayer{
			ID:            newUUID(),
			GameID:        game.ID,
			PlayerID:      player.ID,
			SeatNumber:    seatNum,
			Score:         score,
			IsDealerStart: isDealer,
		}
		config.DB.Create(&gp)
		var rpCount int64
		config.DB.Model(&models.RoomPlayer{}).Where("room_id = ? AND player_id = ?", room.ID, player.ID).Count(&rpCount)
		if rpCount == 0 {
			config.DB.Create(&models.RoomPlayer{ID: newUUID(), RoomID: room.ID, PlayerID: player.ID})
		}
	}
	reloadOnlineGame(&game)
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	respondCreated(c, data)
}

func OnlineGameRetry(c *gin.Context) {
	pk := c.Param("pk")
	var game models.Game
	if err := config.DB.Where("id = ?", pk).First(&game).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if game.GameType != "online" {
		respondError(c, http.StatusBadRequest, "仅线上对局可重新获取")
		return
	}
	if game.SourceURL == "" {
		respondError(c, http.StatusBadRequest, "该对局无牌谱链接，无法重新获取")
		return
	}
	url := majsoulpaipu.NormalizeInputURL(game.SourceURL)
	if url == "" {
		respondError(c, http.StatusBadRequest, "牌谱链接无效")
		return
	}
	client, err := majsoulPaipuClient()
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	records, err := client.FetchRecords([]string{url}, true)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "牌谱获取失败: "+err.Error())
		return
	}
	if len(records) == 0 {
		respondError(c, http.StatusNotFound, "未获取到牌谱数据")
		return
	}
	rec := records[0]
	gameUUID := majsoulpaipu.ExtractUUID(game.SourceURL)
	detailOK, detailErrors := majsoulpaipu.ValidateDetailRecord(rec, gameUUID)
	detailBlob := majsoulpaipu.BuildRecordDetailBlob(rec, detailOK, detailErrors)
	pd := game.PaipuData.AsMap()
	if pd == nil {
		pd = map[string]interface{}{}
	}
	pd["retry_source"] = "majsoul_local_node"
	pd["retry_uuid"] = rec["uuid"]
	pd["retry_start_time"] = rec["start_time"]
	pd["retry_end_time"] = rec["end_time"]
	pd["retry_players"] = rec["players"]
	pd["majsoul_record_detail"] = detailBlob
	if t := majsoulpaipu.TimestampToTime(rec["start_time"]); t != nil {
		game.StartTime = *t
	}
	if t := majsoulpaipu.TimestampToTime(rec["end_time"]); t != nil {
		game.EndTime = t
	}
	field, err := models.NewJSONField(pd)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "failed to encode paipu_data")
		return
	}
	game.PaipuData = field
	config.DB.Save(&game)
	reloadOnlineGame(&game)
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	data["paipu_detail_validation"] = gin.H{"ok": detailOK, "errors": detailErrors}
	respondOK(c, data)
}

func ensureMajsoulRecordDetail(paipuData map[string]interface{}) {
	detail, _ := paipuData["detail"].(bool)
	if !detail {
		return
	}
	if _, ok := paipuData["majsoul_record_detail"]; ok {
		return
	}
	if paipuData["actions"] == nil {
		return
	}
	valid, _ := paipuData["validation_ok"].(bool)
	errs, _ := paipuData["validation_errors"].([]interface{})
	valErrors := make([]string, 0, len(errs))
	for _, e := range errs {
		if s, ok := e.(string); ok {
			valErrors = append(valErrors, s)
		}
	}
	rec := map[string]interface{}{
		"uuid":       paipuData["uuid"],
		"start_time": paipuData["start_time"],
		"end_time":   paipuData["end_time"],
		"players":    paipuData["players"],
		"result":     paipuData["result"],
		"actions":    paipuData["actions"],
	}
	paipuData["majsoul_record_detail"] = majsoulpaipu.BuildRecordDetailBlob(rec, valid, valErrors)
}

func ensureMajsoulUIDOnPlayer(player *models.Player, uidVal interface{}, nickname string) error {
	uid := int64(0)
	switch x := uidVal.(type) {
	case float64:
		uid = int64(x)
	case int:
		uid = int64(x)
	case int64:
		uid = x
	default:
		return fmt.Errorf("无效的雀魂 UID")
	}
	nickname = strings.TrimSpace(nickname)
	if len(nickname) > 50 {
		nickname = nickname[:50]
	}
	var existing models.MahjongSoulAccount
	if err := config.DB.Where("uid = ?", uid).First(&existing).Error; err == nil {
		if existing.PlayerID != nil && *existing.PlayerID == player.ID {
			if nickname != "" && existing.Nickname != nickname {
				config.DB.Model(&existing).Update("nickname", nickname)
			}
			return nil
		}
		return fmt.Errorf("该雀魂 UID 已绑定其他雀士，无法随对局导入写入")
	}
	acc := models.MahjongSoulAccount{
		ID:       newUUID(),
		PlayerID: &player.ID,
		UID:      uid,
		Nickname: nickname,
	}
	return config.DB.Create(&acc).Error
}

func reloadOnlineGame(game *models.Game) {
	config.DB.Preload("GamePlayers.Player.MajsoulAccounts").
		Preload("HandRecords.Player").
		Preload("Room").
		Preload("LeagueMatch.Stage.Season.Series").
		First(game, "id = ?", game.ID)
}

func timeNowLocal() time.Time {
	return time.Now().In(time.Local)
}
