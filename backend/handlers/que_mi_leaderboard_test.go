package handlers

import (
	"testing"

	"mahjong-backend/models"
	"mahjong-backend/quemi"
)

func TestQueMiPuzzleCategory(t *testing.T) {
	t.Parallel()
	cases := []struct {
		puzzle   quemi.QueMiPuzzle
		expected string
	}{
		{quemi.QueMiPuzzle{Type: quemi.PuzzleTypeWinnable, HandMode: quemi.HandModeClosed}, queMiCategoryWinnableClosed},
		{quemi.QueMiPuzzle{Type: quemi.PuzzleTypeWinnable, HandMode: quemi.HandModeOpen}, queMiCategoryWinnableOpen},
		{quemi.QueMiPuzzle{Type: quemi.PuzzleTypeNonWinnable, HandMode: quemi.HandModeClosed}, queMiCategoryNonWinnable},
	}
	for _, tc := range cases {
		if got := queMiPuzzleCategory(tc.puzzle); got != tc.expected {
			t.Fatalf("category %+v: got %q want %q", tc.puzzle, got, tc.expected)
		}
	}
}

func TestQueMiEffectiveAttemptUsage(t *testing.T) {
	t.Parallel()
	cases := []struct {
		status       string
		attemptsUsed int
		maxAttempts  int
		want         int
	}{
		{models.QueMiAttemptStatusWon, 2, 5, 2},
		{models.QueMiAttemptStatusLost, 0, 5, 5},
		{models.QueMiAttemptStatusLost, 2, 5, 5},
		{models.QueMiAttemptStatusLost, 5, 5, 5},
		{models.QueMiAttemptStatusLost, 3, 3, 5},
		{models.QueMiAttemptStatusInProgress, 1, 5, 0},
	}
	for _, tc := range cases {
		if got := queMiEffectiveAttemptUsage(tc.status, tc.attemptsUsed, tc.maxAttempts); got != tc.want {
			t.Fatalf("usage(%s, %d, %d) = %d, want %d", tc.status, tc.attemptsUsed, tc.maxAttempts, got, tc.want)
		}
	}
}

func TestQueMiCreatorAvgAttemptsPerPuzzle(t *testing.T) {
	t.Parallel()
	attempts := []models.QueMiAttempt{
		{Status: models.QueMiAttemptStatusWon, AttemptsUsed: 2},
		{Status: models.QueMiAttemptStatusLost, AttemptsUsed: 0},
	}
	got := queMiCreatorAvgAttemptsPerPuzzle(attempts, 5)
	want := (2.0 + 5.0) / 2.0
	if got != want {
		t.Fatalf("avg = %v, want %v", got, want)
	}
}
