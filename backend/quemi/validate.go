package quemi

import (
	"strings"
)

var windToPos = map[Wind]PositionType{
	WindEast:  PositionEast,
	WindSouth: PositionSouth,
	WindWest:  PositionWest,
	WindNorth: PositionNorth,
}

// ValidateReason describes why validation failed.
type ValidateReason string

const (
	ReasonIncomplete       ValidateReason = "incomplete"
	ReasonNotWinning       ValidateReason = "notWinning"
	ReasonNoYaku           ValidateReason = "noYaku"
	ReasonIsWinning        ValidateReason = "isWinning"
	ReasonShantenMismatch  ValidateReason = "shantenMismatch"
	ReasonInvalidTiles     ValidateReason = "invalidTiles"
	ReasonDuplicateTiles   ValidateReason = "duplicateTiles"
	ReasonKokushi          ValidateReason = "kokushi"
	ReasonInvalidStructure ValidateReason = "invalidStructure"
)

// ValidateResult is the outcome of guess or definition validation.
type ValidateResult struct {
	OK      bool
	Correct bool
	Reason  ValidateReason
}

// IsCompleteGuess returns true when all 14 closed slots are filled.
func IsCompleteGuess(guess []string) bool {
	if len(guess) != 14 {
		return false
	}
	for _, t := range guess {
		if t == "" {
			return false
		}
	}
	return true
}

func buildCalcState(hand13 []string, draw string, field, seat Wind, agariWay AgariWay, dora []string, furu []Block) (State, error) {
	hand := make([]Pai, len(hand13))
	for i, t := range hand13 {
		p, err := TileToPai(t)
		if err != nil {
			return State{}, err
		}
		hand[i] = p
	}
	sortPaiSlice(hand)
	agariPai, err := TileToPai(draw)
	if err != nil {
		return State{}, err
	}
	doraPai := make([]Pai, len(dora))
	for i, t := range dora {
		doraPai[i] = MustTileToPai(t)
	}
	agariFlag := Tsumo
	if agariWay == AgariWayRon {
		agariFlag = Ron
	}
	return NewState(windToPos[field], windToPos[seat], nil, agariFlag, hand, furu, doraPai, nil, agariPai, 0), nil
}

func sortPaiSlice(pais []Pai) {
	for i := 0; i < len(pais); i++ {
		for j := i + 1; j < len(pais); j++ {
			if ComparePai(pais[j], pais[i]) < 0 {
				pais[i], pais[j] = pais[j], pais[i]
			}
		}
	}
}

func calcResult(hand13 []string, draw string, field, seat Wind, agariWay AgariWay, dora []string, furu []Block) (Result, error) {
	st, err := buildCalcState(hand13, draw, field, seat, agariWay, dora, furu)
	if err != nil {
		return Result{}, err
	}
	return NewCalculator().Calculate(st), nil
}

// IsWinningHand returns true when the hand wins with yaku or yakuman.
func IsWinningHand(hand13 []string, draw string, field, seat Wind, agariWay AgariWay, dora []string, furu []Block) bool {
	res, err := calcResult(hand13, draw, field, seat, agariWay, dora, furu)
	if err != nil {
		return false
	}
	return res.IsYakuman || res.HanRealYaku > 0
}

// IsKokushiWin returns true when the hand is a kokushi yakuman.
func IsKokushiWin(hand13 []string, draw string, field, seat Wind, agariWay AgariWay, dora []string, furu []Block) bool {
	res, err := calcResult(hand13, draw, field, seat, agariWay, dora, furu)
	if err != nil {
		return false
	}
	if !res.IsYakuman {
		return false
	}
	for _, y := range res.Yaku {
		if strings.Contains(y, "国士") {
			return true
		}
	}
	return false
}

