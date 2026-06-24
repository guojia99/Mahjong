package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/majsoulpaipu"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func leagueEnsureStageOngoing(stage *models.LeagueStage) error {
	if stage.Status != "ongoing" {
		return fmt.Errorf("仅进行中的赛段可以录入对局")
	}
	return nil
}

func leagueLoadStagePlayerIDs(stageID string) map[string]bool {
	var ids []string
	config.DB.Model(&models.LeagueStagePlayer{}).Where("stage_id = ?", stageID).Pluck("player_id", &ids)
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return set
}

func leagueValidateCompanions(stagePlayerIDs map[string]bool, scheduledPlayerIDs, companionIDs []string) error {
	scheduledSet := make(map[string]bool, len(scheduledPlayerIDs))
	for _, id := range scheduledPlayerIDs {
		scheduledSet[id] = true
	}
	for _, cid := range companionIDs {
		if !scheduledSet[cid] {
			return fmt.Errorf("陪打选手必须是该桌对局选手之一")
		}
	}
	if len(stagePlayerIDs) == 0 {
		return nil
	}
	for _, sid := range scheduledPlayerIDs {
		isCompanion := false
		for _, cid := range companionIDs {
			if sid == cid {
				isCompanion = true
				break
			}
		}
		if isCompanion {
			continue
		}
		if !stagePlayerIDs[sid] {
			return fmt.Errorf("选手不在本赛段名单中")
		}
	}
	return nil
}

func leagueSubmitGameScores(gameID string, scores []struct {
	PlayerID      string `json:"player_id"`
	Score         int    `json:"score"`
	IsDealerStart bool   `json:"is_dealer_start"`
	SeatNumber    *int   `json:"seat_number"`
}) error {
	if len(scores) == 0 {
		return nil
	}
	playerIDs := make(map[string]bool, len(scores))
	total := 0
	for _, s := range scores {
		if playerIDs[s.PlayerID] {
			return fmt.Errorf("对局选手不能重复")
		}
		playerIDs[s.PlayerID] = true
		total += s.Score
	}
	pc := len(scores)
	if pc == 4 && total != 1000 {
		return fmt.Errorf("4 人分数之和必须为 1000")
	}
	if pc == 3 && total != 1050 {
		return fmt.Errorf("3 人分数之和必须为 1050")
	}
	hasDealer := false
	for _, s := range scores {
		if s.IsDealerStart {
			hasDealer = true
			break
		}
	}
	if !hasDealer && len(scores) > 0 {
		scores[0].IsDealerStart = true
	}
	for _, s := range scores {
		updates := map[string]interface{}{
			"score":           s.Score,
			"is_dealer_start": s.IsDealerStart,
		}
		if s.SeatNumber != nil {
			updates["seat_number"] = *s.SeatNumber
		}
		config.DB.Model(&models.GamePlayer{}).
			Where("game_id = ? AND player_id = ?", gameID, s.PlayerID).
			Updates(updates)
	}
	return nil
}

func reloadLeagueMatch(match *models.LeagueMatch) {
	config.DB.Preload("Game.GamePlayers.Player").First(match, "id = ?", match.ID)
}

func leagueMaybeSettleRanking(stage *models.LeagueStage, game *models.Game) {
	if !stage.RecordRanking {
		return
	}
	var tiers []models.RankTier
	config.DB.Order("level_order").Find(&tiers)
	if len(tiers) > 0 {
		settleGameRankingInternal(game, tiers)
	}
}

