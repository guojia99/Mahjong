package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"
	"mahjong-backend/quemi"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const queMiDailyCreateLimit = 10
const queMiPuzzleNameMaxLen = 100

var queMiNamesBackfilled sync.Once

func queMiEnsureNamesBackfilled() {
	queMiNamesBackfilled.Do(queMiBackfillPuzzleNames)
}

func queMiTodayStart() time.Time {
	now := time.Now().In(time.Local)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
}

func queMiParsePuzzleData(jf models.JSONField) (quemi.QueMiPuzzle, error) {
	var p quemi.QueMiPuzzle
	if err := json.Unmarshal(jf, &p); err != nil {
		return p, err
	}
	return p, nil
}

func queMiUserNickname(user *models.User) string {
	if user == nil {
		return ""
	}
	if user.PlayerID != nil && *user.PlayerID != "" {
		var player models.Player
		if config.DB.Where("id = ?", *user.PlayerID).First(&player).Error == nil {
			return player.Nickname
		}
	}
	return user.Username
}

func queMiIsBlacklisted(userID uint64) bool {
	var n int64
	config.DB.Model(&models.QueMiCreatorBlacklist{}).Where("user_id = ?", userID).Count(&n)
	return n > 0
}

func queMiCountTodayCreated(userID uint64) int64 {
	var n int64
	config.DB.Model(&models.QueMiPuzzle{}).
		Where("created_by_id = ? AND created_at >= ?", userID, queMiTodayStart()).
		Count(&n)
	return n
}

func queMiCountUserPuzzles(userID uint64) int64 {
	var n int64
	config.DB.Model(&models.QueMiPuzzle{}).Where("created_by_id = ?", userID).Count(&n)
	return n
}

func queMiDefaultPuzzleName(user *models.User) string {
	seq := queMiCountUserPuzzles(user.ID) + 1
	display := queMiUserNickname(user)
	if display == "" {
		display = user.Username
	}
	return fmt.Sprintf("%s的雀谜%03d", display, seq)
}

func queMiNormalizePuzzleName(name string) string {
	name = strings.TrimSpace(name)
	if len(name) > queMiPuzzleNameMaxLen {
		name = name[:queMiPuzzleNameMaxLen]
	}
	return name
}

func queMiBackfillPuzzleNames() {
	var rows []models.QueMiPuzzle
	config.DB.Where("name = '' OR name IS NULL").Preload("CreatedBy").
		Order("created_by_id ASC, created_at ASC").Find(&rows)
	if len(rows) == 0 {
		return
	}
	seqByUser := make(map[uint64]int)
	for i := range rows {
		row := &rows[i]
		seqByUser[row.CreatedByID]++
		display := ""
		if row.CreatedBy != nil {
			display = queMiUserNickname(row.CreatedBy)
		}
		if display == "" {
			var u models.User
			if config.DB.First(&u, row.CreatedByID).Error == nil {
				display = queMiUserNickname(&u)
				if display == "" {
					display = u.Username
				}
			}
		}
		if display == "" {
			display = "用户"
		}
		row.Name = fmt.Sprintf("%s的雀谜%03d", display, seqByUser[row.CreatedByID])
		config.DB.Model(row).Update("name", row.Name)
	}
}

func queMiPuzzleStats(puzzleID string) (playCount, solveCount int64) {
	config.DB.Model(&models.QueMiAttempt{}).Where("puzzle_id = ?", puzzleID).Count(&playCount)
	config.DB.Model(&models.QueMiAttempt{}).Where("puzzle_id = ? AND status = ?", puzzleID, models.QueMiAttemptStatusWon).Count(&solveCount)
	return
}

func queMiOtherPlayCount(puzzleID string, creatorID uint64) int64 {
	var n int64
	config.DB.Model(&models.QueMiAttempt{}).
		Where("puzzle_id = ? AND user_id != ?", puzzleID, creatorID).
		Count(&n)
	return n
}

func queMiStripAnswers(p *quemi.QueMiPuzzle) {
	p.Answer = nil
	p.OpenAnswer = nil
}

const (
	queMiCategoryWinnableClosed = "winnable_closed"
	queMiCategoryWinnableOpen   = "winnable_open"
	queMiCategoryNonWinnable    = "non_winnable"
)

func queMiPuzzleCategory(p quemi.QueMiPuzzle) string {
	if p.Type == quemi.PuzzleTypeNonWinnable {
		return queMiCategoryNonWinnable
	}
	if p.HandMode == quemi.HandModeOpen {
		return queMiCategoryWinnableOpen
	}
	return queMiCategoryWinnableClosed
}

func queMiPuzzleMatchesCategory(p quemi.QueMiPuzzle, category string) bool {
	if category == "" {
		return true
	}
	return queMiPuzzleCategory(p) == category
}

// queMiEffectiveAttemptUsage scores how many attempts count toward creator leaderboard.
// Give-up counts as max; exhausted loss with fewer than 4 attempts counts as 5.
func queMiEffectiveAttemptUsage(status string, attemptsUsed, maxAttempts int) int {
	if status == models.QueMiAttemptStatusWon {
		return attemptsUsed
	}
	if status != models.QueMiAttemptStatusLost {
		return 0
	}
	if attemptsUsed < maxAttempts {
		return maxAttempts
	}
	if attemptsUsed < 4 {
		return 5
	}
	return attemptsUsed
}

