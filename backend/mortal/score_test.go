package mortal

import (
	"reflect"
	"testing"
)

func TestApplyTurnScoreRulesDocExample(t *testing.T) {
	base := []int{100, 90, 80, 80, 75, 74, 65, 30, 10}
	want := []int{100, 90, 80, 80, 60, 0, 0, 0, 0}
	got := applyTurnScoreRules(base)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestApplyTurnScoreRulesThreeValidNoDiscount(t *testing.T) {
	base := []int{100, 90, 80, 50, 10}
	want := []int{100, 90, 80, 0, 0}
	got := applyTurnScoreRules(base)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestApplyTurnScoreRulesRankFiveDiscount(t *testing.T) {
	base := []int{100, 90, 80, 80, 75, 70}
	want := []int{100, 90, 80, 80, 60, 0}
	got := applyTurnScoreRules(base)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestFAQTurnScoreUsesWeightedRules(t *testing.T) {
	q := []float64{0, 0.9, 0.8, 0.8, 0.75, 0.74, 1.0}
	if FAQTurnScore(q, 6) != 100 {
		t.Fatalf("best should be 100")
	}
	if FAQTurnScore(q, 0) != 0 {
		t.Fatalf("far below threshold should be 0")
	}
	if got := FAQTurnScore(q, 4); got != 60 {
		t.Fatalf("rank-4 75 expect 60 got %d", got)
	}
	if got := FAQTurnScore(q, 5); got != 0 {
		t.Fatalf("74 below threshold expect 0 got %d", got)
	}
}