func LeagueCreateOfflineMatch(c *gin.Context) {
	user := middleware.GetUser(c)
	pk := c.Param("pk")
	var stage models.LeagueStage
	if err := config.DB.Where("id = ?", pk).First(&stage).Error; err != nil {
		respondError(c, http.StatusNotFound, "Stage not found")
		return
	}
	if err := leagueEnsureStageOngoing(&stage); err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	var req struct {
		ScheduledPlayers []string `json:"scheduled_players"`
		Scores           []struct {
			PlayerID      string `json:"player_id"`
			Score         int    `json:"score"`
			IsDealerStart bool   `json:"is_dealer_start"`
			SeatNumber    *int   `json:"seat_number"`
		} `json:"scores"`
		StartTime        *string  `json:"start_time"`
		EndTime          *string  `json:"end_time"`
		GameMode         string   `json:"game_mode"`
		MatchLabel       string   `json:"match_label"`
		RoundIndex       int      `json:"round_index"`
		TableIndex       int      `json:"table_index"`
		CompanionPlayers []string `json:"companion_players"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	scheduled := req.ScheduledPlayers
	if scheduled == nil {
		scheduled = []string{}
	}
	companions := req.CompanionPlayers
	if companions == nil {
		companions = []string{}
	}
	if len(scheduled) != 3 && len(scheduled) != 4 {
		respondError(c, http.StatusBadRequest, "对局选手必须为 3 或 4 人")
		return
	}
	seen := make(map[string]bool, len(scheduled))
	for _, id := range scheduled {
		if seen[id] {
			respondError(c, http.StatusBadRequest, "对局选手不能重复")
			return
		}
		seen[id] = true
	}
	if len(companions) > 0 && !stage.AllowCompanion {
		respondError(c, http.StatusBadRequest, "当前赛段未开放陪打")
		return
	}
	if len(companions) > 2 {
		respondError(c, http.StatusBadRequest, "陪打选手最多 2 名")
		return
	}
	stagePlayerIDs := leagueLoadStagePlayerIDs(pk)
	if err := leagueValidateCompanions(stagePlayerIDs, scheduled, companions); err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	startTime := timeNowLocal()
	if req.StartTime != nil && *req.StartTime != "" {
		if t, ok := parseTimeString(*req.StartTime); ok {
			startTime = t
		}
	}
	var endTime *time.Time
	if req.EndTime != nil && *req.EndTime != "" {
		if t, ok := parseTimeString(*req.EndTime); ok {
			endTime = &t
		}
	}

	gameMode := req.GameMode
	if gameMode == "" {
		gameMode = "half_match"
	}
	var createdByID *uint64
	if user != nil {
		createdByID = &user.ID
	}
	gameID := newUUID()
	game := models.Game{
		ID:          gameID,
		GameType:    "offline",
		GameMode:    gameMode,
		PlayerCount: len(scheduled),
		StartTime:   startTime,
		EndTime:     endTime,
		CreatedByID: createdByID,
	}
	if err := config.DB.Create(&game).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	for i, pid := range scheduled {
		config.DB.Create(&models.GamePlayer{
			ID:         newUUID(),
			GameID:     gameID,
			PlayerID:   pid,
			SeatNumber: i,
		})
	}

	match := models.LeagueMatch{
		ID:               newUUID(),
		StageID:          pk,
		GameID:           &gameID,
		MatchLabel:       req.MatchLabel,
		RoundIndex:       req.RoundIndex,
		TableIndex:       req.TableIndex,
		ScheduledPlayers: leagueStringListToJSONField(scheduled),
		CompanionPlayers: leagueStringListToJSONField(companions),
	}
	if err := config.DB.Create(&match).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	if len(req.Scores) > 0 {
		if err := leagueSubmitGameScores(gameID, req.Scores); err != nil {
			respondError(c, http.StatusBadRequest, err.Error())
			return
		}
		config.DB.Preload("GamePlayers").First(&game, "id = ?", gameID)
		leagueMaybeSettleRanking(&stage, &game)
	}

	reloadLeagueMatch(&match)
	respondCreated(c, serializeLeagueMatch(&match))
}

func LeagueCreateOnlineMatch(c *gin.Context) {
	user := middleware.GetUser(c)
	pk := c.Param("pk")
	var stage models.LeagueStage
	if err := config.DB.Where("id = ?", pk).First(&stage).Error; err != nil {
		respondError(c, http.StatusNotFound, "Stage not found")
		return
	}
	if err := leagueEnsureStageOngoing(&stage); err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	var req struct {
		SourceURL         string   `json:"source_url"`
		AllowDuplicateURL bool     `json:"allow_duplicate_url"`
		MatchLabel        string   `json:"match_label"`
		RoundIndex        int      `json:"round_index"`
		TableIndex        int      `json:"table_index"`
		CompanionPlayers  []string `json:"companion_players"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	normalized := majsoulpaipu.NormalizeInputURL(strings.TrimSpace(req.SourceURL))
	if normalized == "" {
		respondError(c, http.StatusBadRequest, "请提供有效的牌谱链接")
		return
	}
	if !req.AllowDuplicateURL {
		var count int64
		config.DB.Model(&models.Game{}).Where("game_type = ? AND source_url = ?", "online", normalized).Count(&count)
		if count > 0 {
			respondError(c, http.StatusBadRequest, "该牌谱链接已在系统中存在对局，如需仍录入请勾选「允许重复」")
			return
		}
	}

	client, err := majsoulPaipuClient()
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	parsed, err := majsoulpaipu.AnalyzeURL(client, normalized)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "解析牌谱失败: "+err.Error())
		return
	}

	uids := make([]int64, 0, len(parsed.Players))
	nickByUID := make(map[int64]string, len(parsed.Players))
	for _, p := range parsed.Players {
		uids = append(uids, p.UID)
		nickByUID[p.UID] = p.Nickname
	}
	var accounts []models.MahjongSoulAccount
	if len(uids) > 0 {
		config.DB.Where("uid IN ?", uids).Preload("Player").Find(&accounts)
	}
	uidToPlayer := make(map[int64]*models.Player, len(accounts))
	for i := range accounts {
		acc := &accounts[i]
		if acc.PlayerID != nil && *acc.PlayerID != "" && acc.Player != nil {
			uidToPlayer[acc.UID] = acc.Player
		}
	}

	stagePlayerIDs := leagueLoadStagePlayerIDs(pk)
	var missingUIDs, notInStageUIDs []int64
	for _, p := range parsed.Players {
		player := uidToPlayer[p.UID]
		if player == nil {
			missingUIDs = append(missingUIDs, p.UID)
			continue
		}
		if !stagePlayerIDs[player.ID] {
			notInStageUIDs = append(notInStageUIDs, p.UID)
		}
	}
	if len(missingUIDs) > 0 {
		parts := make([]string, 0, len(missingUIDs))
		for _, uid := range missingUIDs {
			parts = append(parts, fmt.Sprintf("%s(UID:%d)", nickByUID[uid], uid))
		}
		respondError(c, http.StatusBadRequest,
			fmt.Sprintf("以下 UID 尚未绑定到任何雀士，请先在「线上录入」页面完成绑定：%s", strings.Join(parts, ", ")))
		return
	}
	if len(notInStageUIDs) > 0 {
		parts := make([]string, 0, len(notInStageUIDs))
		for _, uid := range notInStageUIDs {
			parts = append(parts, fmt.Sprintf("%s(UID:%d)", nickByUID[uid], uid))
		}
		respondError(c, http.StatusBadRequest,
			fmt.Sprintf("以下 UID 对应的雀士不在本赛段名单中：%s", strings.Join(parts, ", ")))
		return
	}

	startTime := timeNowLocal()
	if raw := parsed.RawData; raw != nil {
		if t := majsoulpaipu.TimestampToTime(raw["start_time"]); t != nil {
			startTime = *t
		}
	}
	var endTime *time.Time
	if raw := parsed.RawData; raw != nil {
		endTime = majsoulpaipu.TimestampToTime(raw["end_time"])
	}

	paipuData := parsed.RawData
	if paipuData == nil {
		paipuData = map[string]interface{}{}
	}
	ensureMajsoulRecordDetail(paipuData)
	paipuField, err := models.NewJSONField(paipuData)
	if err != nil {
		respondError(c, http.StatusBadRequest, "invalid paipu_data")
		return
	}

	gameMode := parsed.GameMode
	if gameMode == "" {
		gameMode = "half_match"
	}
	playerCount := parsed.PlayerCount
	if playerCount == 0 {
		playerCount = len(parsed.Players)
	}
	var createdByID *uint64
	if user != nil {
		createdByID = &user.ID
	}
	aiStatus := ""
	if len(paipuActionsFromGameData(paipuField)) > 0 {
		aiStatus = "pending"
	}

	gameID := newUUID()
	game := models.Game{
		ID:               gameID,
		GameType:         "online",
		GameMode:         gameMode,
		PlayerCount:      playerCount,
		StartTime:        startTime,
		EndTime:          endTime,
		SourceURL:        normalized,
		PaipuData:        paipuField,
		AiAnalysisStatus: aiStatus,
		CreatedByID:      createdByID,
	}
	if err := config.DB.Create(&game).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	sortedPlayers := make([]majsoulpaipu.PlayerRow, len(parsed.Players))
	copy(sortedPlayers, parsed.Players)
	sort.Slice(sortedPlayers, func(i, j int) bool {
		return sortedPlayers[i].Seat < sortedPlayers[j].Seat
	})

	scheduledPlayerIDs := make([]string, 0, len(sortedPlayers))
	for i, p := range sortedPlayers {
		player := uidToPlayer[p.UID]
		_ = ensureMajsoulUIDOnPlayer(player, p.UID, p.Nickname)
		score := p.Score
		config.DB.Create(&models.GamePlayer{
			ID:            newUUID(),
			GameID:        gameID,
			PlayerID:      player.ID,
			SeatNumber:    i,
			Score:         &score,
			IsDealerStart: i == 0,
		})
		scheduledPlayerIDs = append(scheduledPlayerIDs, player.ID)
	}

	companions := req.CompanionPlayers
	if companions == nil {
		companions = []string{}
	}

	match := models.LeagueMatch{
		ID:               newUUID(),
		StageID:          pk,
		GameID:           &gameID,
		MatchLabel:       req.MatchLabel,
		RoundIndex:       req.RoundIndex,
		TableIndex:       req.TableIndex,
		ScheduledPlayers: leagueStringListToJSONField(scheduledPlayerIDs),
		CompanionPlayers: leagueStringListToJSONField(companions),
	}
	if err := config.DB.Create(&match).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	config.DB.Preload("GamePlayers").First(&game, "id = ?", gameID)
	leagueMaybeSettleRanking(&stage, &game)

	reloadLeagueMatch(&match)
	respondCreated(c, serializeLeagueMatch(&match))
}