type queMiListFilters struct {
	Unplayed   bool
	Difficulty string
	Type       string
	HandMode   string
	Creator    string
	Name       string
}

func queMiParseListFilters(c *gin.Context) queMiListFilters {
	return queMiListFilters{
		Unplayed:   c.Query("unplayed") == "true" || c.Query("unplayed") == "1",
		Difficulty: c.Query("difficulty"),
		Type:       c.Query("type"),
		HandMode:   c.Query("hand_mode"),
		Creator:    strings.TrimSpace(c.Query("creator")),
		Name:       strings.TrimSpace(c.Query("name")),
	}
}

func queMiUserAttemptMap(userID uint64) map[string]string {
	var attempts []models.QueMiAttempt
	config.DB.Where("user_id = ?", userID).Find(&attempts)
	out := make(map[string]string, len(attempts))
	for _, a := range attempts {
		out[a.PuzzleID] = a.Status
	}
	return out
}

func queMiPuzzleMatchesFilters(p quemi.QueMiPuzzle, f queMiListFilters) bool {
	if f.Difficulty != "" && string(p.Difficulty) != f.Difficulty {
		return false
	}
	if f.Type != "" && string(p.Type) != f.Type {
		return false
	}
	if f.HandMode != "" && string(p.HandMode) != f.HandMode {
		return false
	}
	return true
}

func queMiBuildFilteredPuzzleList(rows []models.QueMiPuzzle, viewer *models.User, filters queMiListFilters) []gin.H {
	var attemptMap map[string]string
	if viewer != nil {
		attemptMap = queMiUserAttemptMap(viewer.ID)
	}

	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		row := &rows[i]
		p, err := queMiParsePuzzleData(row.PuzzleData)
		if err != nil {
			continue
		}
		if !queMiPuzzleMatchesFilters(p, filters) {
			continue
		}
		if !queMiCreatorMatchesFilter(row, filters.Creator) {
			continue
		}
		if !queMiNameMatchesFilter(row, filters.Name) {
			continue
		}
		isMine := viewer != nil && viewer.ID == row.CreatedByID
		if filters.Unplayed && viewer != nil {
			if isMine {
				continue
			}
			if _, played := attemptMap[row.ID]; played {
				continue
			}
		}
		var myStatus *string
		if viewer != nil {
			if st, ok := attemptMap[row.ID]; ok {
				myStatus = &st
			}
		}
		out = append(out, queMiSerializePuzzleWithAttempt(row, viewer, false, myStatus))
	}
	return out
}

func queMiPaginateList(items []gin.H, page, pageSize int) (int, int, int, []gin.H) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 1
	}
	if pageSize > 100 {
		pageSize = 100
	}
	total := len(items)
	totalPages := (total + pageSize - 1) / pageSize
	if totalPages == 0 {
		totalPages = 1
	}
	if page > totalPages {
		page = totalPages
	}
	start := (page - 1) * pageSize
	if start >= total {
		return total, page, pageSize, []gin.H{}
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	return total, page, pageSize, items[start:end]
}

func queMiSerializePuzzle(row *models.QueMiPuzzle, viewer *models.User, includeAnswers bool) gin.H {
	return queMiSerializePuzzleWithAttempt(row, viewer, includeAnswers, nil)
}

func queMiSerializePuzzleWithAttempt(row *models.QueMiPuzzle, viewer *models.User, includeAnswers bool, myAttemptStatus *string) gin.H {
	p, _ := queMiParsePuzzleData(row.PuzzleData)
	if !includeAnswers {
		queMiStripAnswers(&p)
	}
	playCount, solveCount := queMiPuzzleStats(row.ID)
	creatorName := ""
	if row.CreatedBy != nil {
		creatorName = queMiUserNickname(row.CreatedBy)
	} else {
		var u models.User
		if config.DB.First(&u, row.CreatedByID).Error == nil {
			creatorName = queMiUserNickname(&u)
		}
	}
	isMine := viewer != nil && viewer.ID == row.CreatedByID
	data := gin.H{
		"id":           row.ID,
		"name":         row.Name,
		"puzzle":       p,
		"creator_id":   row.CreatedByID,
		"creator_name": creatorName,
		"is_disabled":  row.IsDisabled,
		"is_mine":      isMine,
		"play_count":   playCount,
		"solve_count":  solveCount,
		"created_at":   formatTime(row.CreatedAt),
	}
	if myAttemptStatus != nil {
		data["my_attempt_status"] = *myAttemptStatus
	}
	return data
}

func queMiCanViewAnswers(row *models.QueMiPuzzle, viewer *models.User) bool {
	return viewer != nil && viewer.ID == row.CreatedByID
}

func queMiHasFinishedAttempt(puzzleID string, userID uint64) bool {
	var attempt models.QueMiAttempt
	return config.DB.Where("puzzle_id = ? AND user_id = ? AND status IN ?",
		puzzleID, userID, []string{models.QueMiAttemptStatusWon, models.QueMiAttemptStatusLost}).
		First(&attempt).Error == nil
}

