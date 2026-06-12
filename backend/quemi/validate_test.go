package quemi

import "testing"

func TestIsWinningHand_FieldYakuhai(t *testing.T) {
	// 111z 234m 567m 789m 22p + 2p with field east → 场风牌
	hand13 := []string{"1z", "1z", "1z", "2m", "3m", "4m", "5m", "6m", "7m", "7m", "8m", "9m", "2p"}
	draw := "2p"
	if !IsWinningHand(hand13, draw, WindEast, WindSouth, AgariWayTsumo, []string{"3s"}, nil) {
		t.Fatal("expected winning hand with field yakuhai")
	}
}

func TestIsWinningHand_NotWinningShape(t *testing.T) {
	hand13 := []string{"1m", "3m", "5m", "7m", "9m", "2p", "4p", "6p", "8p", "1s", "3s", "5s", "7s"}
	draw := "9s"
	if IsWinningHand(hand13, draw, WindSouth, WindWest, AgariWayTsumo, []string{"1m"}, nil) {
		t.Fatal("expected non-winning hand shape")
	}
}

func TestComputeShanten_Tenpai(t *testing.T) {
	// 234m 567m 789m 123p 55p waiting 7m
	hand13 := []string{"2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "5p", "5p"}
	sh := ComputeShanten(hand13)
	if sh != 0 {
		t.Fatalf("expected shanten 0, got %d", sh)
	}
}

func TestComputeShanten_Far(t *testing.T) {
	hand13 := []string{"1m", "3m", "5m", "7m", "9m", "2p", "4p", "6p", "8p", "1s", "3s", "5s", "7s"}
	sh := ComputeShanten(hand13)
	if sh < 3 {
		t.Fatalf("expected high shanten, got %d", sh)
	}
}

func TestValidatePuzzleDefinition_Winnable(t *testing.T) {
	puzzle := QueMiPuzzle{
		Type:      PuzzleTypeWinnable,
		HandMode:  HandModeClosed,
		Answer:    BuildCanonicalAnswer([]string{"1z", "1z", "1z", "2m", "3m", "4m", "5m", "6m", "7m", "7m", "8m", "9m", "2p"}, "2p"),
		FieldWind: WindEast,
		SeatWind:  WindSouth,
		AgariWay:  AgariWayTsumo,
		Dora:      []string{"3s"},
	}
	res := ValidatePuzzleDefinition(puzzle)
	if !res.OK {
		t.Fatalf("expected valid winnable puzzle, got reason %s", res.Reason)
	}
}

func TestValidatePuzzleDefinition_NonWinnable(t *testing.T) {
	hand13 := []string{"1m", "3m", "5m", "7m", "9m", "2p", "4p", "6p", "8p", "1s", "3s", "5s", "7s"}
	sh := ComputeShanten(hand13)
	puzzle := QueMiPuzzle{
		Type:      PuzzleTypeNonWinnable,
		HandMode:  HandModeClosed,
		Answer:    BuildCanonicalAnswer(hand13, "9s"),
		FieldWind: WindSouth,
		SeatWind:  WindWest,
		AgariWay:  AgariWayRon,
		Dora:      []string{"2m"},
		Shanten:   &sh,
	}
	res := ValidatePuzzleDefinition(puzzle)
	if !res.OK {
		t.Fatalf("expected valid non-winnable puzzle, got reason %s", res.Reason)
	}
}
