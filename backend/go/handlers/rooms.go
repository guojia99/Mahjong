package handlers

import (
	"net/http"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func RoomList(c *gin.Context) {
	statusFilter := c.Query("status")
	roomType := c.Query("room_type")

	var rooms []models.Room
	qs := config.DB.Model(&models.Room{})
	if statusFilter != "" {
		qs = qs.Where("status = ?", statusFilter)
	}
	if roomType == "offline" || roomType == "online" {
		qs = qs.Where("room_type = ?", roomType)
	}
	qs.Order("created_at DESC").Find(&rooms)

	result := make([]gin.H, 0, len(rooms))
	for _, room := range rooms {
		var playerCount int64
		config.DB.Model(&models.RoomPlayer{}).Where("room_id = ?", room.ID).Count(&playerCount)

		var gameCount int64
		config.DB.Model(&models.Game{}).Where("room_id = ?", room.ID).Count(&gameCount)

		var earliest, latest time.Time
		config.DB.Model(&models.Game{}).
			Where("room_id = ?", room.ID).
			Select("MIN(start_time)").Scan(&earliest)
		config.DB.Model(&models.Game{}).
			Where("room_id = ?", room.ID).
			Select("MAX(start_time)").Scan(&latest)

		var earliestPtr, latestPtr *string
		if !earliest.IsZero() {
			s := formatTime(earliest)
			earliestPtr = &s
		}
		if !latest.IsZero() {
			s := formatTime(latest)
			latestPtr = &s
		}

		result = append(result, gin.H{
			"id":                 room.ID,
			"name":               room.Name,
			"location":           room.Location,
			"room_type":          room.RoomType,
			"session_time":       formatTimePointer(room.SessionTime),
			"status":             room.Status,
			"player_count":       playerCount,
			"game_count":         gameCount,
			"created_at":         formatTime(room.CreatedAt),
			"closed_at":          formatTimePointer(room.ClosedAt),
			"earliest_game_time": earliestPtr,
			"latest_game_time":   latestPtr,
		})
	}
	respondOK(c, result)
}

func RoomCreate(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Location    string `json:"location"`
		RoomType    string `json:"room_type"`
		SessionTime string `json:"session_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	room := models.Room{
		ID:          newUUID(),
		Name:        req.Name,
		Location:    req.Location,
		RoomType:    req.RoomType,
		Status:      "open",
		CreatedByID: &user.ID,
	}
	if room.RoomType == "" {
		room.RoomType = "offline"
	}
	if req.SessionTime != "" {
		t, err := time.ParseInLocation("2006-01-02T15:04", req.SessionTime, time.Local)
		if err == nil {
			room.SessionTime = &t
		}
	}
	if err := config.DB.Create(&room).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	config.DB.Preload("RoomPlayers.Player").First(&room, "id = ?", room.ID)
	respondCreated(c, serializeRoomDetail(&room))
}

func RoomDetail(c *gin.Context) {
	pk := c.Param("pk")
	var room models.Room
	if err := config.DB.Preload("RoomPlayers.Player").Where("id = ?", pk).First(&room).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	respondOK(c, serializeRoomDetail(&room))
}

func RoomUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var room models.Room
	if err := config.DB.Where("id = ?", pk).First(&room).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Location    string `json:"location"`
		RoomType    string `json:"room_type"`
		SessionTime string `json:"session_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	updates := make(map[string]interface{})
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Location != "" {
		updates["location"] = req.Location
	}
	if req.RoomType != "" {
		updates["room_type"] = req.RoomType
	}
	if len(updates) > 0 {
		config.DB.Model(&room).Updates(updates)
	}
	config.DB.Preload("RoomPlayers.Player").First(&room, "id = ?", pk)
	respondOK(c, serializeRoomDetail(&room))
}

func RoomDelete(c *gin.Context) {
	pk := c.Param("pk")
	var gameCount int64
	config.DB.Model(&models.Game{}).Where("room_id = ?", pk).Count(&gameCount)
	if gameCount > 0 {
		respondError(c, http.StatusBadRequest, "Room has games, cannot delete")
		return
	}
	config.DB.Where("id = ?", pk).Delete(&models.Room{})
	respondNoContent(c)
}

func RoomClose(c *gin.Context) {
	pk := c.Param("pk")
	var room models.Room
	if err := config.DB.Where("id = ?", pk).First(&room).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if room.Status == "closed" {
		respondError(c, http.StatusBadRequest, "Room already closed")
		return
	}
	now := time.Now()
	room.Status = "closed"
	room.ClosedAt = &now
	config.DB.Save(&room)
	config.DB.Preload("RoomPlayers.Player").First(&room, "id = ?", pk)
	respondOK(c, serializeRoomDetail(&room))
}

func RoomPlayerList(c *gin.Context) {
	pk := c.Param("pk")
	var rps []models.RoomPlayer
	config.DB.Preload("Player").Where("room_id = ?", pk).Find(&rps)
	result := make([]gin.H, 0, len(rps))
	for _, rp := range rps {
		playerData := gin.H{}
		if rp.Player != nil {
			playerData = getPlayerListData(rp.Player)
		}
		result = append(result, gin.H{
			"id":        rp.ID,
			"player":    playerData,
			"joined_at": formatTime(rp.JoinedAt),
		})
	}
	respondOK(c, result)
}

func RoomAddPlayer(c *gin.Context) {
	pk := c.Param("pk")
	var req struct {
		PlayerID string `json:"player_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	var room models.Room
	if err := config.DB.Where("id = ?", pk).First(&room).Error; err != nil {
		respondError(c, http.StatusNotFound, "Room not found")
		return
	}
	if room.Status == "closed" {
		respondError(c, http.StatusBadRequest, "Room closed, cannot add player")
		return
	}
	var existing models.RoomPlayer
	if err := config.DB.Where("room_id = ? AND player_id = ?", pk, req.PlayerID).First(&existing).Error; err == nil {
		respondError(c, http.StatusConflict, "Player already in room")
		return
	}
	rp := models.RoomPlayer{
		ID:       newUUID(),
		RoomID:   pk,
		PlayerID: req.PlayerID,
	}
	config.DB.Create(&rp)
	config.DB.Preload("Player").First(&rp, "id = ?", rp.ID)
	playerData := gin.H{}
	if rp.Player != nil {
		playerData = getPlayerListData(rp.Player)
	}
	respondCreated(c, gin.H{
		"id":        rp.ID,
		"player":    playerData,
		"joined_at": formatTime(rp.JoinedAt),
	})
}

func RoomRemovePlayer(c *gin.Context) {
	pk := c.Param("pk")
	playerPK := c.Param("player_pk")
	config.DB.Where("room_id = ? AND player_id = ?", pk, playerPK).Delete(&models.RoomPlayer{})
	respondNoContent(c)
}

func RoomGameList(c *gin.Context) {
	pk := c.Param("pk")
	var games []models.Game
	config.DB.Where("room_id = ?", pk).
		Preload("GamePlayers.Player").
		Order("start_time DESC").
		Find(&games)
	result := make([]gin.H, 0, len(games))
	for i := range games {
		result = append(result, serializeGameList(&games[i]))
	}
	annotateGamesWithPT(games, result)
	respondOK(c, result)
}

func RoomCreateGame(c *gin.Context) {
	pk := c.Param("pk")
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var room models.Room
	if err := config.DB.Where("id = ?", pk).First(&room).Error; err != nil {
		respondError(c, http.StatusNotFound, "Room not found")
		return
	}
	if room.Status == "closed" {
		respondError(c, http.StatusBadRequest, "Room closed")
		return
	}
	var req struct {
		PlayerIDs   []string `json:"player_ids"`
		GameMode    string   `json:"game_mode"`
		PlayerCount int      `json:"player_count"`
		StartTime   string   `json:"start_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	game := models.Game{
		ID:          newUUID(),
		RoomID:      &room.ID,
		GameType:    "offline",
		GameMode:    req.GameMode,
		PlayerCount: len(req.PlayerIDs),
		CreatedByID: &user.ID,
	}
	if game.GameMode == "" {
		game.GameMode = "half_match"
	}
	if game.PlayerCount == 0 {
		game.PlayerCount = 4
	}
	if req.PlayerCount > 0 {
		game.PlayerCount = req.PlayerCount
	}
	if req.StartTime != "" {
		t, err := time.ParseInLocation("2006-01-02T15:04", req.StartTime, time.Local)
		if err == nil {
			game.StartTime = t
		} else {
			t2, err2 := time.ParseInLocation("2006-01-02 15:04", req.StartTime, time.Local)
			if err2 == nil {
				game.StartTime = t2
			}
		}
	} else if room.SessionTime != nil {
		game.StartTime = *room.SessionTime
	} else {
		game.StartTime = time.Now()
	}

	tx := config.DB.Begin()
	if err := tx.Create(&game).Error; err != nil {
		tx.Rollback()
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	for i, pid := range req.PlayerIDs {
		gp := models.GamePlayer{
			ID:         newUUID(),
			GameID:     game.ID,
			PlayerID:   pid,
			SeatNumber: i,
		}
		if err := tx.Create(&gp).Error; err != nil {
			tx.Rollback()
			respondError(c, http.StatusBadRequest, "Player not found: "+pid)
			return
		}
	}
	tx.Commit()

	config.DB.Preload("GamePlayers.Player.Player.MajsoulAccounts").
		Preload("HandRecords.Player").
		First(&game, "id = ?", game.ID)
	data := serializeGameDetail(&game)
	data["pt"] = calculatePT(&game)
	respondCreated(c, data)
}

func serializeRoomDetail(room *models.Room) gin.H {
	rps := make([]gin.H, 0, len(room.RoomPlayers))
	for _, rp := range room.RoomPlayers {
		playerData := gin.H{}
		if rp.Player != nil {
			playerData = getPlayerListData(rp.Player)
		}
		rps = append(rps, gin.H{
			"id":        rp.ID,
			"player":    playerData,
			"joined_at": formatTime(rp.JoinedAt),
		})
	}
	return gin.H{
		"id":           room.ID,
		"name":         room.Name,
		"location":     room.Location,
		"room_type":    room.RoomType,
		"session_time": formatTimePointer(room.SessionTime),
		"status":       room.Status,
		"room_players": rps,
		"created_at":   formatTime(room.CreatedAt),
		"closed_at":    formatTimePointer(room.ClosedAt),
	}
}