func queMiCanViewOthersAttempts(row *models.QueMiPuzzle, viewer *models.User) bool {
	if viewer == nil {
		return false
	}
	if viewer.ID == row.CreatedByID {
		return true
	}
	return queMiHasFinishedAttempt(row.ID, viewer.ID)
}

func queMiCreatorMatchesFilter(row *models.QueMiPuzzle, creatorQuery string) bool {
	if creatorQuery == "" {
		return true
	}
	q := strings.ToLower(creatorQuery)
	creatorName := strings.ToLower(queMiUserNickname(row.CreatedBy))
	if strings.Contains(creatorName, q) {
		return true
	}
	var u models.User
	if row.CreatedBy != nil {
		u = *row.CreatedBy
	} else if config.DB.First(&u, row.CreatedByID).Error != nil {
		return false
	}
	return strings.Contains(strings.ToLower(u.Username), q)
}

func queMiNameMatchesFilter(row *models.QueMiPuzzle, nameQuery string) bool {
	if nameQuery == "" {
		return true
	}
	return strings.Contains(strings.ToLower(row.Name), strings.ToLower(nameQuery))
}

// QueMiPuzzleList GET /que-mi/puzzles/
func QueMiPuzzleList(c *gin.Context) {
	queMiEnsureNamesBackfilled()
	viewer := middleware.GetUser(c)
	filters := queMiParseListFilters(c)
	q := config.DB.Model(&models.QueMiPuzzle{}).Preload("CreatedBy")
	if viewer == nil || !viewer.IsStaff {
		q = q.Where("is_disabled = ?", false)
	}
	var rows []models.QueMiPuzzle
	q.Order("created_at DESC").Find(&rows)

	filtered := queMiBuildFilteredPuzzleList(rows, viewer, filters)
	page := parseQueryInt(c, "page", 1)
	pageSize := parseQueryInt(c, "page_size", 20)
	total, page, pageSize, results := queMiPaginateList(filtered, page, pageSize)

	respondOK(c, gin.H{
		"count":     total,
		"page":      page,
		"page_size": pageSize,
		"results":   results,
	})
}

// QueMiSuggestedPuzzleName GET /que-mi/puzzles/suggested-name/
func QueMiSuggestedPuzzleName(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	respondOK(c, gin.H{"name": queMiDefaultPuzzleName(user)})
}

