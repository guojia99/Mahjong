package quemi

import (
	"sort"
	"strings"
)

// OpenHandSlotCount returns closed-hand slot count for meld count.
func OpenHandSlotCount(meldCount int) int {
	return 14 - meldCount*MeldTileCount
}

// OpenDrawSlotIndex is the draw tile index in open-hand slots.
func OpenDrawSlotIndex(meldCount int) int {
	return OpenHandSlotCount(meldCount) - 1
}

// MeldsToBlocks converts meld tile groups to calculator blocks.
func MeldsToBlocks(melds [][]string) []Block {
	blocks := make([]Block, 0, len(melds))
	for _, m := range melds {
		sorted := SortTilesCanonical(m)
		p0 := MustTileToPai(sorted[0])
		if sorted[0] == sorted[1] && sorted[1] == sorted[2] {
			blocks = append(blocks, NewBlock(BlockTri, p0.Type, p0.Num, true))
			continue
		}
		p := MustTileToPai(sorted[0])
		blocks = append(blocks, NewBlock(BlockSeq, p.Type, p.Num, true))
	}
	return blocks
}

func multisetKey(tiles []string) string {
	return strings.Join(SortTilesCanonical(tiles), ",")
}

func countMeldMatches(answer, guess []string) int {
	a := CountTiles(answer)
	g := CountTiles(nonEmptyTiles(guess))
	n := 0
	for t, cnt := range a {
		gc := g[t]
		if gc < cnt {
			n += gc
		} else {
			n += cnt
		}
	}
	return n
}

