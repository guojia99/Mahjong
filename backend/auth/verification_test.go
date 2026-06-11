package auth

import (
	"testing"
	"unicode"
)

func TestGenerateVerificationCodeFormat(t *testing.T) {
	code, err := GenerateVerificationCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(code) != 6 {
		t.Fatalf("expected length 6, got %d", len(code))
	}
	for _, ch := range code {
		if !unicode.IsDigit(ch) && !unicode.IsUpper(ch) {
			t.Fatalf("invalid character %q in code %q", ch, code)
		}
	}
}