// QueMiPuzzleCreate POST /que-mi/puzzles/
func QueMiPuzzleCreate(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	if queMiIsBlacklisted(user.ID) {
		respondError(c, http.StatusForbidden, "You are not allowed to create puzzles")
		return
	}
	if queMiCountTodayCreated(user.ID) >= queMiDailyCreateLimit {
		respondError(c, http.StatusTooManyRequests, "Daily puzzle limit reached")
		return
	}

	var req struct {
		Puzzle quemi.QueMiPuzzle `json:"puzzle"`
		Name   string            `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	p := req.Puzzle
	if max, ok := quemi.ATTEMPTS_BY_DIFFICULTY[p.Difficulty]; ok {
		p.MaxAttempts = max
	} else {
		respondError(c, http.StatusBadRequest, "Invalid difficulty")
		return
	}
	if p.HandMode == quemi.HandModeClosed && len(p.Answer) == 14 {
		p.Answer = quemi.BuildCanonicalAnswer(p.Answer[:13], p.Answer[13])
	}
	if p.HandMode == quemi.HandModeOpen && p.OpenAnswer != nil {
		for i := range p.OpenAnswer.Melds {
			p.OpenAnswer.Melds[i] = quemi.SortTilesCanonical(p.OpenAnswer.Melds[i])
		}
		p.OpenAnswer.ClosedHand = quemi.SortTilesCanonical(p.OpenAnswer.ClosedHand)
	}

	vr := quemi.ValidatePuzzleDefinition(p)
	if !vr.OK {
		respondError(c, http.StatusBadRequest, string(vr.Reason))
		return
	}

	id := newUUID()
	p.ID = id
	p.CreatedAt = time.Now().UnixMilli()
	jf, err := models.NewJSONField(p)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to save puzzle")
		return
	}
	row := models.QueMiPuzzle{
		ID:          id,
		Name:        queMiDefaultPuzzleName(user),
		CreatedByID: user.ID,
		PuzzleData:  jf,
	}
	if name := queMiNormalizePuzzleName(req.Name); name != "" {
		row.Name = name
	}
	if err := config.DB.Create(&row).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to create puzzle")
		return
	}
	row.CreatedBy = user
	respondCreated(c, queMiSerializePuzzle(&row, user, true))
}

// QueMiPuzzleDetail GET /que-mi/puzzles/:id/
func QueMiPuzzleDetail(c *gin.Context) {
	queMiEnsureNamesBackfilled()
	pk := c.Param("id")
	var row models.QueMiPuzzle
	if err := config.DB.Preload("CreatedBy").Where("id = ?", pk).First(&row).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	viewer := middleware.GetUser(c)
	if row.IsDisabled && (viewer == nil || (!viewer.IsStaff && viewer.ID != row.CreatedByID)) {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	includeAnswers := queMiCanViewAnswers(&row, viewer)
	if viewer != nil && !includeAnswers {
		var attempt models.QueMiAttempt
		if config.DB.Where("puzzle_id = ? AND user_id = ? AND status != ?",
			pk, viewer.ID, models.QueMiAttemptStatusInProgress).First(&attempt).Error == nil {
			includeAnswers = true
		}
	}
	data := queMiSerializePuzzle(&row, viewer, includeAnswers)
	data["can_view_attempts"] = queMiCanViewOthersAttempts(&row, viewer)

	if viewer != nil {
		var attempt models.QueMiAttempt
		if config.DB.Where("puzzle_id = ? AND user_id = ?", pk, viewer.ID).First(&attempt).Error == nil {
			var revealed *quemi.QueMiPuzzle
			if attempt.Status != models.QueMiAttemptStatusInProgress {
				puzzleFull, _ := queMiParsePuzzleData(row.PuzzleData)
				revealed = &puzzleFull
			}
			data["my_attempt"] = queMiSerializeAttempt(&attempt, true, revealed)
		}
	}
	respondOK(c, data)
}

// QueMiPuzzleDelete DELETE /que-mi/puzzles/:id/
func QueMiPuzzleDelete(c *gin.Context) {
	pk := c.Param("id")
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var row models.QueMiPuzzle
	if err := config.DB.Where("id = ?", pk).First(&row).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	isAdmin := user.IsStaff
	isOwner := user.ID == row.CreatedByID
	if !isAdmin && !isOwner {
		respondError(c, http.StatusForbidden, "Forbidden")
		return
	}
	if !isAdmin && queMiOtherPlayCount(pk, row.CreatedByID) > 0 {
		respondError(c, http.StatusForbidden, "Puzzle has been played by others")
		return
	}
	config.DB.Where("puzzle_id = ?", pk).Delete(&models.QueMiSubmit{})
	config.DB.Where("puzzle_id = ?", pk).Delete(&models.QueMiAttempt{})
	config.DB.Delete(&row)
	respondNoContent(c)
}

// QueMiPuzzlePatch PATCH /que-mi/puzzles/:id/
func QueMiPuzzlePatch(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	pk := c.Param("id")
	var req struct {
		IsDisabled *bool   `json:"is_disabled"`
		Name       *string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if req.IsDisabled == nil && req.Name == nil {
		respondError(c, http.StatusBadRequest, "No fields to update")
		return
	}
	var row models.QueMiPuzzle
	if err := config.DB.Preload("CreatedBy").Where("id = ?", pk).First(&row).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	isAdmin := user.IsStaff
	isOwner := user.ID == row.CreatedByID
	updates := map[string]interface{}{}
	if req.IsDisabled != nil {
		if !isAdmin {
			respondError(c, http.StatusForbidden, "Admin required")
			return
		}
		updates["is_disabled"] = *req.IsDisabled
	}
	if req.Name != nil {
		if !isAdmin && !isOwner {
			respondError(c, http.StatusForbidden, "Forbidden")
			return
		}
		name := queMiNormalizePuzzleName(*req.Name)
		if name == "" {
			respondError(c, http.StatusBadRequest, "Name required")
			return
		}
		updates["name"] = name
	}
	if err := config.DB.Model(&row).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to update puzzle")
		return
	}
	config.DB.Preload("CreatedBy").First(&row, row.ID)
	respondOK(c, queMiSerializePuzzle(&row, user, isAdmin || isOwner))
}

func queMiSerializeAttempt(a *models.QueMiAttempt, withSubmits bool, revealed *quemi.QueMiPuzzle) gin.H {
	data := gin.H{
		"id":             a.ID,
		"puzzle_id":      a.PuzzleID,
		"status":         a.Status,
		"attempts_left":  a.AttemptsLeft,
		"attempts_used":  a.AttemptsUsed,
		"won":            a.Won,
		"duration_ms":    a.DurationMs,
		"started_at":     formatTime(a.StartedAt),
		"finished_at":    formatTimePointer(a.FinishedAt),
		"session_state":  a.SessionState.AsMap(),
	}
	if revealed != nil {
		data["revealed_puzzle"] = *revealed
	}
	if withSubmits {
		var submits []models.QueMiSubmit
		config.DB.Where("attempt_id = ?", a.ID).Order("attempt_no ASC").Find(&submits)
		subList := make([]gin.H, 0, len(submits))
		for _, s := range submits {
			subList = append(subList, gin.H{
				"attempt_no": s.AttemptNo,
				"guess":      s.Guess.AsInterface(),
				"feedback":   s.Feedback.AsInterface(),
				"correct":    s.Correct,
				"created_at": formatTime(s.CreatedAt),
			})
		}
		data["submits"] = subList
	}
	return data
}

// QueMiStartAttempt POST /que-mi/puzzles/:id/start/
func QueMiStartAttempt(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	pk := c.Param("id")
	var row models.QueMiPuzzle
	if err := config.DB.Where("id = ?", pk).First(&row).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if row.IsDisabled {
		respondError(c, http.StatusForbidden, "Puzzle is disabled")
		return
	}
	if user.ID == row.CreatedByID {
		respondError(c, http.StatusForbidden, "Creator cannot play own puzzle")
		return
	}

	puzzle, _ := queMiParsePuzzleData(row.PuzzleData)

	var attempt models.QueMiAttempt
	err := config.DB.Where("puzzle_id = ? AND user_id = ?", pk, user.ID).First(&attempt).Error
	if err == nil {
		if attempt.Status != models.QueMiAttemptStatusInProgress {
			respondError(c, http.StatusForbidden, "Already finished")
			return
		}
		respondOK(c, gin.H{
			"attempt": queMiSerializeAttempt(&attempt, true, nil),
			"puzzle":  queMiSerializePuzzleForPlay(puzzle),
		})
		return
	}
	if err != gorm.ErrRecordNotFound {
		respondError(c, http.StatusInternalServerError, "Database error")
		return
	}

	attempt = models.QueMiAttempt{
		ID:           newUUID(),
		PuzzleID:     pk,
		UserID:       user.ID,
		Status:       models.QueMiAttemptStatusInProgress,
		AttemptsLeft: puzzle.MaxAttempts,
		SessionState: models.JSONField("{}"),
	}
	if err := config.DB.Create(&attempt).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to start attempt")
		return
	}
	respondCreated(c, gin.H{
		"attempt": queMiSerializeAttempt(&attempt, false, nil),
		"puzzle":  queMiSerializePuzzleForPlay(puzzle),
	})
}

func queMiSerializePuzzleForPlay(p quemi.QueMiPuzzle) gin.H {
	queMiStripAnswers(&p)
	return gin.H{
		"id":              p.ID,
		"type":            p.Type,
		"difficulty":      p.Difficulty,
		"max_attempts":    p.MaxAttempts,
		"hand_mode":       p.HandMode,
		"open_meld_count": p.OpenMeldCount,
		"field_wind":      p.FieldWind,
		"seat_wind":       p.SeatWind,
		"agari_way":       p.AgariWay,
		"dora":            p.Dora,
		"shanten":         p.Shanten,
	}
}

// QueMiSubmitAnswer POST /que-mi/puzzles/:id/submit/
func QueMiSubmitAnswer(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	pk := c.Param("id")
	var row models.QueMiPuzzle
	if err := config.DB.Where("id = ?", pk).First(&row).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	puzzle, _ := queMiParsePuzzleData(row.PuzzleData)

	var attempt models.QueMiAttempt
	if err := config.DB.Where("puzzle_id = ? AND user_id = ?", pk, user.ID).First(&attempt).Error; err != nil {
		respondError(c, http.StatusForbidden, "Start attempt first")
		return
	}
	if attempt.Status != models.QueMiAttemptStatusInProgress {
		respondError(c, http.StatusForbidden, "Already finished")
		return
	}

	var req struct {
		Guess     []string              `json:"guess"`
		OpenGuess *quemi.QueMiOpenGuess `json:"open_guess"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	var vr quemi.ValidateResult
	var feedback interface{}

	if puzzle.HandMode == quemi.HandModeOpen && req.OpenGuess != nil {
		og := *req.OpenGuess
		vr = quemi.ValidateOpenGuess(puzzle, og)
		if vr.OK {
			fb := quemi.CompareOpenGuessFeedback(puzzle, og)
			feedback = fb
		}
	} else {
		guess := make([]string, 14)
		for i := 0; i < 14 && i < len(req.Guess); i++ {
			guess[i] = req.Guess[i]
		}
		vr = quemi.ValidateGuess(puzzle, guess)
		if vr.OK {
			feedback = quemi.CompareGuessFeedback(puzzle.Answer, guess)
		}
	}

	if !vr.OK {
		respondOK(c, gin.H{
			"ok":             false,
			"reason":         string(vr.Reason),
			"attempts_left":  attempt.AttemptsLeft,
			"status":         attempt.Status,
		})
		return
	}

	attempt.AttemptsUsed++
	attempt.AttemptsLeft--
	guessJF, _ := models.NewJSONField(gin.H{"guess": req.Guess, "open_guess": req.OpenGuess})
	feedbackJF, _ := models.NewJSONField(feedback)
	submit := models.QueMiSubmit{
		ID:        newUUID(),
		AttemptID: attempt.ID,
		AttemptNo: attempt.AttemptsUsed,
		Guess:     guessJF,
		Feedback:  feedbackJF,
		Correct:   vr.Correct,
	}
	config.DB.Create(&submit)

	won := false
	if vr.Correct {
		attempt.Status = models.QueMiAttemptStatusWon
		attempt.Won = true
		now := time.Now()
		attempt.FinishedAt = &now
		attempt.DurationMs = int(now.Sub(attempt.StartedAt).Milliseconds())
		won = true
	} else if attempt.AttemptsLeft <= 0 {
		attempt.Status = models.QueMiAttemptStatusLost
		now := time.Now()
		attempt.FinishedAt = &now
		attempt.DurationMs = int(now.Sub(attempt.StartedAt).Milliseconds())
	}
	config.DB.Save(&attempt)

	resp := gin.H{
		"ok":            true,
		"correct":       vr.Correct,
		"feedback":      feedback,
		"attempts_left": attempt.AttemptsLeft,
		"status":        attempt.Status,
		"won":           won,
	}
	if attempt.Status != models.QueMiAttemptStatusInProgress {
		resp["revealed_puzzle"] = puzzle
		resp["attempt"] = queMiSerializeAttempt(&attempt, true, &puzzle)
	}
	respondOK(c, resp)
}

// QueMiGiveUp POST /que-mi/puzzles/:id/give-up/
func QueMiGiveUp(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	pk := c.Param("id")
	var attempt models.QueMiAttempt
	if err := config.DB.Where("puzzle_id = ? AND user_id = ?", pk, user.ID).First(&attempt).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if attempt.Status != models.QueMiAttemptStatusInProgress {
		respondError(c, http.StatusForbidden, "Already finished")
		return
	}
	attempt.Status = models.QueMiAttemptStatusLost
	now := time.Now()
	attempt.FinishedAt = &now
	attempt.DurationMs = int(now.Sub(attempt.StartedAt).Milliseconds())
	config.DB.Save(&attempt)
	var row models.QueMiPuzzle
	if err := config.DB.Where("id = ?", pk).First(&row).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	puzzle, _ := queMiParsePuzzleData(row.PuzzleData)
	respondOK(c, gin.H{
		"attempt":         queMiSerializeAttempt(&attempt, true, &puzzle),
		"revealed_puzzle": puzzle,
	})
}

// QueMiLeaderboard GET /que-mi/puzzles/:id/leaderboard/
func QueMiLeaderboard(c *gin.Context) {
	pk := c.Param("id")
	var attempts []models.QueMiAttempt
	config.DB.Where("puzzle_id = ? AND status IN ?",
		pk, []string{models.QueMiAttemptStatusWon, models.QueMiAttemptStatusLost}).
		Find(&attempts)

	type entry struct {
		userID       uint64
		attemptsUsed int
		durationMs   int
		finishedAt   time.Time
		won          bool
	}
	entries := make([]entry, 0, len(attempts))
	for _, a := range attempts {
		entries = append(entries, entry{
			userID:       a.UserID,
			attemptsUsed: a.AttemptsUsed,
			durationMs:   a.DurationMs,
			finishedAt:   derefTime(a.FinishedAt),
			won:          a.Won,
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].won != entries[j].won {
			return entries[i].won
		}
		if entries[i].won {
			if entries[i].attemptsUsed != entries[j].attemptsUsed {
				return entries[i].attemptsUsed < entries[j].attemptsUsed
			}
			if entries[i].durationMs != entries[j].durationMs {
				return entries[i].durationMs < entries[j].durationMs
			}
			return entries[i].finishedAt.Before(entries[j].finishedAt)
		}
		if entries[i].finishedAt != entries[j].finishedAt {
			return entries[i].finishedAt.After(entries[j].finishedAt)
		}
		return entries[i].userID < entries[j].userID
	})

	out := make([]gin.H, 0, len(entries))
	winRank := 0
	for _, e := range entries {
		var u models.User
		name := ""
		playerID := ""
		if config.DB.First(&u, e.userID).Error == nil {
			name = queMiUserNickname(&u)
			if u.PlayerID != nil {
				playerID = *u.PlayerID
			}
		}
		var rank interface{}
		if e.won {
			winRank++
			rank = winRank
		}
		out = append(out, gin.H{
			"rank":          rank,
			"user_id":       e.userID,
			"player_id":     playerID,
			"nickname":      name,
			"attempts_used": e.attemptsUsed,
			"duration_ms":   e.durationMs,
			"finished_at":   formatTime(e.finishedAt),
			"won":           e.won,
		})
	}
	respondOK(c, out)
}

// QueMiPuzzleAttemptDetail GET /que-mi/puzzles/:id/attempts/:user_id/
func QueMiPuzzleAttemptDetail(c *gin.Context) {
	viewer := middleware.GetUser(c)
	if viewer == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	pk := c.Param("id")
	targetUserID := parsePathUint64(c.Param("user_id"))
	if targetUserID == 0 {
		respondError(c, http.StatusBadRequest, "Invalid user_id")
		return
	}
	var row models.QueMiPuzzle
	if err := config.DB.Preload("CreatedBy").Where("id = ?", pk).First(&row).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	if !queMiCanViewOthersAttempts(&row, viewer) {
		respondError(c, http.StatusForbidden, "Forbidden")
		return
	}
	var attempt models.QueMiAttempt
	if err := config.DB.Where("puzzle_id = ? AND user_id = ?", pk, targetUserID).First(&attempt).Error; err != nil {
		respondError(c, http.StatusNotFound, "Not found")
		return
	}
	puzzleFull, _ := queMiParsePuzzleData(row.PuzzleData)
	var revealed *quemi.QueMiPuzzle
	if attempt.Status != models.QueMiAttemptStatusInProgress {
		revealed = &puzzleFull
	}
	respondOK(c, gin.H{
		"attempt": queMiSerializeAttempt(&attempt, true, revealed),
		"nickname": queMiNicknameForUserID(targetUserID),
	})
}

func queMiNicknameForUserID(userID uint64) string {
	var u models.User
	if config.DB.First(&u, userID).Error != nil {
		return ""
	}
	return queMiUserNickname(&u)
}

// QueMiGlobalLeaderboard GET /que-mi/leaderboard/
func QueMiGlobalLeaderboard(c *gin.Context) {
	category := c.Query("category")
	difficulty := c.Query("difficulty")
	typeFilter := c.Query("type")
	handMode := c.Query("hand_mode")

	var attempts []models.QueMiAttempt
	config.DB.Where("status IN ?",
		[]string{models.QueMiAttemptStatusWon, models.QueMiAttemptStatusLost}).Find(&attempts)

	type userStats struct {
		userID           uint64
		wins             int
		played           int
		totalWinDuration int
		totalWinAttempts int
	}
	stats := make(map[uint64]*userStats)

	for _, a := range attempts {
		var row models.QueMiPuzzle
		if config.DB.Where("id = ?", a.PuzzleID).First(&row).Error != nil {
			continue
		}
		p, err := queMiParsePuzzleData(row.PuzzleData)
		if err != nil {
			continue
		}
		if category != "" {
			if !queMiPuzzleMatchesCategory(p, category) {
				continue
			}
		} else {
			if difficulty != "" && string(p.Difficulty) != difficulty {
				continue
			}
			if typeFilter != "" && string(p.Type) != typeFilter {
				continue
			}
			if handMode != "" && string(p.HandMode) != handMode {
				continue
			}
		}
		s := stats[a.UserID]
		if s == nil {
			s = &userStats{userID: a.UserID}
			stats[a.UserID] = s
		}
		s.played++
		if a.Won {
			s.wins++
			s.totalWinDuration += a.DurationMs
			s.totalWinAttempts += a.AttemptsUsed
		}
	}

	entries := make([]*userStats, 0, len(stats))
	for _, s := range stats {
		entries = append(entries, s)
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].wins > 0 && entries[j].wins > 0 {
			avgAttemptsI := float64(entries[i].totalWinAttempts) / float64(entries[i].wins)
			avgAttemptsJ := float64(entries[j].totalWinAttempts) / float64(entries[j].wins)
			if avgAttemptsI != avgAttemptsJ {
				return avgAttemptsI < avgAttemptsJ
			}
			if entries[i].wins != entries[j].wins {
				return entries[i].wins > entries[j].wins
			}
			avgDurI := float64(entries[i].totalWinDuration) / float64(entries[i].wins)
			avgDurJ := float64(entries[j].totalWinDuration) / float64(entries[j].wins)
			if avgDurI != avgDurJ {
				return avgDurI < avgDurJ
			}
			return entries[i].userID < entries[j].userID
		}
		if entries[i].wins > 0 {
			return true
		}
		if entries[j].wins > 0 {
			return false
		}
		if entries[i].played != entries[j].played {
			return entries[i].played > entries[j].played
		}
		return entries[i].userID < entries[j].userID
	})

	out := make([]gin.H, 0, len(entries))
	for rank, s := range entries {
		var u models.User
		name := ""
		playerID := ""
		if config.DB.First(&u, s.userID).Error == nil {
			name = queMiUserNickname(&u)
			if u.PlayerID != nil {
				playerID = *u.PlayerID
			}
		}
		avgAttempts := interface{}(nil)
		avgDuration := interface{}(nil)
		if s.wins > 0 {
			avgAttempts = float64(s.totalWinAttempts) / float64(s.wins)
			avgDuration = float64(s.totalWinDuration) / float64(s.wins)
		}
		out = append(out, gin.H{
			"rank":          rank + 1,
			"user_id":       s.userID,
			"player_id":     playerID,
			"nickname":      name,
			"wins":          s.wins,
			"played":        s.played,
			"avg_attempts":  avgAttempts,
			"avg_duration_ms": avgDuration,
		})
	}
	respondOK(c, out)
}

