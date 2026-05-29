package auth

import (
	"crypto/md5"
	"encoding/hex"
	"strings"
)

const passwordPrefixMD5 = "md5$"

// HashPassword stores password as md5$<hex> (Go backend format).
func HashPassword(password string) string {
	sum := md5.Sum([]byte(password))
	return passwordPrefixMD5 + hex.EncodeToString(sum[:])
}

// CheckPassword verifies plaintext against a stored md5$ hash.
func CheckPassword(password, storedHash string) bool {
	if storedHash == "" || password == "" {
		return false
	}
	return HashPassword(password) == storedHash
}

// IsGoPasswordHash reports whether the stored value uses Go MD5 format.
func IsGoPasswordHash(storedHash string) bool {
	return strings.HasPrefix(storedHash, passwordPrefixMD5)
}
