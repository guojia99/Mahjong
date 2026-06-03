package mortal

import (
	"encoding/json"
	"testing"
)

func TestBuildDiscardAdviseEventsMenzen(t *testing.T) {
	events, err := BuildDiscardAdviseEvents(DiscardAdviseRequest{
		Hand: []string{
			"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p",
		},
		Drawn: "5p",
		Dora:  []string{"3s"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(events) < 3 {
		t.Fatalf("expected at least 3 events, got %d", len(events))
	}
	last := events[len(events)-1]
	var ev map[string]interface{}
	if err := json.Unmarshal([]byte(last), &ev); err != nil {
		t.Fatal(err)
	}
	if ev["type"] != "tsumo" || ev["pai"] != "5p" {
		t.Fatalf("last event: %v", ev)
	}
}

func TestBuildDiscardAdviseEventsWithPon(t *testing.T) {
	hand := []string{"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p"}
	events, err := BuildDiscardAdviseEvents(DiscardAdviseRequest{
		Hand:  hand,
		Melds: []MeldInput{{Type: "pon", Name: "2p"}},
		Drawn: "3p",
		Dora:  []string{"3s"},
	})
	if err != nil {
		t.Fatal(err)
	}
	foundTsumo := false
	for _, e := range events {
		var ev map[string]interface{}
		_ = json.Unmarshal([]byte(e), &ev)
		if ev["type"] == "tsumo" {
			foundTsumo = true
		}
	}
	if !foundTsumo {
		t.Fatal("missing tsumo event")
	}
}

func TestBuildDiscardAdviseEventsInvalidCount(t *testing.T) {
	_, err := BuildDiscardAdviseEvents(DiscardAdviseRequest{
		Hand:  []string{"1m", "2m"},
		Drawn: "3m",
		Dora:  []string{"3s"},
	})
	if err == nil {
		t.Fatal("expected error for invalid tile count")
	}
}
