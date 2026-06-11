package auth

import (
	"time"

	"mahjong-backend/models"
)

const (
	loginFailWindow    = 5 * time.Minute
	loginFailThreshold = 5
	loginLockDuration  = 15 * time.Minute
)

// IsLoginLocked reports whether the user is currently locked out.
func IsLoginLocked(user *models.User, now time.Time) bool {
	return user.LockedUntil != nil && user.LockedUntil.After(now)
}

// RecordLoginFailure updates fail count and may lock the account.
func RecordLoginFailure(user *models.User, now time.Time) {
	if user.LastLoginAttemptAt != nil && now.Sub(*user.LastLoginAttemptAt) > loginFailWindow {
		user.LoginFailCount = 0
	}
	user.LoginFailCount++
	t := now
	user.LastLoginAttemptAt = &t
	if user.LoginFailCount >= loginFailThreshold {
		locked := now.Add(loginLockDuration)
		user.LockedUntil = &locked
	}
}

// RecordLoginSuccess clears lock state after a successful login.
func RecordLoginSuccess(user *models.User, now time.Time, ip string) {
	user.LoginFailCount = 0
	user.LockedUntil = nil
	t := now
	user.LastLoginAttemptAt = &t
	user.LastLoginIP = ip
}
