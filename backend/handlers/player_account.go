package handlers

import (
	"errors"
	"net/http"
	"strings"

	"mahjong-backend/auth"
	"mahjong-backend/config"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func findUserForLogin(name string) (*models.User, error) {
	name = strings.TrimSpace(name)
	var user models.User
	if err := config.DB.Where("username = ?", name).First(&user).Error; err == nil {
		return &user, nil
	}
	if strings.Contains(name, "@") {
		if err := config.DB.Where("LOWER(email) = ?", normalizeEmail(name)).First(&user).Error; err == nil {
			return &user, nil
		}
	}
	var player models.Player
	if err := config.DB.Where("nickname = ?", name).First(&player).Error; err != nil {
		return nil, err
	}
	return findUserByPlayerID(player.ID)
}

func findUserByPlayerID(playerID string) (*models.User, error) {
	var user models.User
	err := config.DB.Where("player_id = ?", playerID).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &user, err
}

func playerAccountData(u *models.User) gin.H {
	if u == nil {
		return gin.H{
			"has_account": false,
		}
	}
	return gin.H{
		"has_account":             true,
		"user_id":                 u.ID,
		"username":                u.Username,
		"email":                   u.Email,
		"system_password":         u.SystemPassword,
		"has_system_password":     u.SystemPassword != "",
		"is_admin":                u.IsStaff,
		"is_active":               u.IsActive,
		"login_fail_count":        u.LoginFailCount,
		"last_login_ip":           u.LastLoginIP,
		"last_login_attempt_at":   formatTimePointer(u.LastLoginAttemptAt),
		"locked_until":            formatTimePointer(u.LockedUntil),
		"requires_password_reset": userRequiresPasswordReset(u),
	}
}

func uniqueUsername(base string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "player"
	}
	candidate := base
	for i := 0; i < 100; i++ {
		var count int64
		config.DB.Model(&models.User{}).Where("username = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = base + "_" + newUUID()[:8]
	}
	return base + "_" + newUUID()[:8]
}

func createUserForPlayer(player *models.Player, email, password string, isAdmin bool) (*models.User, error) {
	if existing, _ := findUserByPlayerID(player.ID); existing != nil {
		return existing, nil
	}
	pid := player.ID
	user := models.User{
		Username:  uniqueUsername(player.Nickname),
		Email:     normalizeEmail(email),
		PlayerID:  &pid,
		IsStaff:   isAdmin,
		IsActive:  true,
	}
	if password != "" {
		user.Password = auth.HashPassword(password)
	}
	if err := config.DB.Create(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func UnboundUserList(c *gin.Context) {
	var users []models.User
	if err := config.DB.Where("player_id IS NULL OR player_id = ''").Order("username ASC").Find(&users).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to list users")
		return
	}
	result := make([]gin.H, 0, len(users))
	for i := range users {
		result = append(result, gin.H{
			"id":       users[i].ID,
			"username": users[i].Username,
			"email":    users[i].Email,
			"is_admin": users[i].IsStaff,
		})
	}
	respondOK(c, result)
}

func PlayerBindAccount(c *gin.Context) {
	if middleware.GetUser(c) == nil || !middleware.GetUser(c).IsStaff {
		respondError(c, http.StatusForbidden, "Admin required")
		return
	}
	pk := c.Param("pk")
	var player models.Player
	if err := config.DB.Where("id = ?", pk).First(&player).Error; err != nil {
		respondError(c, http.StatusNotFound, "Player not found")
		return
	}
	if existing, _ := findUserByPlayerID(player.ID); existing != nil {
		respondError(c, http.StatusConflict, "Player already has an account")
		return
	}
	var req struct {
		UserID uint64 `json:"user_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.UserID == 0 {
		respondError(c, http.StatusBadRequest, "user_id required")
		return
	}
	var user models.User
	err := config.DB.Where("id = ? AND (player_id IS NULL OR player_id = '')", req.UserID).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		respondError(c, http.StatusBadRequest, "User not found or already bound to a player")
		return
	}
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to load user")
		return
	}
	pid := player.ID
	if err := config.DB.Model(&user).Update("player_id", pid).Error; err != nil {
		respondError(c, http.StatusBadRequest, "Failed to bind account")
		return
	}
	config.DB.First(&user, user.ID)
	respondOK(c, playerAccountData(&user))
}

func PlayerEnableAccount(c *gin.Context) {
	if middleware.GetUser(c) == nil || !middleware.GetUser(c).IsStaff {
		respondError(c, http.StatusForbidden, "Admin required")
		return
	}
	pk := c.Param("pk")
	var player models.Player
	if err := config.DB.Where("id = ?", pk).First(&player).Error; err != nil {
		respondError(c, http.StatusNotFound, "Player not found")
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		IsAdmin  bool   `json:"is_admin"`
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	if existing, _ := findUserByPlayerID(player.ID); existing != nil {
		respondError(c, http.StatusConflict, "Account already exists")
		return
	}
	pid := player.ID
	username := strings.TrimSpace(req.Username)
	if username == "" {
		username = uniqueUsername(player.Nickname)
	}
	user := models.User{
		Username: username,
		Email:    normalizeEmail(req.Email),
		PlayerID: &pid,
		IsStaff:  req.IsAdmin,
		IsActive: true,
	}
	if req.Password != "" {
		user.Password = auth.HashPassword(req.Password)
	}
	if err := config.DB.Create(&user).Error; err != nil {
		respondError(c, http.StatusBadRequest, "Failed to create account: "+err.Error())
		return
	}
	respondCreated(c, playerAccountData(&user))
}

func PlayerUpdateAccount(c *gin.Context) {
	if middleware.GetUser(c) == nil || !middleware.GetUser(c).IsStaff {
		respondError(c, http.StatusForbidden, "Admin required")
		return
	}
	pk := c.Param("pk")
	user, err := findUserByPlayerID(pk)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to load account")
		return
	}
	if user == nil {
		respondError(c, http.StatusNotFound, "Account not found")
		return
	}
	var req struct {
		Email    *string `json:"email"`
		IsAdmin  *bool   `json:"is_admin"`
		IsActive *bool   `json:"is_active"`
		Username *string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	updates := map[string]interface{}{}
	if req.Email != nil {
		updates["email"] = normalizeEmail(*req.Email)
	}
	if req.IsAdmin != nil {
		updates["is_staff"] = *req.IsAdmin
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.Username != nil {
		updates["username"] = strings.TrimSpace(*req.Username)
	}
	if len(updates) > 0 {
		if err := config.DB.Model(user).Updates(updates).Error; err != nil {
			respondError(c, http.StatusBadRequest, "Failed to update account")
			return
		}
	}
	config.DB.First(user, user.ID)
	respondOK(c, playerAccountData(user))
}

func PlayerSetPassword(c *gin.Context) {
	if middleware.GetUser(c) == nil || !middleware.GetUser(c).IsStaff {
		respondError(c, http.StatusForbidden, "Admin required")
		return
	}
	pk := c.Param("pk")
	user, err := findUserByPlayerID(pk)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to load account")
		return
	}
	if user == nil {
		respondError(c, http.StatusNotFound, "Account not found, enable account first")
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req.Password = strings.TrimSpace(req.Password)
	if len(req.Password) < 6 {
		respondError(c, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}
	hashed := auth.HashPassword(req.Password)
	updates := map[string]interface{}{
		"password":        hashed,
		"system_password": "",
	}
	if err := config.DB.Model(user).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to set password")
		return
	}
	config.DB.First(user, user.ID)
	respondOK(c, playerAccountData(user))
}

func PlayerResetSystemPassword(c *gin.Context) {
	if middleware.GetUser(c) == nil || !middleware.GetUser(c).IsStaff {
		respondError(c, http.StatusForbidden, "Admin required")
		return
	}
	pk := c.Param("pk")
	user, err := findUserByPlayerID(pk)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to load account")
		return
	}
	if user == nil {
		respondError(c, http.StatusNotFound, "Account not found, enable account first")
		return
	}
	if strings.TrimSpace(user.Email) == "" {
		respondError(c, http.StatusBadRequest, "Email required before resetting password")
		return
	}
	sysPwd := generateSystemPassword()
	updates := map[string]interface{}{
		"password":        "",
		"system_password": sysPwd,
	}
	if err := config.DB.Model(user).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to reset system password")
		return
	}
	config.DB.First(user, user.ID)
	respondOK(c, playerAccountData(user))
}

func attachPlayerAccountForAdmin(data gin.H, playerID string) {
	user, err := findUserByPlayerID(playerID)
	if err != nil {
		return
	}
	data["account"] = playerAccountData(user)
}