func nonEmptyTiles(tiles []string) []string {
	var out []string
	for _, t := range tiles {
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func meldSlotFeedback(answer, guess []string) []TileFeedback {
	slots := len(guess)
	none := func() []TileFeedback {
		fb := make([]TileFeedback, slots)
		for i := range fb {
			fb[i] = FeedbackNone
		}
		return fb
	}
	matchCount := countMeldMatches(answer, guess)
	if matchCount <= 1 {
		return none()
	}
	remaining := CountTiles(answer)
	fb := make([]TileFeedback, slots)
	color := FeedbackYellow
	if matchCount == 3 {
		color = FeedbackGreen
	}
	for i := 0; i < slots; i++ {
		t := guess[i]
		if t == "" || remaining[t] == 0 {
			continue
		}
		fb[i] = color
		remaining[t]--
	}
	return fb
}

func permutations(n int) [][]int {
	arr := make([]int, n)
	for i := range arr {
		arr[i] = i
	}
	var out [][]int
	var dfs func(k int)
	dfs = func(k int) {
		if k == n {
			p := append([]int(nil), arr...)
			out = append(out, p)
			return
		}
		for i := k; i < n; i++ {
			arr[k], arr[i] = arr[i], arr[k]
			dfs(k + 1)
			arr[k], arr[i] = arr[i], arr[k]
		}
	}
	dfs(0)
	return out
}

func meldFeedbackScore(fb [][]TileFeedback) int {
	s := 0
	for _, m := range fb {
		for _, f := range m {
			switch f {
			case FeedbackGreen:
				s += 3
			case FeedbackYellow:
				s += 2
			}
		}
	}
	return s
}

// CompareMeldFeedback compares meld groups with optimal permutation.
func CompareMeldFeedback(answerMelds [][]string, guessMelds [][]string) [][]TileFeedback {
	n := len(answerMelds)
	if n == 0 {
		return nil
	}
	emptyForGuess := func() [][]TileFeedback {
		out := make([][]TileFeedback, len(guessMelds))
		for i, gm := range guessMelds {
			fb := make([]TileFeedback, len(gm))
			for j := range fb {
				fb[j] = FeedbackNone
			}
			out[i] = fb
		}
		return out
	}
	bestFb := emptyForGuess()
	bestScore := -1
	for _, perm := range permutations(n) {
		fbForGuess := emptyForGuess()
		score := 0
		for ai := 0; ai < n; ai++ {
			gi := perm[ai]
			var gm []string
			if gi < len(guessMelds) {
				gm = guessMelds[gi]
			}
			slotFb := meldSlotFeedback(answerMelds[ai], gm)
			if gi < len(fbForGuess) {
				fbForGuess[gi] = slotFb
			}
			score += meldFeedbackScore([][]TileFeedback{slotFb})
		}
		if score > bestScore {
			bestScore = score
			bestFb = fbForGuess
		}
	}
	return bestFb
}

// CompareClosedHandFeedback compares closed-hand slots positionally.
func CompareClosedHandFeedback(answer []string, guess []string) []TileFeedback {
	feedback := make([]TileFeedback, len(guess))
	for i := range feedback {
		feedback[i] = FeedbackBlack
	}
	answerRemaining := CountTiles(answer)
	guessRemaining := CountTiles(nonEmptyTiles(guess))

	for i := 0; i < len(guess); i++ {
		if guess[i] != "" && guess[i] == answer[i] {
			feedback[i] = FeedbackGreen
			answerRemaining[guess[i]]--
			guessRemaining[guess[i]]--
		}
	}
	for i := 0; i < len(guess); i++ {
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
	for i := 0; i < len(feedback); i++ {
		if feedback[i] == FeedbackBlack {
			feedback[i] = FeedbackNone
		}
	}
	return feedback
}

// CompareOpenHandFeedback compares open-hand slots including meld overlap.
func CompareOpenHandFeedback(answer QueMiOpenAnswer, guessHand []string) []TileFeedback {
	closedAnswer := append(SortTilesCanonical(answer.ClosedHand), answer.Draw)
	fb := CompareClosedHandFeedback(closedAnswer, guessHand)
	meldTiles := CountTiles(flattenMelds(answer.Melds))
	for i := 0; i < len(fb); i++ {
		if fb[i] == FeedbackGreen {
			continue
		}
		t := guessHand[i]
		if t == "" || meldTiles[t] == 0 {
			continue
		}
		fb[i] = FeedbackYellow
		meldTiles[t]--
	}
	return fb
}

func flattenMelds(melds [][]string) []string {
	var out []string
	for _, m := range melds {
		out = append(out, m...)
	}
	return out
}

// MeldGroupsEqual checks meld multiset equality.
func MeldGroupsEqual(answerMelds [][]string, guessMelds [][]string) bool {
	norm := func(m []string) string { return multisetKey(m) }
	a := make([]string, len(answerMelds))
	for i, m := range answerMelds {
		a[i] = norm(m)
	}
	sort.Strings(a)
	var g []string
	for _, m := range guessMelds {
		k := norm(nonEmptyTiles(m))
		if k != "" {
			g = append(g, k)
		}
	}
	sort.Strings(g)
	if len(a) != len(g) {
		return false
	}
	for i := range a {
		if a[i] != g[i] {
			return false
		}
	}
	return true
}

// IsOpenAnswerCorrect checks full open answer match.
func IsOpenAnswerCorrect(answer QueMiOpenAnswer, guessMelds [][]string, guessHand []string) bool {
	if !MeldGroupsEqual(answer.Melds, guessMelds) {
		return false
	}
	closedAnswer := append(SortTilesCanonical(answer.ClosedHand), answer.Draw)
	for i, t := range closedAnswer {
		gt := ""
		if i < len(guessHand) {
			gt = guessHand[i]
		}
		if t != gt {
			return false
		}
	}
	return true
}

// IsOpenGuessComplete returns true when all open slots are filled.
func IsOpenGuessComplete(meldCount int, melds [][]string, hand []string) bool {
	if len(melds) != meldCount {
		return false
	}
	if len(hand) != OpenHandSlotCount(meldCount) {
		return false
	}
	for _, m := range melds {
		if len(m) != MeldTileCount {
			return false
		}
		for _, t := range m {
			if t == "" {
				return false
			}
		}
	}
	for _, t := range hand {
		if t == "" {
			return false
		}
	}
	return true
}