// QueMiCreatorLeaderboard GET /que-mi/creator-leaderboard/
func QueMiCreatorLeaderboard(c *gin.Context) {
	category := c.Query("category")

	var puzzles []models.QueMiPuzzle
	config.DB.Preload("CreatedBy").Find(&puzzles)

	type creatorStats struct {
		userID      uint64
		totalUsage  int
		puzzleCount int
		playCount   int
	}
	stats := make(map[uint64]*creatorStats)

	for _, row := range puzzles {
		p, err := queMiParsePuzzleData(row.PuzzleData)
		if err != nil {
			continue
		}
		if !queMiPuzzleMatchesCategory(p, category) {
			continue
		}
		var attempts []models.QueMiAttempt
		config.DB.Where("puzzle_id = ? AND user_id != ? AND status IN ?",
			row.ID, row.CreatedByID,
			[]string{models.QueMiAttemptStatusWon, models.QueMiAttemptStatusLost}).
			Find(&attempts)
		if len(attempts) == 0 {
			continue
		}
		s := stats[row.CreatedByID]
		if s == nil {
			s = &creatorStats{userID: row.CreatedByID}
			stats[row.CreatedByID] = s
		}
		s.puzzleCount++
		for _, a := range attempts {
			s.playCount++
			s.totalUsage += queMiEffectiveAttemptUsage(a.Status, a.AttemptsUsed, p.MaxAttempts)
		}
	}

	entries := make([]*creatorStats, 0, len(stats))
	for _, s := range stats {
		entries = append(entries, s)
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].totalUsage != entries[j].totalUsage {
			return entries[i].totalUsage > entries[j].totalUsage
		}
		if entries[i].playCount != entries[j].playCount {
			return entries[i].playCount > entries[j].playCount
		}
		if entries[i].puzzleCount != entries[j].puzzleCount {
			return entries[i].puzzleCount > entries[j].puzzleCount
		}
		return entries[i].userID < entries[j].userID
	})

	out := make([]gin.H, 0, len(entries))
	for rank, s := range entries {
		var u models.User
		name := ""
		playerID := ""
		if config.DB.First(&u, s.userID).Error == nil {
			name = queMiUserNickname(&u)
			if u.PlayerID != nil {
				playerID = *u.PlayerID
			}
		}
		out = append(out, gin.H{
			"rank":          rank + 1,
			"user_id":       s.userID,
			"player_id":     playerID,
			"nickname":      name,
			"total_usage":   s.totalUsage,
			"puzzle_count":  s.puzzleCount,
			"play_count":    s.playCount,
		})
	}
	respondOK(c, out)
}

