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
	manualCompanions := companions
	if len(manualCompanions) > 0 && !stage.AllowCompanion {
		respondError(c, http.StatusBadRequest, "当前赛段未开放陪打")
		return
	}
	if len(manualCompanions) > leagueMaxManualCompanionsOffline {
		respondError(c, http.StatusBadRequest, fmt.Sprintf("陪打选手最多 %d 名", leagueMaxManualCompanionsOffline))
		return
	}
	companions, _, err := leagueCompanionPlayersForScheduled(&stage, pk, scheduled, manualCompanions, leagueMaxManualCompanionsOffline)
	if err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
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

	leagueRecalculateStagePT(pk)
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

	manualCompanions := req.CompanionPlayers
	if manualCompanions == nil {
		manualCompanions = []string{}
	}

	plan, err := leagueBuildOnlineImportPlan(&stage, pk, req.SourceURL, req.AllowDuplicateURL, manualCompanions)
	if err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	stagePlayerIDs := leagueLoadStagePlayerIDs(pk)
	if err := leagueValidateCompanions(stagePlayerIDs, plan.scheduledIDs, plan.companions); err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	var createdByID *uint64
	if user != nil {
		createdByID = &user.ID
	}

	gameID := newUUID()
	game := models.Game{
		ID:               gameID,
		GameType:         "online",
		GameMode:         plan.gameMode,
		PlayerCount:      plan.playerCount,
		StartTime:        plan.startTime,
		EndTime:          plan.endTime,
		SourceURL:        plan.normalizedURL,
		PaipuData:        plan.paipuField,
		AiAnalysisStatus: plan.aiStatus,
		CreatedByID:      createdByID,
	}
	if err := config.DB.Create(&game).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	for i, row := range plan.sortedRows {
		player := plan.uidToPlayer[row.UID]
		_ = ensureMajsoulUIDOnPlayer(player, row.UID, row.Nickname)
		score := row.Score
		config.DB.Create(&models.GamePlayer{
			ID:            newUUID(),
			GameID:        gameID,
			PlayerID:      player.ID,
			SeatNumber:    i,
			Score:         &score,
			IsDealerStart: i == 0,
		})
	}

	match := models.LeagueMatch{
		ID:               newUUID(),
		StageID:          pk,
		GameID:           &gameID,
		MatchLabel:       req.MatchLabel,
		RoundIndex:       req.RoundIndex,
		TableIndex:       req.TableIndex,
		ScheduledPlayers: leagueStringListToJSONField(plan.scheduledIDs),
		CompanionPlayers: leagueStringListToJSONField(plan.companions),
	}
	if err := config.DB.Create(&match).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	config.DB.Preload("GamePlayers").First(&game, "id = ?", gameID)
	leagueMaybeSettleRanking(&stage, &game)

	leagueRecalculateStagePT(pk)
	reloadLeagueMatch(&match)
	respondCreated(c, serializeLeagueMatch(&match))
}

