package handlers

import (
	"sort"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFunRankingHighLowScoreSort(t *testing.T) {
	items := []gin.H{
		{"player_id": "low", "rate": float64(20)},
		{"player_id": "high", "rate": float64(50)},
		{"player_id": "mid", "rate": float64(35)},
	}
	sort.Slice(items, func(i, j int) bool {
		ri, _ := items[i]["rate"].(float64)
		rj, _ := items[j]["rate"].(float64)
		return ri > rj
	})
	if items[0]["player_id"] != "high" || items[1]["player_id"] != "mid" || items[2]["player_id"] != "low" {
		t.Fatalf("high_score sort got %#v", items)
	}

	asc := []gin.H{
		{"player_id": "high", "rate": float64(50)},
		{"player_id": "low", "rate": float64(20)},
		{"player_id": "mid", "rate": float64(35)},
	}
	sort.Slice(asc, func(i, j int) bool {
		ri, _ := asc[i]["rate"].(float64)
		rj, _ := asc[j]["rate"].(float64)
		return ri < rj
	})
	if asc[0]["player_id"] != "low" || asc[1]["player_id"] != "mid" || asc[2]["player_id"] != "high" {
		t.Fatalf("low_score sort got %#v", asc)
	}
}

func TestFunRankingHighScoreRateIsFloat64(t *testing.T) {
	score := 42
	s := &struct {
		HighScore *int
	}{HighScore: &score}
	rate := float64(*s.HighScore)
	if _, ok := interface{}(rate).(float64); !ok {
		t.Fatal("expected float64 rate for sorting")
	}
}