func derefTime(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}

// QueMiMyPuzzles GET /que-mi/my-puzzles/
func QueMiMyPuzzles(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var rows []models.QueMiPuzzle
	config.DB.Where("created_by_id = ?", user.ID).Preload("CreatedBy").Order("created_at DESC").Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		out = append(out, queMiSerializePuzzle(&rows[i], user, true))
	}
	respondOK(c, out)
}

// QueMiMyAttempts GET /que-mi/my-attempts/
func QueMiMyAttempts(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var attempts []models.QueMiAttempt
	config.DB.Where("user_id = ?", user.ID).Order("started_at DESC").Find(&attempts)
	out := make([]gin.H, 0, len(attempts))
	for i := range attempts {
		var puzzleRow models.QueMiPuzzle
		puzzleSummary := gin.H{"id": attempts[i].PuzzleID}
		var revealed *quemi.QueMiPuzzle
		if config.DB.Where("id = ?", attempts[i].PuzzleID).First(&puzzleRow).Error == nil {
			p, _ := queMiParsePuzzleData(puzzleRow.PuzzleData)
			puzzleSummary = gin.H{
				"id":              puzzleRow.ID,
				"type":            p.Type,
				"difficulty":      p.Difficulty,
				"hand_mode":       p.HandMode,
				"open_meld_count": p.OpenMeldCount,
			}
			if attempts[i].Status != models.QueMiAttemptStatusInProgress {
				revealed = &p
			}
		}
		withSubmits := attempts[i].Status != models.QueMiAttemptStatusInProgress
		out = append(out, gin.H{
			"attempt": queMiSerializeAttempt(&attempts[i], withSubmits, revealed),
			"puzzle":  puzzleSummary,
		})
	}
	respondOK(c, out)
}