func LeaguePreviewOnlineMatch(c *gin.Context) {
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
		SourceURL         string `json:"source_url"`
		AllowDuplicateURL bool   `json:"allow_duplicate_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	plan, err := leagueBuildOnlineImportPlan(&stage, pk, req.SourceURL, req.AllowDuplicateURL, nil)
	if err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}

	companionSet := make(map[string]bool, len(plan.companions))
	for _, id := range plan.companions {
		companionSet[id] = true
	}

	players := make([]gin.H, 0, len(plan.sortedRows))
	for _, row := range plan.sortedRows {
		player := plan.uidToPlayer[row.UID]
		gp := plan.gamesPlayed[player.ID]
		players = append(players, gin.H{
			"player_id":        player.ID,
			"nickname":         player.Nickname,
			"uid":              row.UID,
			"seat_number":      row.Seat,
			"score":            row.Score,
			"games_played":     gp,
			"games_per_player": stage.GamesPerPlayer,
			"is_full":          stage.GamesPerPlayer > 0 && gp >= stage.GamesPerPlayer,
			"is_companion":     companionSet[player.ID],
		})
	}

	respondOK(c, gin.H{
		"players":           players,
		"companion_players": plan.companions,
		"game_start_time":   formatTime(plan.startTime),
		"game_end_time":     formatTimePointer(plan.endTime),
		"game_mode":         plan.gameMode,
	})
}

type leagueOnlineImportPlan struct {
	normalizedURL string
	sortedRows    []majsoulpaipu.PlayerRow
	scheduledIDs  []string
	companions    []string
	gamesPlayed   map[string]int
	uidToPlayer   map[int64]*models.Player
	startTime     time.Time
	endTime       *time.Time
	paipuField    models.JSONField
	gameMode      string
	playerCount   int
	aiStatus      string
}

func leagueBuildOnlineImportPlan(
	stage *models.LeagueStage,
	stageID, sourceURL string,
	allowDuplicate bool,
	manualCompanions []string,
) (*leagueOnlineImportPlan, error) {
	normalized := majsoulpaipu.NormalizeInputURL(strings.TrimSpace(sourceURL))
	if normalized == "" {
		return nil, fmt.Errorf("请提供有效的牌谱链接")
	}
	if !allowDuplicate {
		var count int64
		config.DB.Model(&models.Game{}).Where("game_type = ? AND source_url = ?", "online", normalized).Count(&count)
		if count > 0 {
			return nil, fmt.Errorf("该牌谱链接已在系统中存在对局，如需仍录入请勾选「允许重复」")
		}
	}

	client, err := majsoulPaipuClient()
	if err != nil {
		return nil, err
	}
	parsed, err := majsoulpaipu.AnalyzeURL(client, normalized)
	if err != nil {
		return nil, fmt.Errorf("解析牌谱失败: %w", err)
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

	stagePlayerIDs := leagueLoadStagePlayerIDs(stageID)
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
		return nil, fmt.Errorf("以下 UID 尚未绑定到任何雀士，请先在「线上录入」页面完成绑定：%s", strings.Join(parts, ", "))
	}
	if len(notInStageUIDs) > 0 {
		parts := make([]string, 0, len(notInStageUIDs))
		for _, uid := range notInStageUIDs {
			parts = append(parts, fmt.Sprintf("%s(UID:%d)", nickByUID[uid], uid))
		}
		return nil, fmt.Errorf("以下 UID 对应的雀士不在本赛段名单中：%s", strings.Join(parts, ", "))
	}

	sortedRows := make([]majsoulpaipu.PlayerRow, len(parsed.Players))
	copy(sortedRows, parsed.Players)
	sort.Slice(sortedRows, func(i, j int) bool {
		return sortedRows[i].Seat < sortedRows[j].Seat
	})

	scheduledIDs := make([]string, 0, len(sortedRows))
	for _, row := range sortedRows {
		player := uidToPlayer[row.UID]
		scheduledIDs = append(scheduledIDs, player.ID)
	}

	companions, gamesPlayed, err := leagueCompanionPlayersForScheduled(stage, stageID, scheduledIDs, manualCompanions, leagueMaxManualCompanionsOnline)
	if err != nil {
		return nil, err
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
		return nil, fmt.Errorf("invalid paipu_data")
	}

	gameMode := parsed.GameMode
	if gameMode == "" {
		gameMode = "half_match"
	}
	playerCount := parsed.PlayerCount
	if playerCount == 0 {
		playerCount = len(parsed.Players)
	}
	aiStatus := ""
	if len(paipuActionsFromGameData(paipuField)) > 0 {
		aiStatus = "pending"
	}

	return &leagueOnlineImportPlan{
		normalizedURL: normalized,
		sortedRows:    sortedRows,
		scheduledIDs:  scheduledIDs,
		companions:    companions,
		gamesPlayed:   gamesPlayed,
		uidToPlayer:   uidToPlayer,
		startTime:     startTime,
		endTime:       endTime,
		paipuField:    paipuField,
		gameMode:      gameMode,
		playerCount:   playerCount,
		aiStatus:      aiStatus,
	}, nil
}
