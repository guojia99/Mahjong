package auth

import (
	"strings"
	"testing"
)

func TestHashAndCheckPassword(t *testing.T) {
	h := HashPassword("secret")
	if !strings.HasPrefix(h, "md5$") {
		t.Fatalf("hash=%q want md5$ prefix", h)
	}
	if !CheckPassword("secret", h) {
		t.Fatal("expected match")
	}
	if CheckPassword("wrong", h) {
		t.Fatal("expected mismatch")
	}
}
