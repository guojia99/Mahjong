package handlers

import (
	"database/sql"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func respondOK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, data)
}

func respondCreated(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, data)
}

func respondNoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

func respondError(c *gin.Context, code int, msg string) {
	c.JSON(code, gin.H{"error": msg})
}

func parseQueryInt(c *gin.Context, key string, defaultVal int) int {
	v := c.Query(key)
	if v == "" {
		return defaultVal
	}
	var result int
	for _, ch := range strings.TrimSpace(v) {
		if ch >= '0' && ch <= '9' {
			result = result*10 + int(ch-'0')
		}
	}
	if result == 0 && v != "0" {
		return defaultVal
	}
	return result
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02 15:04")
}

func formatTimePointer(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02 15:04")
}

// roomGameAggregateTime reads MIN/MAX(start_time) for a room (SQLite returns string).
func roomGameAggregateTime(roomID, aggregate string) (time.Time, bool) {
	switch aggregate {
	case "MIN(start_time)", "MAX(start_time)":
	default:
		return time.Time{}, false
	}
	var s sql.NullString
	err := config.DB.Raw(
		"SELECT "+aggregate+" FROM games WHERE room_id = ? AND start_time IS NOT NULL AND start_time != ''",
		roomID,
	).Scan(&s).Error
	if err != nil || !s.Valid {
		return time.Time{}, false
	}
	return parseTimeString(s.String)
}

func parseTimeString(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	layouts := []string{
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func newUUID() string {
	return uuid.New().String()
}

func shuffleSlice[T any](s []T) {
	rand.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] })
}

func getPlayerBrief(p *models.Player) gin.H {
	return gin.H{
		"id":       p.ID,
		"nickname": p.Nickname,
	}
}

func getPlayerListData(p *models.Player) gin.H {
	data := gin.H{
		"id":             p.ID,
		"nickname":       p.Nickname,
		"real_name":      p.RealName,
		"majsoul_uids":   []int{},
		"ranking_tier":   nil,
		"ranking_score":  nil,
		"total_game_count": 0,
		"last_game_time": nil,
		"created_at":     formatTime(p.CreatedAt),
	}

	var uids []int64
	config.DB.Model(&models.MahjongSoulAccount{}).Where("player_id = ?", p.ID).Pluck("uid", &uids)
	uidInts := make([]int, len(uids))
	for i, u := range uids {
		uidInts[i] = int(u)
	}
	data["majsoul_uids"] = uidInts

	var prs models.PlayerRankingScore
	if err := config.DB.Preload("Tier").Where("player_id = ?", p.ID).First(&prs).Error; err == nil {
		if prs.Tier != nil {
			data["ranking_tier"] = gin.H{
				"id":              prs.Tier.ID,
				"name":            prs.Tier.Name,
				"level_order":     prs.Tier.LevelOrder,
				"initial_score":   prs.Tier.InitialScore,
				"promotion_score": prs.Tier.PromotionScore,
				"dajiang_score":   prs.Tier.DajiangScore,
				"fourth_penalty":  prs.Tier.FourthPenalty,
				"is_protected":    prs.Tier.IsProtected,
				"bg_color":        prs.Tier.BgColor,
				"bg_gradient":     prs.Tier.BgGradient,
				"description":     prs.Tier.Description,
			}
		}
		data["ranking_score"] = prs.Score
	}

	var gameCount int64
	config.DB.Model(&models.GamePlayer{}).Where("player_id = ? AND score IS NOT NULL", p.ID).Count(&gameCount)
	data["total_game_count"] = int(gameCount)

	var latestGP models.GamePlayer
	config.DB.Joins("JOIN games ON games.id = game_players.game_id").
		Where("game_players.player_id = ? AND game_players.score IS NOT NULL", p.ID).
		Order("games.start_time DESC").
		First(&latestGP)
	if latestGP.GameID != "" {
		var game models.Game
		config.DB.Select("start_time").Where("id = ?", latestGP.GameID).First(&game)
		if !game.StartTime.IsZero() {
			data["last_game_time"] = game.StartTime.Format("2006-01-02")
		}
	}

	return data
}

func getPlayerDetailData(p *models.Player) gin.H {
	accounts := make([]gin.H, 0, len(p.MajsoulAccounts))
	for _, acc := range p.MajsoulAccounts {
		accounts = append(accounts, gin.H{
			"id":         acc.ID,
			"uid":        acc.UID,
			"nickname":   acc.Nickname,
			"player":     acc.PlayerID,
			"created_at": formatTime(acc.CreatedAt),
		})
	}
	return gin.H{
		"id":              p.ID,
		"nickname":        p.Nickname,
		"real_name":       p.RealName,
		"extra_info":      p.ExtraInfo,
		"majsoul_accounts": accounts,
		"created_at":      formatTime(p.CreatedAt),
		"updated_at":      formatTime(p.UpdatedAt),
	}
}