// ValidateGuess validates a closed-hand player guess.
func ValidateGuess(puzzle QueMiPuzzle, guess []string) ValidateResult {
	if puzzle.HandMode == HandModeOpen {
		return ValidateResult{OK: false, Reason: ReasonIncomplete}
	}
	if !IsCompleteGuess(guess) {
		return ValidateResult{OK: false, Reason: ReasonIncomplete}
	}
	hand13 := guess[:13]
	draw := guess[13]
	winning := IsWinningHand(hand13, draw, puzzle.FieldWind, puzzle.SeatWind, puzzle.AgariWay, puzzle.Dora, nil)

	if puzzle.Type == PuzzleTypeWinnable {
		if !winning {
			return ValidateResult{OK: false, Reason: ReasonNotWinning}
		}
	} else {
		if winning {
			return ValidateResult{OK: false, Reason: ReasonIsWinning}
		}
		if puzzle.Shanten != nil && ComputeShanten(hand13) != *puzzle.Shanten {
			return ValidateResult{OK: false, Reason: ReasonShantenMismatch}
		}
	}

	correct := true
	for i, t := range guess {
		if i >= len(puzzle.Answer) || t != puzzle.Answer[i] {
			correct = false
			break
		}
	}
	return ValidateResult{OK: true, Correct: correct}
}

// ValidateOpenGuess validates an open-hand player guess.
func ValidateOpenGuess(puzzle QueMiPuzzle, openGuess QueMiOpenGuess) ValidateResult {
	if puzzle.HandMode != HandModeOpen || puzzle.OpenAnswer == nil || puzzle.OpenMeldCount == nil {
		return ValidateResult{OK: false, Reason: ReasonIncomplete}
	}
	if !IsOpenGuessComplete(*puzzle.OpenMeldCount, openGuess.Melds, openGuess.Hand) {
		return ValidateResult{OK: false, Reason: ReasonIncomplete}
	}

	furu := MeldsToBlocks(openGuess.Melds)
	draw := openGuess.Hand[len(openGuess.Hand)-1]
	hand13 := openGuess.Hand[:len(openGuess.Hand)-1]

	winCheck := IsWinningHand(hand13, draw, puzzle.FieldWind, puzzle.SeatWind, puzzle.AgariWay, puzzle.Dora, furu)
	if puzzle.Type == PuzzleTypeWinnable && !winCheck {
		return ValidateResult{OK: false, Reason: ReasonNotWinning}
	}

	correct := IsOpenAnswerCorrect(*puzzle.OpenAnswer, openGuess.Melds, openGuess.Hand)
	return ValidateResult{OK: true, Correct: correct}
}

// CompareGuessFeedback returns Wordle-style feedback for closed guesses.
func CompareGuessFeedback(answer, guess []string) []TileFeedback {
	feedback := make([]TileFeedback, 14)
	for i := range feedback {
		feedback[i] = FeedbackBlack
	}
	answerRemaining := CountTiles(answer)
	guessRemaining := CountTiles(guess)

	for i := 0; i < 14 && i < len(guess) && i < len(answer); i++ {
		if guess[i] == answer[i] {
			feedback[i] = FeedbackGreen
			answerRemaining[guess[i]]--
			guessRemaining[guess[i]]--
		}
	}
	for i := 0; i < 14 && i < len(guess); i++ {
		if feedback[i] == FeedbackGreen {
			continue
		}
		t := guess[i]
		if t == "" {
			feedback[i] = FeedbackBlack
			continue
		}
		if answerRemaining[t] > 0 {
			feedback[i] = FeedbackYellow
			answerRemaining[t]--
		} else {
			feedback[i] = FeedbackBlack
		}
	}
	return feedback
}

// CompareOpenGuessFeedback returns feedback for open guesses.
func CompareOpenGuessFeedback(puzzle QueMiPuzzle, openGuess QueMiOpenGuess) QueMiOpenSubmitFeedback {
	answer := puzzle.OpenAnswer
	return QueMiOpenSubmitFeedback{
		MeldFeedback: CompareMeldFeedback(answer.Melds, openGuess.Melds),
		HandFeedback: CompareOpenHandFeedback(*answer, openGuess.Hand),
	}
}

