package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"

	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

const leagueImageMaxBytes = 5 << 20

var leagueImageMIMEs = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

func leagueStringListToJSONField(list []string) models.JSONField {
	if list == nil {
		return models.JSONField("null")
	}
	b, _ := json.Marshal(list)
	return models.JSONField(b)
}

func leagueJSONFieldToStringList(jf models.JSONField) []string {
	if jf.IsNil() {
		return nil
	}
	if arr := jf.AsArray(); arr != nil {
		result := make([]string, 0, len(arr))
		for _, item := range arr {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	m := jf.AsMap()
	if m == nil {
		return nil
	}
	if items, ok := m["items"].([]interface{}); ok {
		result := make([]string, 0, len(items))
		for _, item := range items {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	return nil
}

func leagueJSONFieldContains(jf models.JSONField, val string) bool {
	list := leagueJSONFieldToStringList(jf)
	for _, s := range list {
		if s == val {
			return true
		}
	}
	return false
}

func leagueEmptyJSONField() models.JSONField {
	return models.JSONField("{}")
}

func leagueApplySeasonTimeFields(req map[string]interface{}) {
	for _, key := range []string{"start_time", "end_time"} {
		raw, ok := req[key]
		if !ok {
			continue
		}
		if raw == nil {
			req[key] = nil
			continue
		}
		s, ok := raw.(string)
		if !ok || strings.TrimSpace(s) == "" {
			req[key] = nil
			continue
		}
		if t, ok := parseTimeString(s); ok {
			req[key] = t
		} else {
			delete(req, key)
		}
	}
}

// --- Media ---

func leagueMediaURL(assetID string) string {
	return "/api/v1/leagues/media/" + assetID + "/"
}

func readLeagueImageUpload(c *gin.Context, field string) ([]byte, string, error) {
	fh, err := c.FormFile(field)
	if err != nil {
		return nil, "", err
	}
	if fh.Size > leagueImageMaxBytes {
		return nil, "", fmt.Errorf("image too large (max 5MB)")
	}
	f, err := fh.Open()
	if err != nil {
		return nil, "", err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, leagueImageMaxBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) > leagueImageMaxBytes {
		return nil, "", fmt.Errorf("image too large (max 5MB)")
	}
	mimeType := fh.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}
	if !leagueImageMIMEs[mimeType] {
		return nil, "", fmt.Errorf("unsupported image type")
	}
	return data, mimeType, nil
}

func createLeagueImageAsset(data []byte, mimeType string) (*models.LeagueImageAsset, error) {
	asset := models.LeagueImageAsset{
		ID:       newUUID(),
		MimeType: mimeType,
		Data:     data,
	}
	if err := config.DB.Create(&asset).Error; err != nil {
		return nil, err
	}
	return &asset, nil
}

func LeagueMedia(c *gin.Context) {
	pk := c.Param("pk")
	var asset models.LeagueImageAsset
	if err := config.DB.Where("id = ?", pk).First(&asset).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Data(http.StatusOK, asset.MimeType, asset.Data)
}

// --- Series ---

func leagueSeasonIDs(seasons []models.LeagueSeason) []string {
	ids := make([]string, 0, len(seasons))
	for _, s := range seasons {
		if s.ID != "" {
			ids = append(ids, s.ID)
		}
	}
	return ids
}

type leagueCountRow struct {
	ID  string `gorm:"column:id"`
	Cnt int64  `gorm:"column:cnt"`
}

func leagueLoadSeasonPlayerCounts(seasonIDs []string) map[string]int {
	out := make(map[string]int, len(seasonIDs))
	if len(seasonIDs) == 0 {
		return out
	}
	var rows []leagueCountRow
	config.DB.Model(&models.LeagueSeasonPlayer{}).
		Select("season_id AS id, COUNT(*) AS cnt").
		Where("season_id IN ?", seasonIDs).
		Group("season_id").
		Scan(&rows)
	for _, r := range rows {
		out[r.ID] = int(r.Cnt)
	}
	return out
}

func leagueLoadSeasonStageCounts(seasonIDs []string) map[string]int {
	out := make(map[string]int, len(seasonIDs))
	if len(seasonIDs) == 0 {
		return out
	}
	var rows []leagueCountRow
	config.DB.Model(&models.LeagueStage{}).
		Select("season_id AS id, COUNT(*) AS cnt").
		Where("season_id IN ?", seasonIDs).
		Group("season_id").
		Scan(&rows)
	for _, r := range rows {
		out[r.ID] = int(r.Cnt)
	}
	return out
}

func leagueLoadStagePlayerCounts(stageIDs []string) map[string]int {
	out := make(map[string]int, len(stageIDs))
	if len(stageIDs) == 0 {
		return out
	}
	var rows []leagueCountRow
	config.DB.Model(&models.LeagueStagePlayer{}).
		Select("stage_id AS id, COUNT(*) AS cnt").
		Where("stage_id IN ?", stageIDs).
		Group("stage_id").
		Scan(&rows)
	for _, r := range rows {
		out[r.ID] = int(r.Cnt)
	}
	return out
}

func leagueLoadStageGameCounts(stageIDs []string) map[string]int {
	out := make(map[string]int, len(stageIDs))
	if len(stageIDs) == 0 {
		return out
	}
	var rows []leagueCountRow
	config.DB.Model(&models.LeagueMatch{}).
		Select("stage_id AS id, COUNT(*) AS cnt").
		Where("stage_id IN ? AND game_id IS NOT NULL", stageIDs).
		Group("stage_id").
		Scan(&rows)
	for _, r := range rows {
		out[r.ID] = int(r.Cnt)
	}
	return out
}

func leagueSeasonPlayerCount(s *models.LeagueSeason, counted map[string]int) int {
	if len(s.SeasonPlayers) > 0 {
		return len(s.SeasonPlayers)
	}
	if n, ok := counted[s.ID]; ok {
		return n
	}
	return 0
}

func leagueSeasonStageCount(s *models.LeagueSeason, counted map[string]int) int {
	if len(s.Stages) > 0 {
		return len(s.Stages)
	}
	if n, ok := counted[s.ID]; ok {
		return n
	}
	return 0
}

func leagueSeasonSeriesName(s *models.LeagueSeason) string {
	if s.Series != nil {
		return s.Series.Name
	}
	return ""
}

func serializeLeagueSeasonsList(seasons []models.LeagueSeason) []gin.H {
	ids := leagueSeasonIDs(seasons)
	playerCounts := leagueLoadSeasonPlayerCounts(ids)
	stageCounts := leagueLoadSeasonStageCounts(ids)
	result := make([]gin.H, 0, len(seasons))
	for i := range seasons {
		s := &seasons[i]
		result = append(result, serializeLeagueSeason(s, playerCounts, stageCounts))
	}
	return result
}

func LeagueSeriesList(c *gin.Context) {
	var series []models.LeagueSeries
	config.DB.Preload("LogoAsset").Order("created_at DESC").Find(&series)
	result := make([]gin.H, 0, len(series))
	for _, s := range series {
		result = append(result, serializeLeagueSeries(&s))
	}
	respondOK(c, result)
}

func LeagueSeriesCreate(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	s := models.LeagueSeries{
		ID:          newUUID(),
		Name:        req.Name,
		Description: req.Description,
		CreatedByID: &user.ID,
	}
	config.DB.Create(&s)
	respondCreated(c, serializeLeagueSeries(&s))
}

func LeagueSeriesDetail(c *gin.Context) {
	pk := c.Param("pk")
	var s models.LeagueSeries
	config.DB.Preload("LogoAsset").
		Preload("Seasons.Stages").
		Preload("Seasons.SeasonPlayers.Player").
		Where("id = ?", pk).First(&s)
	if s.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	respondOK(c, serializeLeagueSeriesDetail(&s))
}

func LeagueSeriesUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var s models.LeagueSeries
	if err := config.DB.Where("id = ?", pk).First(&s).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if len(req) > 0 {
		config.DB.Model(&s).Updates(req)
	}
	config.DB.Preload("LogoAsset").First(&s, "id = ?", pk)
	respondOK(c, serializeLeagueSeries(&s))
}

func LeagueSeriesDelete(c *gin.Context) {
	pk := c.Param("pk")
	config.DB.Where("id = ?", pk).Delete(&models.LeagueSeries{})
	respondNoContent(c)
}

func serializeLeagueSeries(s *models.LeagueSeries) gin.H {
	data := gin.H{
		"id":          s.ID,
		"name":        s.Name,
		"cover":       s.Cover,
		"description": s.Description,
		"created_at":  formatTime(s.CreatedAt),
		"updated_at":  formatTime(s.UpdatedAt),
	}
	if s.LogoAssetID != nil && *s.LogoAssetID != "" {
		data["logo_url"] = leagueMediaURL(*s.LogoAssetID)
	} else {
		data["logo_url"] = nil
	}
	return data
}

func serializeLeagueSeriesDetail(s *models.LeagueSeries) gin.H {
	data := serializeLeagueSeries(s)
	ids := leagueSeasonIDs(s.Seasons)
	playerCounts := leagueLoadSeasonPlayerCounts(ids)
	stageCounts := leagueLoadSeasonStageCounts(ids)
	seasons := make([]gin.H, 0, len(s.Seasons))
	for i := range s.Seasons {
		season := s.Seasons[i]
		season.Series = s
		seasons = append(seasons, serializeLeagueSeason(&season, playerCounts, stageCounts))
	}
	data["seasons"] = seasons
	return data
}

// --- Season ---

func LeagueSeasonList(c *gin.Context) {
	seriesPK := c.Param("pk")
	var seasons []models.LeagueSeason
	config.DB.Preload("Series").Preload("Stages").
		Where("series_id = ?", seriesPK).Order("season_number DESC").Find(&seasons)
	respondOK(c, serializeLeagueSeasonsList(seasons))
}

func LeagueSeasonCreate(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	seriesPK := c.Param("pk")
	var series models.LeagueSeries
	if err := config.DB.Where("id = ?", seriesPK).First(&series).Error; err != nil {
		respondError(c, http.StatusNotFound, "Series not found")
		return
	}
	var lastSeason models.LeagueSeason
	config.DB.Where("series_id = ?", seriesPK).Order("season_number DESC").First(&lastSeason)
	nextNum := 1
	if lastSeason.ID != "" {
		nextNum = lastSeason.SeasonNumber + 1
	}

	var req struct {
		Name      string `json:"name"`
		IsCurrent bool   `json:"is_current"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.IsCurrent {
		config.DB.Model(&models.LeagueSeason{}).Where("series_id = ?", seriesPK).Update("is_current", false)
	}
	season := models.LeagueSeason{
		ID:           newUUID(),
		SeriesID:     seriesPK,
		SeasonNumber: nextNum,
		Name:         req.Name,
		Status:       "registration",
		IsCurrent:    req.IsCurrent,
		CreatedByID:  &user.ID,
	}
	config.DB.Create(&season)
	respondCreated(c, serializeLeagueSeason(&season, nil, nil))
}

func LeagueSeasonDetail(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	config.DB.Preload("Series").
		Preload("Stages").
		Preload("SeasonPlayers.Player").
		Where("id = ?", pk).First(&season)
	if season.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	respondOK(c, serializeLeagueSeasonDetailFull(&season))
}

func LeagueSeasonUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	if err := config.DB.Where("id = ?", pk).First(&season).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	leagueApplySeasonTimeFields(req)
	if isCurrent, ok := req["is_current"].(bool); ok && isCurrent && !season.IsCurrent {
		config.DB.Model(&models.LeagueSeason{}).
			Where("series_id = ? AND id != ?", season.SeriesID, pk).
			Update("is_current", false)
	}
	if len(req) > 0 {
		config.DB.Model(&season).Updates(req)
	}
	config.DB.Preload("Series").Preload("Stages").Preload("SeasonPlayers.Player").
		Where("id = ?", pk).First(&season)
	respondOK(c, serializeLeagueSeasonDetailFull(&season))
}

func LeagueSeasonDelete(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	if err := config.DB.Where("id = ?", pk).First(&season).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if season.Status != "registration" {
		respondError(c, http.StatusBadRequest, "Cannot delete started season")
		return
	}
	config.DB.Where("id = ?", pk).Delete(&models.LeagueSeason{})
	respondNoContent(c)
}

func LeagueSeasonStart(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	if err := config.DB.Preload("SeasonPlayers").Where("id = ?", pk).First(&season).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	config.DB.Model(&season).Update("status", "ongoing")

	for idx, sp := range season.SeasonPlayers {
		if sp.SeedLabel == "" {
			label := leagueSeedLabelFor(idx)
			config.DB.Model(&sp).Update("seed_label", label)
		}
	}

	var firstStage models.LeagueStage
	config.DB.Where("season_id = ?", pk).Order("`order`").First(&firstStage)
	if firstStage.ID != "" && !leagueStageHasPlayers(firstStage.ID) {
		leagueSyncStagePlayersFromSeason(firstStage.ID)
	}

	config.DB.Preload("Series").Preload("Stages").Where("id = ?", pk).First(&season)
	respondOK(c, serializeLeagueSeason(&season, nil, nil))
}

func LeagueSeasonFinish(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	if err := config.DB.Where("id = ?", pk).First(&season).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	config.DB.Model(&season).Update("status", "finished")
	config.DB.Preload("Series").Preload("Stages").Where("id = ?", pk).First(&season)
	respondOK(c, serializeLeagueSeason(&season, nil, nil))
}

func LeagueSeasonReopen(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	if err := config.DB.Where("id = ?", pk).First(&season).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	config.DB.Model(&season).Update("status", "registration")
	config.DB.Preload("Series").Preload("Stages").Where("id = ?", pk).First(&season)
	respondOK(c, serializeLeagueSeason(&season, nil, nil))
}

// --- Season Players ---

func LeagueSeasonPlayers(c *gin.Context) {
	pk := c.Param("pk")
	var sps []models.LeagueSeasonPlayer
	config.DB.Preload("Player").Where("season_id = ?", pk).Order("joined_at").Find(&sps)
	result := make([]gin.H, 0, len(sps))
	for _, sp := range sps {
		pData := gin.H{}
		if sp.Player != nil {
			pData = getPlayerListData(sp.Player)
		}
		result = append(result, gin.H{
			"id":         sp.ID,
			"season_id":  sp.SeasonID,
			"player":     pData,
			"seed_label": sp.SeedLabel,
			"joined_at":  formatTime(sp.JoinedAt),
		})
	}
	respondOK(c, result)
}

func LeagueRegisterPlayer(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	config.DB.Where("id = ?", pk).First(&season)
	if season.ID == "" {
		respondError(c, http.StatusNotFound, "Season not found")
		return
	}
	var req struct {
		PlayerID string `json:"player_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	var existing models.LeagueSeasonPlayer
	if err := config.DB.Where("season_id = ? AND player_id = ?", pk, req.PlayerID).First(&existing).Error; err == nil {
		respondError(c, http.StatusBadRequest, "Player already registered")
		return
	}
	sp := models.LeagueSeasonPlayer{
		ID:       newUUID(),
		SeasonID: pk,
		PlayerID: req.PlayerID,
	}
	config.DB.Create(&sp)
	respondCreated(c, gin.H{
		"id":         sp.ID,
		"season_id":  sp.SeasonID,
		"player_id":  sp.PlayerID,
		"seed_label": sp.SeedLabel,
		"joined_at":  formatTime(sp.JoinedAt),
	})
}

func LeagueBatchRegister(c *gin.Context) {
	pk := c.Param("pk")
	var req struct {
		PlayerIDs []string `json:"player_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	count := 0
	for _, pid := range req.PlayerIDs {
		var existing models.LeagueSeasonPlayer
		if err := config.DB.Where("season_id = ? AND player_id = ?", pk, pid).First(&existing).Error; err == nil {
			continue
		}
		sp := models.LeagueSeasonPlayer{ID: newUUID(), SeasonID: pk, PlayerID: pid}
		if err := config.DB.Create(&sp).Error; err == nil {
			count++
		}
	}
	respondOK(c, gin.H{"registered": count})
}

func LeagueUnregisterPlayer(c *gin.Context) {
	pk := c.Param("pk")
	var req struct {
		PlayerID string `json:"player_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	config.DB.Where("season_id = ? AND player_id = ?", pk, req.PlayerID).Delete(&models.LeagueSeasonPlayer{})
	respondNoContent(c)
}

// --- Stages ---

func LeagueStageList(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	config.DB.Select("id, status").Where("id = ?", pk).First(&season)
	var stages []models.LeagueStage
	config.DB.Where("season_id = ?", pk).Order("`order`").Find(&stages)
	stageIDs := make([]string, 0, len(stages))
	for _, s := range stages {
		stageIDs = append(stageIDs, s.ID)
	}
	playerCounts := leagueLoadStagePlayerCounts(stageIDs)
	gameCounts := leagueLoadStageGameCounts(stageIDs)
	result := make([]gin.H, 0, len(stages))
	for i := range stages {
		stages[i].Season = &season
		result = append(result, serializeLeagueStage(&stages[i], playerCounts, gameCounts))
	}
	respondOK(c, result)
}

func LeagueCreateStage(c *gin.Context) {
	pk := c.Param("pk")
	var season models.LeagueSeason
	config.DB.Where("id = ?", pk).First(&season)
	if season.Status != "registration" {
		respondError(c, http.StatusBadRequest, "Season already started")
		return
	}
	var lastStage models.LeagueStage
	config.DB.Where("season_id = ?", pk).Order("`order` DESC").First(&lastStage)
	nextOrder := 1
	if lastStage.ID != "" {
		nextOrder = lastStage.Order + 1
	}
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req["id"] = newUUID()
	req["season_id"] = pk
	req["`order`"] = nextOrder
	if req["status"] == nil {
		req["status"] = "pending"
	}
	if req["promotion_rules"] == nil {
		req["promotion_rules"] = "{}"
	}
	if err := config.DB.Model(&models.LeagueStage{}).Create(req).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to create stage: "+err.Error())
		return
	}
	respondOK(c, gin.H{"message": "Stage created"})
}

func LeagueStageDetail(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Preload("Season.Series").
		Preload("StagePlayers.Player").
		Preload("Matches").
		Where("id = ?", pk).First(&stage)
	if stage.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	respondOK(c, serializeLeagueStageDetail(&stage))
}

func LeagueStageUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Preload("Season").Where("id = ?", pk).First(&stage)
	if stage.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if stage.Season.Status != "registration" {
		unlocked := map[string]bool{
			"name": true, "notes": true, "allow_companion": true,
			"allow_free_table": true, "record_ranking": true, "promotion_rules": true,
		}
		for key := range req {
			if !unlocked[key] {
				respondError(c, http.StatusBadRequest, "Cannot modify "+key+" after season start")
				return
			}
		}
	}
	if len(req) > 0 {
		config.DB.Model(&stage).Updates(req)
	}
	config.DB.Preload("Season.Series").First(&stage, "id = ?", pk)
	respondOK(c, serializeLeagueStage(&stage, nil, nil))
}

func LeagueStageDelete(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Preload("Season").Where("id = ?", pk).First(&stage)
	if stage.Season.Status != "registration" {
		respondError(c, http.StatusBadRequest, "Cannot delete after season start")
		return
	}
	config.DB.Where("id = ?", pk).Delete(&models.LeagueStage{})
	respondNoContent(c)
}

func LeagueStageStart(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Preload("Season").Where("id = ?", pk).First(&stage)
	if stage.ID == "" {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	config.DB.Model(&stage).Update("status", "ongoing")
	if !leagueStageHasPlayers(stage.ID) && stage.Order == 1 {
		leagueSyncStagePlayersFromSeason(stage.ID)
	}
	config.DB.Preload("Season").First(&stage, "id = ?", pk)
	respondOK(c, serializeLeagueStageDetail(&stage))
}

func LeagueStageFinish(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	if err := config.DB.Where("id = ?", pk).First(&stage).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	leagueRecalculateStagePT(stage.ID)
	config.DB.Model(&stage).Update("status", "finished")
	config.DB.Preload("Season.Series").First(&stage, "id = ?", pk)
	respondOK(c, serializeLeagueStage(&stage, nil, nil))
}

func LeagueStageReopen(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	if err := config.DB.Where("id = ?", pk).First(&stage).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	config.DB.Model(&stage).Update("status", "pending")
	config.DB.Preload("Season.Series").First(&stage, "id = ?", pk)
	respondOK(c, serializeLeagueStageDetail(&stage))
}

// --- Stage Players ---

func LeagueStagePlayers(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	gpp := 0
	if err := config.DB.Select("games_per_player").Where("id = ?", pk).First(&stage).Error; err == nil {
		gpp = stage.GamesPerPlayer
	}
	var sps []models.LeagueStagePlayer
	config.DB.Preload("Player").Where("stage_id = ?", pk).Find(&sps)
	result := make([]gin.H, 0, len(sps))
	for i := range sps {
		sp := &sps[i]
		pData := gin.H{}
		if sp.Player != nil {
			pData = getPlayerListData(sp.Player)
		}
		result = append(result, leagueSerializeStagePlayer(sp, gpp, pData, true))
	}
	respondOK(c, result)
}

func LeagueAddStagePlayers(c *gin.Context) {
	pk := c.Param("pk")
	var req struct {
		Players []struct {
			PlayerID  string `json:"player_id"`
			GroupType string `json:"group_type"`
		} `json:"players"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	for _, p := range req.Players {
		var existing models.LeagueStagePlayer
		result := config.DB.Where("stage_id = ? AND player_id = ?", pk, p.PlayerID).First(&existing)
		if result.Error != nil {
			sp := models.LeagueStagePlayer{
				ID: newUUID(), StageID: pk, PlayerID: p.PlayerID, GroupType: p.GroupType,
			}
			config.DB.Create(&sp)
		} else if p.GroupType != "" {
			config.DB.Model(&existing).Update("group_type", p.GroupType)
		}
	}
	respondOK(c, gin.H{"message": "Players added"})
}

func LeagueUpdateStagePlayer(c *gin.Context) {
	var req struct {
		StagePlayerID string  `json:"stage_player_id"`
		GroupType     *string `json:"group_type"`
		IsEliminated  *bool   `json:"is_eliminated"`
		IsPromoted    *bool   `json:"is_promoted"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.StagePlayerID == "" {
		respondError(c, http.StatusBadRequest, "Missing stage_player_id")
		return
	}
	updates := map[string]interface{}{}
	if req.GroupType != nil {
		updates["group_type"] = *req.GroupType
	}
	if req.IsEliminated != nil {
		updates["is_eliminated"] = *req.IsEliminated
	}
	if req.IsPromoted != nil {
		updates["is_promoted"] = *req.IsPromoted
	}
	if len(updates) > 0 {
		config.DB.Model(&models.LeagueStagePlayer{}).Where("id = ?", req.StagePlayerID).Updates(updates)
	}
	respondOK(c, gin.H{"message": "Updated"})
}

func LeagueRemoveStagePlayer(c *gin.Context) {
	var req struct {
		StagePlayerID string `json:"stage_player_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	config.DB.Where("id = ?", req.StagePlayerID).Delete(&models.LeagueStagePlayer{})
	respondNoContent(c)
}

func LeagueRecalculatePT(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Where("id = ?", pk).First(&stage)
	leagueRecalculateStagePT(stage.ID)
	respondOK(c, gin.H{"message": "PT recalculated"})
}

func LeagueStageRanking(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Preload("Season").Where("id = ?", pk).First(&stage)
	leagueRecalculateStagePT(stage.ID)
	companionGames := leagueStageCompanionGamesMap(&stage)
	var sps []models.LeagueStagePlayer
	config.DB.Preload("Player").Where("stage_id = ?", pk).Find(&sps)
	result := make([]gin.H, 0, len(sps))
	for i := range sps {
		sp := &sps[i]
		pData := gin.H{}
		if sp.Player != nil {
			pData = getPlayerListData(sp.Player)
		}
		row := leagueSerializeStagePlayer(sp, stage.GamesPerPlayer, pData, false)
		row["companion_games"] = companionGames[sp.PlayerID]
		result = append(result, row)
	}
	respondOK(c, result)
}

// --- Matches ---

func LeagueMatchList(c *gin.Context) {
	pk := c.Param("pk")
	var matches []models.LeagueMatch
	config.DB.Preload("Game.GamePlayers.Player").
		Where("stage_id = ?", pk).
		Find(&matches)
	leagueSortMatchesByTime(matches)
	result := make([]gin.H, 0, len(matches))
	for i := range matches {
		result = append(result, serializeLeagueMatch(&matches[i]))
	}
	respondOK(c, result)
}

func LeagueCreateMatch(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Where("id = ?", pk).First(&stage)
	if stage.Status != "ongoing" {
		respondError(c, http.StatusBadRequest, "Stage not ongoing")
		return
	}
	var req struct {
		GameID           *string `json:"game_id"`
		MatchLabel       string  `json:"match_label"`
		RoundIndex       int     `json:"round_index"`
		TableIndex       int     `json:"table_index"`
		ScheduledPlayers []string `json:"scheduled_players"`
		CompanionPlayers []string `json:"companion_players"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	match := models.LeagueMatch{
		ID:               newUUID(),
		StageID:          pk,
		GameID:           req.GameID,
		MatchLabel:       req.MatchLabel,
		RoundIndex:       req.RoundIndex,
		TableIndex:       req.TableIndex,
		ScheduledPlayers: leagueStringListToJSONField(req.ScheduledPlayers),
		CompanionPlayers: leagueStringListToJSONField(req.CompanionPlayers),
	}
	config.DB.Create(&match)
	respondCreated(c, serializeLeagueMatch(&match))
}

func LeagueUpdateMatch(c *gin.Context) {
	matchPK := c.Param("match_pk")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if len(req) > 0 {
		config.DB.Model(&models.LeagueMatch{}).Where("id = ?", matchPK).Updates(req)
	}
	var match models.LeagueMatch
	config.DB.Where("id = ?", matchPK).First(&match)
	respondOK(c, serializeLeagueMatch(&match))
}

func LeagueDeleteMatch(c *gin.Context) {
	matchPK := c.Param("match_pk")
	config.DB.Where("id = ?", matchPK).Delete(&models.LeagueMatch{})
	respondNoContent(c)
}

func LeagueGenerateSemifinal(c *gin.Context) {
	pk := c.Param("pk")
	var stage models.LeagueStage
	config.DB.Where("id = ?", pk).First(&stage)
	if stage.StageType != "semifinal" {
		respondError(c, http.StatusBadRequest, "Only semifinal stage")
		return
	}
	if stage.Status != "ongoing" {
		respondError(c, http.StatusBadRequest, "Start semifinal first")
		return
	}
	var players []models.LeagueStagePlayer
	config.DB.Preload("Player").Where("stage_id = ? AND is_eliminated = ?", pk, false).Find(&players)
	if len(players) != 8 {
		respondError(c, http.StatusBadRequest, "Need exactly 8 players")
		return
	}
	config.DB.Where("stage_id = ?", pk).Delete(&models.LeagueMatch{})
	shuffleSlice(players)
	labels := []string{"A", "B", "C", "D", "E", "F", "G", "H"}
	pidMap := make(map[string]string)
	for i, p := range players {
		pidMap[labels[i]] = p.PlayerID
		config.DB.Model(&models.LeagueSeasonPlayer{}).
			Where("season_id = ? AND player_id = ?", stage.SeasonID, p.PlayerID).
			Update("seed_label", labels[i])
	}

	pairings := [][2][]string{
		{{"A", "B", "C", "D"}, {"E", "F", "G", "H"}},
		{{"A", "B", "E", "F"}, {"C", "D", "G", "H"}},
		{{"A", "B", "G", "H"}, {"C", "D", "E", "F"}},
	}
	for roundIdx, round := range pairings {
		for tableIdx, group := range round {
			ids := make([]string, len(group))
			for i, label := range group {
				ids[i] = pidMap[label]
			}
			labelStr := strings.Join(group, "")
			match := models.LeagueMatch{
				ID:               newUUID(),
				StageID:          pk,
				MatchLabel:       fmt.Sprintf("R%d-T%d(%s)", roundIdx+1, tableIdx+1, labelStr),
				RoundIndex:       roundIdx + 1,
				TableIndex:       tableIdx + 1,
				ScheduledPlayers: leagueStringListToJSONField(ids),
			}
			config.DB.Create(&match)
		}
	}
	respondOK(c, gin.H{"message": "Semifinal matches generated"})
}

func LeagueSeriesUploadLogo(c *gin.Context) {
	if middleware.GetUser(c) == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	pk := c.Param("pk")
	var series models.LeagueSeries
	if err := config.DB.Where("id = ?", pk).First(&series).Error; err != nil {
		respondError(c, http.StatusNotFound, "Series not found")
		return
	}
	data, mimeType, err := readLeagueImageUpload(c, "logo")
	if err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	asset, err := createLeagueImageAsset(data, mimeType)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to save image")
		return
	}
	if series.LogoAssetID != nil && *series.LogoAssetID != "" {
		config.DB.Where("id = ?", *series.LogoAssetID).Delete(&models.LeagueImageAsset{})
	}
	config.DB.Model(&series).Update("logo_asset_id", asset.ID)
	config.DB.Preload("LogoAsset").First(&series, "id = ?", pk)
	respondOK(c, serializeLeagueSeries(&series))
}

func LeagueCurrentSeasons(c *gin.Context) {
	var seasons []models.LeagueSeason
	config.DB.Preload("Series").Preload("Stages").
		Preload("Series.LogoAsset").Where("is_current = ?", true).Find(&seasons)
	respondOK(c, serializeLeagueSeasonsList(seasons))
}

func LeagueAllSeasons(c *gin.Context) {
	var seasons []models.LeagueSeason
	config.DB.Preload("Series").Preload("Stages").Order("season_number DESC").Find(&seasons)
	respondOK(c, serializeLeagueSeasonsList(seasons))
}

func LeagueUploadMarkdownImage(c *gin.Context) {
	if middleware.GetUser(c) == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	pk := c.Param("pk")
	var season models.LeagueSeason
	if err := config.DB.Where("id = ?", pk).First(&season).Error; err != nil {
		respondError(c, http.StatusNotFound, "Season not found")
		return
	}
	data, mimeType, err := readLeagueImageUpload(c, "image")
	if err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	asset, err := createLeagueImageAsset(data, mimeType)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to save image")
		return
	}
	respondCreated(c, gin.H{
		"id":  asset.ID,
		"url": leagueMediaURL(asset.ID),
	})
}

func LeagueReorderStages(c *gin.Context) {
	var req struct {
		OrderedIDs []string `json:"ordered_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	for idx, id := range req.OrderedIDs {
		config.DB.Model(&models.LeagueStage{}).Where("id = ?", id).Update("`order`", idx+1)
	}
	respondOK(c, gin.H{"message": "Reordered"})
}

func LeagueSyncStagePlayers(c *gin.Context) {
	pk := c.Param("pk")
	leagueSyncStagePlayersFromSeason(pk)
	respondOK(c, gin.H{"message": "Players synced"})
}

// --- Helpers ---

func leagueStageHasPlayers(stageID string) bool {
	var count int64
	config.DB.Model(&models.LeagueStagePlayer{}).Where("stage_id = ?", stageID).Count(&count)
	return count > 0
}

func leagueSyncStagePlayersFromSeason(stageID string) {
	var stage models.LeagueStage
	config.DB.Where("id = ?", stageID).First(&stage)
	var seasonPlayerIDs []string
	config.DB.Model(&models.LeagueSeasonPlayer{}).
		Where("season_id = ?", stage.SeasonID).
		Pluck("player_id", &seasonPlayerIDs)
	for _, pid := range seasonPlayerIDs {
		var existing models.LeagueStagePlayer
		if err := config.DB.Where("stage_id = ? AND player_id = ?", stageID, pid).First(&existing).Error; err != nil {
			sp := models.LeagueStagePlayer{
				ID: newUUID(), StageID: stageID, PlayerID: pid, GroupType: "none",
			}
			config.DB.Create(&sp)
		}
	}
}

func leagueRecalculateStagePT(stageID string) {
	config.DB.Model(&models.LeagueStagePlayer{}).Where("stage_id = ?", stageID).
		Updates(map[string]interface{}{"total_pt": 0, "games_played": 0, "rank_in_stage": 0})

	var stagePlayers []models.LeagueStagePlayer
	config.DB.Preload("Player").Where("stage_id = ?", stageID).Find(&stagePlayers)
	spMap := make(map[string]*models.LeagueStagePlayer)
	for i := range stagePlayers {
		spMap[stagePlayers[i].PlayerID] = &stagePlayers[i]
	}

	var stage models.LeagueStage
	config.DB.Where("id = ?", stageID).First(&stage)
	base := stage.BaseScore
	uma := stage.GetUmaList()

	var matches []models.LeagueMatch
	config.DB.Preload("Game.GamePlayers.Player").Where("stage_id = ?", stageID).Find(&matches)
	sort.Slice(matches, func(i, j int) bool {
		ti, tj := leagueMatchSortTime(&matches[i]), leagueMatchSortTime(&matches[j])
		if ti.Equal(tj) {
			return matches[i].CreatedAt.Before(matches[j].CreatedAt)
		}
		return ti.Before(tj)
	})

	playedCount := make(map[string]int)

	for i := range matches {
		match := &matches[i]
		if match.Game == nil {
			continue
		}
		gps := match.Game.GamePlayers
		allScored := true
		for _, gp := range gps {
			if gp.Score == nil {
				allScored = false
				break
			}
		}
		if !allScored || len(gps) == 0 {
			continue
		}

		companionSet := leagueCompanionSetForMatch(&stage, match, playedCount)
		leagueMergeCompanionPlayers(&stage, match, companionSet)

		sorted := make([]models.GamePlayer, len(gps))
		copy(sorted, gps)
		sort.Slice(sorted, func(i, j int) bool {
			return *sorted[i].Score > *sorted[j].Score
		})

		for rankIdx, gp := range sorted {
			sp := spMap[gp.PlayerID]
			if sp == nil {
				continue
			}
			if companionSet[gp.PlayerID] {
				continue
			}
			realScore := float64(*gp.Score) * 100
			pt := (realScore - base) / 1000.0
			if rankIdx < len(uma) {
				pt += uma[rankIdx]
			}
			sp.TotalPT = math.Round((sp.TotalPT+pt)*100) / 100
			sp.GamesPlayed++
			playedCount[gp.PlayerID]++
		}
	}

	for _, group := range []string{"winners", "losers", "none"} {
		var groupSPs []*models.LeagueStagePlayer
		for i := range stagePlayers {
			if stagePlayers[i].GroupType == group {
				groupSPs = append(groupSPs, &stagePlayers[i])
			}
		}
		sort.Slice(groupSPs, func(i, j int) bool {
			return groupSPs[i].TotalPT > groupSPs[j].TotalPT
		})
		for idx, sp := range groupSPs {
			sp.RankInStage = idx + 1
		}
	}

	for i := range stagePlayers {
		sp := &stagePlayers[i]
		config.DB.Model(&models.LeagueStagePlayer{}).
			Where("id = ?", sp.ID).
			Select("total_pt", "games_played", "rank_in_stage").
			Updates(map[string]interface{}{
				"total_pt":      sp.TotalPT,
				"games_played":  sp.GamesPlayed,
				"rank_in_stage": sp.RankInStage,
			})
	}
}

func leagueSeedLabelFor(idx int) string {
	if idx < 26 {
		return string(rune('A' + idx))
	}
	a, b := idx/26-1, idx%26
	return string(rune('A'+a)) + string(rune('A'+b))
}

// --- Serializers ---

func serializeLeagueSeason(s *models.LeagueSeason, playerCounts, stageCounts map[string]int) gin.H {
	pc := leagueSeasonPlayerCount(s, playerCounts)
	sc := leagueSeasonStageCount(s, stageCounts)
	stageIDs := make([]string, 0, len(s.Stages))
	for _, st := range s.Stages {
		stageIDs = append(stageIDs, st.ID)
	}
	var stagePlayerCounts, stageGameCounts map[string]int
	if len(stageIDs) > 0 {
		stagePlayerCounts = leagueLoadStagePlayerCounts(stageIDs)
		stageGameCounts = leagueLoadStageGameCounts(stageIDs)
	}
	stages := make([]gin.H, 0, len(s.Stages))
	for i := range s.Stages {
		st := s.Stages[i]
		stages = append(stages, serializeLeagueStage(&st, stagePlayerCounts, stageGameCounts))
	}
	seriesName := leagueSeasonSeriesName(s)
	return gin.H{
		"id": s.ID, "series_id": s.SeriesID, "series": s.SeriesID, "series_name": seriesName,
		"season_number": s.SeasonNumber,
		"name": s.Name, "cover": s.Cover, "description": s.Description,
		"start_time": formatTimePointer(s.StartTime), "end_time": formatTimePointer(s.EndTime),
		"status": s.Status, "is_current": s.IsCurrent, "is_locked": s.Status != "registration",
		"allow_online": s.AllowOnline, "allow_offline": s.AllowOffline,
		"player_count": pc, "stage_count": sc,
		"created_at": formatTime(s.CreatedAt), "updated_at": formatTime(s.UpdatedAt),
		"stages": stages,
	}
}

func serializeLeagueSeasonDetailFull(s *models.LeagueSeason) gin.H {
	data := serializeLeagueSeason(s, nil, nil)
	if s.Series != nil {
		data["series"] = serializeLeagueSeries(s.Series)
		data["series_name"] = s.Series.Name
	}
	sps := make([]gin.H, 0, len(s.SeasonPlayers))
	for _, sp := range s.SeasonPlayers {
		pData := gin.H{}
		if sp.Player != nil {
			pData = getPlayerListData(sp.Player)
		}
		sps = append(sps, gin.H{
			"id": sp.ID, "season": sp.SeasonID, "season_id": sp.SeasonID,
			"player": pData, "seed_label": sp.SeedLabel,
			"joined_at": formatTime(sp.JoinedAt),
		})
	}
	data["season_players"] = sps
	return data
}

func leagueSerializeStagePlayer(sp *models.LeagueStagePlayer, gamesPerPlayer int, pData gin.H, withTimestamps bool) gin.H {
	data := gin.H{
		"id": sp.ID, "stage_id": sp.StageID, "player": pData,
		"group_type": sp.GroupType, "is_eliminated": sp.IsEliminated,
		"is_promoted": sp.IsPromoted, "games_played": sp.GamesPlayed,
		"total_pt": sp.TotalPT, "rank_in_stage": sp.RankInStage,
		"games_per_player": gamesPerPlayer,
		"is_full":          gamesPerPlayer > 0 && sp.GamesPlayed >= gamesPerPlayer,
	}
	if withTimestamps {
		data["created_at"] = formatTime(sp.CreatedAt)
		data["updated_at"] = formatTime(sp.UpdatedAt)
	}
	return data
}

func serializeLeagueStage(s *models.LeagueStage, playerCounts, gameCounts map[string]int) gin.H {
	pc := 0
	if len(s.StagePlayers) > 0 {
		pc = len(s.StagePlayers)
	} else if playerCounts != nil {
		pc = playerCounts[s.ID]
	}
	gc := 0
	if len(s.Matches) > 0 {
		for _, m := range s.Matches {
			if m.GameID != nil && *m.GameID != "" {
				gc++
			}
		}
	} else if gameCounts != nil {
		gc = gameCounts[s.ID]
	}
	data := gin.H{
		"id": s.ID, "season_id": s.SeasonID, "season": s.SeasonID, "name": s.Name,
		"stage_type": s.StageType, "status": s.Status, "order": s.Order,
		"games_per_player": s.GamesPerPlayer,
		"uma_1st": s.Uma1st, "uma_2nd": s.Uma2nd, "uma_3rd": s.Uma3rd, "uma_4th": s.Uma4th,
		"base_score": s.BaseScore,
		"allow_companion": s.AllowCompanion, "allow_free_table": s.AllowFreeTable,
		"record_ranking": s.RecordRanking, "notes": s.Notes,
		"promotion_rules": s.PromotionRules,
		"has_groups": s.HasGroups(),
		"player_count": pc, "game_count": gc,
		"created_at": formatTime(s.CreatedAt), "updated_at": formatTime(s.UpdatedAt),
	}
	if s.Season != nil {
		data["season_status"] = s.Season.Status
	}
	return data
}

func serializeLeagueStageDetail(s *models.LeagueStage) gin.H {
	stagePlayerCounts := leagueLoadStagePlayerCounts([]string{s.ID})
	stageGameCounts := leagueLoadStageGameCounts([]string{s.ID})
	data := serializeLeagueStage(s, stagePlayerCounts, stageGameCounts)
	sps := make([]gin.H, 0, len(s.StagePlayers))
	for i := range s.StagePlayers {
		sp := &s.StagePlayers[i]
		pData := gin.H{}
		if sp.Player != nil {
			pData = getPlayerListData(sp.Player)
		}
		sps = append(sps, leagueSerializeStagePlayer(sp, s.GamesPerPlayer, pData, false))
	}
	data["stage_players"] = sps
	matches := make([]gin.H, 0, len(s.Matches))
	sortedMatches := make([]models.LeagueMatch, len(s.Matches))
	copy(sortedMatches, s.Matches)
	leagueSortMatchesByTime(sortedMatches)
	for i := range sortedMatches {
		matches = append(matches, serializeLeagueMatch(&sortedMatches[i]))
	}
	data["matches"] = matches
	if bypass := leagueLoadBypassPlayers(s); len(bypass) > 0 {
		data["bypass_players"] = bypass
	}
	return data
}

func serializeLeagueMatch(m *models.LeagueMatch) gin.H {
	companionSet := make(map[string]bool)
	for _, cid := range leagueJSONFieldToStringList(m.CompanionPlayers) {
		companionSet[cid] = true
	}

	data := gin.H{
		"id": m.ID, "stage": m.StageID, "stage_id": m.StageID, "game_id": m.GameID,
		"match_label": m.MatchLabel, "round_index": m.RoundIndex, "table_index": m.TableIndex,
		"scheduled_players": leagueJSONFieldToStringList(m.ScheduledPlayers),
		"companion_players": leagueJSONFieldToStringList(m.CompanionPlayers),
		"created_at":        formatTime(m.CreatedAt),
		"game_is_scored":    false,
		"game_scores":       []gin.H{},
		"players":           []gin.H{},
		"companions":        []gin.H{},
	}
	if m.Game != nil {
		data["game"] = m.GameID
		data["game_start_time"] = formatTime(m.Game.StartTime)
		data["game_is_scored"] = m.Game.IsScored()
		scores := make([]gin.H, 0, len(m.Game.GamePlayers))
		players := make([]gin.H, 0, len(m.Game.GamePlayers))
		companions := make([]gin.H, 0)
		for _, gp := range m.Game.GamePlayers {
			nick := ""
			if gp.Player != nil {
				nick = gp.Player.Nickname
			}
			scores = append(scores, gin.H{
				"player_id":   gp.PlayerID,
				"nickname":    nick,
				"seat_number": gp.SeatNumber,
				"score":       gp.Score,
			})
			if gp.Player != nil {
				brief := getPlayerBrief(gp.Player)
				players = append(players, brief)
				if companionSet[gp.PlayerID] {
					companions = append(companions, brief)
				}
			}
		}
		data["game_scores"] = scores
		data["players"] = players
		data["companions"] = companions
	} else {
		scheduledIDs := leagueJSONFieldToStringList(m.ScheduledPlayers)
		if len(scheduledIDs) > 0 {
			var dbPlayers []models.Player
			config.DB.Where("id IN ?", scheduledIDs).Find(&dbPlayers)
			byID := make(map[string]*models.Player, len(dbPlayers))
			for i := range dbPlayers {
				byID[dbPlayers[i].ID] = &dbPlayers[i]
			}
			players := make([]gin.H, 0, len(scheduledIDs))
			companions := make([]gin.H, 0)
			for _, pid := range scheduledIDs {
				var brief gin.H
				if p, ok := byID[pid]; ok {
					brief = getPlayerBrief(p)
				} else {
					brief = gin.H{"id": pid, "nickname": pid}
				}
				players = append(players, brief)
				if companionSet[pid] {
					companions = append(companions, brief)
				}
			}
			data["players"] = players
			data["companions"] = companions
		}
	}
	return data
}
