package auth

import (
	"crypto/rand"
	"errors"
	"math/big"
	"time"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"gorm.io/gorm"
)

const verificationCodeTTL = 10 * time.Minute

var (
	ErrVerificationNotFound = errors.New("verification code not found")
	ErrVerificationExpired  = errors.New("verification code expired")
	ErrVerificationUsed     = errors.New("verification code already used")
	ErrVerificationInvalid  = errors.New("invalid verification code")
)

var verificationAlphabet = []byte("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")

// GenerateVerificationCode returns a 6-character alphanumeric code.
func GenerateVerificationCode() (string, error) {
	b := make([]byte, 6)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(verificationAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = verificationAlphabet[n.Int64()]
	}
	return string(b), nil
}

// CreateVerificationCode invalidates prior unused codes for the same purpose and stores a new one.
func CreateVerificationCode(userID uint64, purpose string, now time.Time) (string, error) {
	code, err := GenerateVerificationCode()
	if err != nil {
		return "", err
	}
	expiresAt := now.Add(verificationCodeTTL)
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.VerificationCode{}).
			Where("user_id = ? AND purpose = ? AND used_at IS NULL", userID, purpose).
			Update("used_at", now).Error; err != nil {
			return err
		}
		row := models.VerificationCode{
			UserID:    userID,
			Purpose:   purpose,
			Code:      code,
			ExpiresAt: expiresAt,
		}
		return tx.Create(&row).Error
	})
	if err != nil {
		return "", err
	}
	return code, nil
}

// VerifyCode checks and marks a verification code as used.
func VerifyCode(userID uint64, purpose, code string, now time.Time) error {
	var row models.VerificationCode
	err := config.DB.Where(
		"user_id = ? AND purpose = ? AND code = ? AND used_at IS NULL",
		userID, purpose, code,
	).Order("id DESC").First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrVerificationNotFound
	}
	if err != nil {
		return err
	}
	if now.After(row.ExpiresAt) {
		return ErrVerificationExpired
	}
	if row.UsedAt != nil {
		return ErrVerificationUsed
	}
	row.UsedAt = &now
	return config.DB.Save(&row).Error
}