func puzzleHandAndFuru(puzzle QueMiPuzzle) (hand13 []string, draw string, furu []Block, err error) {
	if puzzle.HandMode == HandModeOpen && puzzle.OpenAnswer != nil {
		oa := puzzle.OpenAnswer
		furu = MeldsToBlocks(oa.Melds)
		return oa.ClosedHand, oa.Draw, furu, nil
	}
	if len(puzzle.Answer) != 14 {
		return nil, "", nil, errInvalidStructure
	}
	return puzzle.Answer[:13], puzzle.Answer[13], nil, nil
}

var errInvalidStructure = validateError("invalid structure")

type validateError string

func (e validateError) Error() string { return string(e) }

func countAllPuzzleTiles(puzzle QueMiPuzzle) map[string]int {
	c := CountTiles(puzzle.Dora)
	if puzzle.HandMode == HandModeOpen && puzzle.OpenAnswer != nil {
		c = mergeCounts(c, CountTiles(flattenMelds(puzzle.OpenAnswer.Melds)))
		c = mergeCounts(c, CountTiles(puzzle.OpenAnswer.ClosedHand))
		if puzzle.OpenAnswer.Draw != "" {
			c[puzzle.OpenAnswer.Draw]++
		}
	} else if len(puzzle.Answer) == 14 {
		c = mergeCounts(c, CountTiles(puzzle.Answer))
	}
	return c
}

func mergeCounts(a, b map[string]int) map[string]int {
	out := make(map[string]int)
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] += v
	}
	return out
}

func tilesValid(tiles map[string]int) bool {
	for t, n := range tiles {
		if TileToIndex(t) < 0 {
			return false
		}
		if n > 4 {
			return false
		}
	}
	return true
}

// ValidatePuzzleDefinition checks puzzle authoring rules.
func ValidatePuzzleDefinition(puzzle QueMiPuzzle) ValidateResult {
	if puzzle.HandMode == HandModeOpen {
		if puzzle.OpenAnswer == nil || puzzle.OpenMeldCount == nil {
			return ValidateResult{OK: false, Reason: ReasonInvalidStructure}
		}
		if len(puzzle.OpenAnswer.Melds) != *puzzle.OpenMeldCount {
			return ValidateResult{OK: false, Reason: ReasonInvalidStructure}
		}
	} else if len(puzzle.Answer) != 14 {
		return ValidateResult{OK: false, Reason: ReasonInvalidStructure}
	}

	allTiles := countAllPuzzleTiles(puzzle)
	if !tilesValid(allTiles) {
		for t, n := range allTiles {
			if TileToIndex(t) < 0 {
				_ = t
				return ValidateResult{OK: false, Reason: ReasonInvalidTiles}
			}
			if n > 4 {
				return ValidateResult{OK: false, Reason: ReasonDuplicateTiles}
			}
		}
	}

	hand13, draw, furu, err := puzzleHandAndFuru(puzzle)
	if err != nil {
		return ValidateResult{OK: false, Reason: ReasonInvalidStructure}
	}

	winning := IsWinningHand(hand13, draw, puzzle.FieldWind, puzzle.SeatWind, puzzle.AgariWay, puzzle.Dora, furu)
	kokushi := IsKokushiWin(hand13, draw, puzzle.FieldWind, puzzle.SeatWind, puzzle.AgariWay, puzzle.Dora, furu)

	switch puzzle.Type {
	case PuzzleTypeWinnable:
		if !winning {
			return ValidateResult{OK: false, Reason: ReasonNotWinning}
		}
		if kokushi {
			return ValidateResult{OK: false, Reason: ReasonKokushi}
		}
	case PuzzleTypeNonWinnable:
		if winning {
			return ValidateResult{OK: false, Reason: ReasonIsWinning}
		}
		if puzzle.Shanten == nil {
			return ValidateResult{OK: false, Reason: ReasonInvalidStructure}
		}
		if ComputeShanten(hand13) != *puzzle.Shanten {
			return ValidateResult{OK: false, Reason: ReasonShantenMismatch}
		}
	default:
		return ValidateResult{OK: false, Reason: ReasonInvalidStructure}
	}

	return ValidateResult{OK: true, Correct: true}
}
