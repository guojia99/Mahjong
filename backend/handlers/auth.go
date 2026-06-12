package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"mahjong-backend/auth"
	"mahjong-backend/config"
	"mahjong-backend/email"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

type loginRequest struct {
	Username       string `json:"username"`
	Password       string `json:"password"`
	SystemPassword string `json:"system_password"`
}

type verificationSendRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Purpose  string `json:"purpose"`
}

type resetPasswordConfirmRequest struct {
	Username       string `json:"username"`
	Email          string `json:"email"`
	Code           string `json:"code"`
	NewPassword    string `json:"new_password"`
	SystemPassword string `json:"system_password"`
}

type bindEmailConfirmRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"new_password"`
}

type changeEmailConfirmRequest struct {
	Email    string `json:"email"`
	NewEmail string `json:"new_email"`
	Code     string `json:"code"`
}

type changePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

func Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		respondError(c, http.StatusBadRequest, "Username required")
		return
	}
	if req.Password == "" && req.SystemPassword == "" {
		respondError(c, http.StatusBadRequest, "Password required")
		return
	}

	ip := clientIP(c)
	now := nowUTC()

	userPtr, err := findUserForLogin(req.Username)
	if err != nil || userPtr == nil {
		writeLoginLog(nil, nil, req.Username, ip, models.LoginActionFail, "user not found")
		respondError(c, http.StatusUnauthorized, "Invalid credentials")
		return
	}
	user := *userPtr

	if !user.IsActive {
		writeLoginLog(&user.ID, user.PlayerID, user.Username, ip, models.LoginActionFail, "inactive")
		respondError(c, http.StatusUnauthorized, "User not active")
		return
	}

	if auth.IsLoginLocked(&user, now) {
		writeLoginLog(&user.ID, user.PlayerID, user.Username, ip, models.LoginActionFail, "locked")
		respondError(c, http.StatusLocked, "Account locked, try again later")
		return
	}

	requiresReset := false
	authenticated := false

	if req.Password != "" && user.HasPassword() && auth.CheckPassword(req.Password, user.Password) {
		authenticated = true
	} else if req.SystemPassword != "" && !user.HasPassword() && user.SystemPassword != "" && req.SystemPassword == user.SystemPassword {
		authenticated = true
		requiresReset = true
	} else if req.Password != "" && user.HasPassword() {
		// fall through to failure
	} else if req.SystemPassword != "" && user.HasPassword() {
		respondError(c, http.StatusUnauthorized, "System password not allowed for this account")
		return
	}

	if !authenticated {
		auth.RecordLoginFailure(&user, now)
		saveUserLoginState(&user)
		writeLoginLog(&user.ID, user.PlayerID, user.Username, ip, models.LoginActionFail, "invalid credentials")
		respondError(c, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	if requiresReset && strings.TrimSpace(user.Email) == "" {
		respondError(c, http.StatusBadRequest, "Email required before password reset, contact admin")
		return
	}

	auth.RecordLoginSuccess(&user, now, ip)
	saveUserLoginState(&user)
	writeLoginLog(&user.ID, user.PlayerID, user.Username, ip, models.LoginActionSuccess, "")

	tokenStr := generateToken()
	config.DB.Where("user_id = ?", user.ID).Delete(&middleware.AuthToken{})
	token := middleware.AuthToken{Key: tokenStr, UserID: user.ID}
	config.DB.Create(&token)

	respondOK(c, gin.H{
		"token": token.Key,
		"user": gin.H{
			"id":                      user.ID,
			"username":                user.Username,
			"player_id":               user.PlayerID,
			"email":                   maskEmail(user.Email),
			"created_at":              formatTime(user.CreatedAt),
			"is_admin":                user.IsStaff,
			"requires_password_reset": requiresReset,
		},
		"requires_password_reset": requiresReset,
	})
}

func Logout(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Not authenticated")
		return
	}
	writeLoginLog(&user.ID, user.PlayerID, user.Username, clientIP(c), models.LoginActionLogout, "")
	config.DB.Where("user_id = ?", user.ID).Delete(&middleware.AuthToken{})
	respondOK(c, gin.H{"message": "Logged out"})
}

func Me(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Not authenticated")
		return
	}
	respondOK(c, userToJSON(user, true))
}

func VerificationSend(c *gin.Context) {
	var req verificationSendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	req.Purpose = strings.TrimSpace(req.Purpose)

	if req.Username == "" || req.Email == "" || req.Purpose == "" {
		respondError(c, http.StatusBadRequest, "Username, email and purpose required")
		return
	}

	switch req.Purpose {
	case models.VerificationPurposeResetPassword, models.VerificationPurposeBindEmail, models.VerificationPurposeChangeEmail:
	default:
		respondError(c, http.StatusBadRequest, "Invalid purpose")
		return
	}

	userPtr, err := findUserForLogin(req.Username)
	if err != nil || userPtr == nil {
		respondError(c, http.StatusBadRequest, "User not found")
		return
	}
	user := *userPtr

	switch req.Purpose {
	case models.VerificationPurposeResetPassword:
		if user.Email == "" {
			respondError(c, http.StatusBadRequest, "User has no email, contact admin")
			return
		}
		if !emailsMatch(req.Email, user.Email) {
			respondError(c, http.StatusBadRequest, "Email does not match")
			return
		}
	case models.VerificationPurposeBindEmail:
		if user.Email != "" {
			respondError(c, http.StatusBadRequest, "Email already bound")
			return
		}
	case models.VerificationPurposeChangeEmail:
		if user.Email == "" {
			respondError(c, http.StatusBadRequest, "User has no email")
			return
		}
		if !emailsMatch(req.Email, user.Email) {
			respondError(c, http.StatusBadRequest, "Email does not match")
			return
		}
	}

	now := nowUTC()
	code, err := auth.CreateVerificationCode(user.ID, req.Purpose, now)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to create verification code")
		return
	}

	sendTo := req.Email
	if req.Purpose == models.VerificationPurposeChangeEmail {
		sendTo = user.Email
	}

	if err := email.SendVerificationEmail(sendTo, req.Purpose, code); err != nil {
		if !config.Cfg.EmailConfig.Enabled() {
			respondError(c, http.StatusServiceUnavailable, "Email service not configured")
			return
		}
		respondError(c, http.StatusInternalServerError, "Failed to send email")
		return
	}

	respondOK(c, gin.H{"message": "Verification code sent"})
}

func ResetPasswordConfirm(c *gin.Context) {
	var req resetPasswordConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	req.Code = strings.TrimSpace(strings.ToUpper(req.Code))

	if req.Username == "" || req.Email == "" || req.Code == "" || req.NewPassword == "" {
		respondError(c, http.StatusBadRequest, "All fields required")
		return
	}
	if len(req.NewPassword) < 6 {
		respondError(c, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	userPtr, err := findUserForLogin(req.Username)
	if err != nil || userPtr == nil {
		respondError(c, http.StatusBadRequest, "User not found")
		return
	}
	user := *userPtr
	if user.Email == "" {
		respondError(c, http.StatusBadRequest, "User has no email")
		return
	}
	if !emailsMatch(req.Email, user.Email) {
		respondError(c, http.StatusBadRequest, "Email does not match")
		return
	}

	// System password flow: must match when user has no regular password
	if !user.HasPassword() && user.SystemPassword != "" {
		if req.SystemPassword == "" || req.SystemPassword != user.SystemPassword {
			respondError(c, http.StatusBadRequest, "System password required")
			return
		}
	}

	now := nowUTC()
	if err := auth.VerifyCode(user.ID, models.VerificationPurposeResetPassword, req.Code, now); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid or expired verification code")
		return
	}

	hashed := auth.HashPassword(req.NewPassword)
	updates := map[string]interface{}{
		"password":        hashed,
		"system_password": "",
	}
	if err := config.DB.Model(&user).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to update password")
		return
	}

	writeLoginLog(&user.ID, user.PlayerID, user.Username, clientIP(c), models.LoginActionPasswordReset, "")
	respondOK(c, gin.H{"message": "Password reset successfully"})
}

func BindEmailConfirm(c *gin.Context) {
	var req bindEmailConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	req.Code = strings.TrimSpace(strings.ToUpper(req.Code))

	if req.Username == "" || req.Email == "" || req.Code == "" {
		respondError(c, http.StatusBadRequest, "Username, email and code required")
		return
	}

	userPtr, err := findUserForLogin(req.Username)
	if err != nil || userPtr == nil {
		respondError(c, http.StatusBadRequest, "User not found")
		return
	}
	user := *userPtr
	if user.Email != "" {
		respondError(c, http.StatusBadRequest, "Email already bound")
		return
	}

	now := nowUTC()
	if err := auth.VerifyCode(user.ID, models.VerificationPurposeBindEmail, req.Code, now); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid or expired verification code")
		return
	}

	if err := config.DB.Model(&user).Update("email", normalizeEmail(req.Email)).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to bind email")
		return
	}

	respondOK(c, gin.H{"message": "Email bound successfully"})
}

func ChangePassword(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req.OldPassword = strings.TrimSpace(req.OldPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)

	if req.OldPassword == "" || req.NewPassword == "" {
		respondError(c, http.StatusBadRequest, "Old and new password required")
		return
	}
	if len(req.NewPassword) < 6 {
		respondError(c, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}
	if !user.HasPassword() {
		respondError(c, http.StatusBadRequest, "No password set, use forgot password flow")
		return
	}
	if !auth.CheckPassword(req.OldPassword, user.Password) {
		respondError(c, http.StatusBadRequest, "Incorrect current password")
		return
	}

	hashed := auth.HashPassword(req.NewPassword)
	updates := map[string]interface{}{
		"password":        hashed,
		"system_password": "",
	}
	if err := config.DB.Model(user).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to update password")
		return
	}

	writeLoginLog(&user.ID, user.PlayerID, user.Username, clientIP(c), models.LoginActionPasswordReset, "change_password")
	respondOK(c, gin.H{"message": "Password changed successfully"})
}

func ChangeEmailConfirm(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		respondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req changeEmailConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	req.NewEmail = strings.TrimSpace(req.NewEmail)
	req.Code = strings.TrimSpace(strings.ToUpper(req.Code))

	if req.NewEmail == "" || req.Code == "" {
		respondError(c, http.StatusBadRequest, "New email and code required")
		return
	}
	if user.Email == "" {
		respondError(c, http.StatusBadRequest, "User has no email")
		return
	}
	if req.Email != "" && !emailsMatch(req.Email, user.Email) {
		respondError(c, http.StatusBadRequest, "Email does not match")
		return
	}

	now := nowUTC()
	if err := auth.VerifyCode(user.ID, models.VerificationPurposeChangeEmail, req.Code, now); err != nil {
		respondError(c, http.StatusBadRequest, "Invalid or expired verification code")
		return
	}

	if err := config.DB.Model(user).Update("email", normalizeEmail(req.NewEmail)).Error; err != nil {
		respondError(c, http.StatusInternalServerError, "Failed to change email")
		return
	}

	respondOK(c, gin.H{"message": "Email changed successfully"})
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])[:40]
}
