package handlers

import (
	"net/http"
	"strings"

	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

func PlayerAvatarBatch(c *gin.Context) {
	raw := c.Query("ids")
	ids := strings.Split(raw, ",")
	filtered := make([]string, 0, 200)
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			filtered = append(filtered, id)
		}
	}
	if len(filtered) > 200 {
		filtered = filtered[:200]
	}

	result := make(map[string]string)
	if len(filtered) > 0 {
		var players []models.Player
		config.DB.Where("id IN ?", filtered).Find(&players)
		for _, p := range players {
			result[p.ID] = p.Avatar
		}
		for _, id := range filtered {
			if _, ok := result[id]; !ok {
				result[id] = ""
			}
		}
	}
	respondOK(c, result)
}

func PlayerList(c *gin.Context) {
	query := c.Query("q")
	var players []models.Player
	qs := config.DB.Order("created_at DESC")
	if query != "" {
		qs = qs.Where("nickname LIKE ? OR real_name LIKE ?", "%"+query+"%", "%"+query+"%")
	}
	qs.Find(&players)

	result := make([]gin.H, 0, len(players))
	for i := range players {
		p := &players[i]
		config.DB.Preload("MajsoulAccounts").First(p, "id = ?", p.ID)
		result = append(result, getPlayerListData(p))
	}
	respondOK(c, result)
}

func PlayerCreate(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var req struct {
		Nickname  string                 `json:"nickname"`
		RealName  string                 `json:"real_name"`
		Avatar    string                 `json:"avatar"`
		ExtraInfo map[string]interface{} `json:"extra_info"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	player := models.Player{
		ID:          newUUID(),
		Nickname:    req.Nickname,
		RealName:    req.RealName,
		Avatar:      req.Avatar,
		ExtraInfo:   req.ExtraInfo,
		CreatedByID: &user.ID,
	}
	if player.ExtraInfo == nil {
		player.ExtraInfo = models.JSONField{}
	}
	if err := config.DB.Create(&player).Error; err != nil {
		respondError(c, http.StatusBadRequest, err.Error())
		return
	}
	config.DB.Preload("MajsoulAccounts").First(&player, "id = ?", player.ID)
	respondCreated(c, getPlayerDetailData(&player))
}

func PlayerDetail(c *gin.Context) {
	pk := c.Param("pk")
	var player models.Player
	if err := config.DB.Preload("MajsoulAccounts").Where("id = ?", pk).First(&player).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	respondOK(c, getPlayerDetailData(&player))
}

func PlayerUpdate(c *gin.Context) {
	pk := c.Param("pk")
	var player models.Player
	if err := config.DB.Preload("MajsoulAccounts").Where("id = ?", pk).First(&player).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	var req struct {
		Nickname  string                 `json:"nickname"`
		RealName  string                 `json:"real_name"`
		Avatar    string                 `json:"avatar"`
		ExtraInfo map[string]interface{} `json:"extra_info"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	updates := make(map[string]interface{})
	if req.Nickname != "" {
		updates["nickname"] = req.Nickname
	}
	if req.RealName != "" {
		updates["real_name"] = req.RealName
	}
	updates["avatar"] = req.Avatar
	if req.ExtraInfo != nil {
		updates["extra_info"] = req.ExtraInfo
	}
	if len(updates) > 0 {
		config.DB.Model(&player).Updates(updates)
	}
	config.DB.Preload("MajsoulAccounts").First(&player, "id = ?", pk)
	respondOK(c, getPlayerDetailData(&player))
}

func PlayerDelete(c *gin.Context) {
	pk := c.Param("pk")
	config.DB.Where("id = ?", pk).Delete(&models.Player{})
	respondNoContent(c)
}

func PlayerMajsoulAccounts(c *gin.Context) {
	pk := c.Param("pk")
	var accounts []models.MahjongSoulAccount
	config.DB.Where("player_id = ?", pk).Find(&accounts)
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

func PlayerAddMajsoulAccount(c *gin.Context) {
	pk := c.Param("pk")
	var player models.Player
	if err := config.DB.Where("id = ?", pk).First(&player).Error; err != nil {
		respondError(c, http.StatusNotFound, "Player not found")
		return
	}
	var req struct {
		UID      int64  `json:"uid"`
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	var existing models.MahjongSoulAccount
	if err := config.DB.Where("uid = ?", req.UID).First(&existing).Error; err == nil {
		respondError(c, http.StatusConflict, "UID already bound to another player")
		return
	}
	account := models.MahjongSoulAccount{
		ID:       newUUID(),
		PlayerID: &player.ID,
		UID:      req.UID,
		Nickname: req.Nickname,
	}
	config.DB.Create(&account)
	respondCreated(c, gin.H{
		"id":         account.ID,
		"uid":        account.UID,
		"nickname":   account.Nickname,
		"player":     account.PlayerID,
		"created_at": formatTime(account.CreatedAt),
	})
}

func DeleteMajsoulAccount(c *gin.Context) {
	accountPK := c.Param("account_pk")
	config.DB.Where("id = ?", accountPK).Delete(&models.MahjongSoulAccount{})
	respondNoContent(c)
}

func PlayerGames(c *gin.Context) {
	pk := c.Param("pk")
	var player models.Player
	if err := config.DB.Where("id = ?", pk).First(&player).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}

	var gameIDs []string
	config.DB.Model(&models.GamePlayer{}).
		Where("player_id = ? AND score IS NOT NULL", pk).
		Pluck("game_id", &gameIDs)

	if len(gameIDs) == 0 {
		respondOK(c, []interface{}{})
		return
	}

	var games []models.Game
	config.DB.Where("id IN ?", gameIDs).
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
