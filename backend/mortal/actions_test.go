package mortal

import "testing"

func TestNormalizeTurnScoresEqualQOnlyChosen100(t *testing.T) {
	q := []float64{1.0, 1.0, 1.0}
	scores := NormalizeTurnScores(q, 1)
	if scores[0] != 0 || scores[1] != 100 || scores[2] != 0 {
		t.Fatalf("got %v want [0 100 0]", scores)
	}
}

func TestFAQTurnScoreSuboptimal(t *testing.T) {
	q := []float64{0.0, 0.9, 1.0}
	if FAQTurnScore(q, 2) != 100 {
		t.Fatalf("best should be 100")
	}
	if FAQTurnScore(q, 0) != 0 {
		t.Fatalf("worst should be 0")
	}
	mid := FAQTurnScore(q, 1)
	if mid != 90 {
		t.Fatalf("mid expect 90 got %d", mid)
	}
}

func TestBuildOptionsFromReactionDahaiMask(t *testing.T) {
	// legal: discard 1m (0), 9m (8), pass (45) -> mask bits 0, 8, 45
	mask := uint64(1<<0 | 1<<8 | 1<<45)
	meta := map[string]interface{}{
		"q_values":  []interface{}{-1.0, 0.5, -2.0},
		"mask_bits": float64(mask),
	}
	r := Reaction{Type: "dahai", Pai: "9m", Meta: meta}
	opts, chosen := BuildOptionsFromReaction(r, meta)
	if chosen != 1 {
		t.Fatalf("chosen compact idx %d want 1", chosen)
	}
	if len(opts) != 3 {
		t.Fatalf("len opts %d", len(opts))
	}
	if opts[1].Pai != "9m" || !opts[1].Chosen {
		t.Fatalf("opt[1] %+v", opts[1])
	}
	if opts[1].Score <= opts[0].Score {
		t.Fatalf("chosen should have highest normalized score among unequal q: %+v", opts)
	}
}

func TestActionMetaDiscardRed(t *testing.T) {
	am := ActionMetaForIndex(34)
	if am.Pai != "0m" || am.Type != "dahai" {
		t.Fatalf("%+v", am)
	}
}
