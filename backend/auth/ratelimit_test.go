package auth

import (
	"testing"
	"time"

	"mahjong-backend/models"
)

func TestRecordLoginFailureLocksAfterFiveAttempts(t *testing.T) {
	now := time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC)
	user := &models.User{}

	for i := 0; i < 4; i++ {
		RecordLoginFailure(user, now.Add(time.Duration(i)*time.Minute))
		if IsLoginLocked(user, now) {
			t.Fatalf("expected not locked after %d failures", i+1)
		}
	}

	RecordLoginFailure(user, now.Add(4*time.Minute))
	if !IsLoginLocked(user, now.Add(4*time.Minute)) {
		t.Fatal("expected locked after 5 failures within 5 minutes")
	}
	if user.LockedUntil == nil {
		t.Fatal("expected locked_until to be set")
	}
}

func TestRecordLoginSuccessResetsLock(t *testing.T) {
	now := time.Now()
	user := &models.User{LoginFailCount: 5}
	locked := now.Add(15 * time.Minute)
	user.LockedUntil = &locked

	RecordLoginSuccess(user, now, "127.0.0.1")
	if user.LoginFailCount != 0 {
		t.Fatalf("expected fail count 0, got %d", user.LoginFailCount)
	}
	if user.LockedUntil != nil {
		t.Fatal("expected locked_until cleared")
	}
	if user.LastLoginIP != "127.0.0.1" {
		t.Fatalf("expected IP saved, got %q", user.LastLoginIP)
	}
}

func TestFailureWindowResetsAfterFiveMinutes(t *testing.T) {
	now := time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC)
	user := &models.User{}
	RecordLoginFailure(user, now)
	RecordLoginFailure(user, now.Add(2*time.Minute))
	if user.LoginFailCount != 2 {
		t.Fatalf("expected 2 failures, got %d", user.LoginFailCount)
	}

	RecordLoginFailure(user, now.Add(8*time.Minute))
	if user.LoginFailCount != 1 {
		t.Fatalf("expected window reset to 1 failure after 6+ min gap, got %d", user.LoginFailCount)
	}
}