// QueMiAdminPuzzleList GET /admin/que-mi/puzzles/
func QueMiAdminPuzzleList(c *gin.Context) {
	var rows []models.QueMiPuzzle
	config.DB.Preload("CreatedBy").Order("created_at DESC").Find(&rows)
	viewer := middleware.GetUser(c)
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		out = append(out, queMiSerializePuzzle(&rows[i], viewer, true))
	}
	respondOK(c, out)
}

// QueMiBlacklistList GET /admin/que-mi/blacklist/
func QueMiBlacklistList(c *gin.Context) {
	var rows []models.QueMiCreatorBlacklist
	config.DB.Preload("User").Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		name := ""
		if r.User != nil {
			name = queMiUserNickname(r.User)
		}
		out = append(out, gin.H{
			"user_id":    r.UserID,
			"username":   usernameForUserID(r.UserID),
			"nickname":   name,
			"created_at": formatTime(r.CreatedAt),
		})
	}
	respondOK(c, out)
}

func usernameForUserID(id uint64) string {
	var u models.User
	if config.DB.First(&u, id).Error == nil {
		return u.Username
	}
	return ""
}

// QueMiBlacklistAdd POST /admin/que-mi/blacklist/
func QueMiBlacklistAdd(c *gin.Context) {
	admin := middleware.GetUser(c)
	var req struct {
		UserID   uint64 `json:"user_id"`
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	userID := req.UserID
	if userID == 0 && req.Username != "" {
		var u models.User
		if config.DB.Where("username = ?", req.Username).First(&u).Error != nil {
			respondError(c, http.StatusNotFound, "User not found")
			return
		}
		userID = u.ID
	}
	if userID == 0 {
		respondError(c, http.StatusBadRequest, "user_id or username required")
		return
	}
	var existing models.QueMiCreatorBlacklist
	if config.DB.Where("user_id = ?", userID).First(&existing).Error == nil {
		respondOK(c, gin.H{"user_id": userID, "already_exists": true})
		return
	}
	row := models.QueMiCreatorBlacklist{
		UserID:      userID,
		BlockedByID: admin.ID,
	}
	config.DB.Create(&row)
	respondCreated(c, gin.H{"user_id": userID})
}

// QueMiBlacklistRemove DELETE /admin/que-mi/blacklist/:user_id/
func QueMiBlacklistRemove(c *gin.Context) {
	userID := parsePathUint64(c.Param("user_id"))
	if userID == 0 {
		respondError(c, http.StatusBadRequest, "Invalid user_id")
		return
	}
	config.DB.Where("user_id = ?", userID).Delete(&models.QueMiCreatorBlacklist{})
	respondNoContent(c)
}

func parsePathUint64(s string) uint64 {
	var n uint64
	for _, ch := range s {
		if ch >= '0' && ch <= '9' {
			n = n*10 + uint64(ch-'0')
		}
	}
	return n
}
