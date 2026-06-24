package mortal

import (
	"math"
	"sort"
)

// PiTau computes softmax policy π_τ(a|s) with temperature τ.
func PiTau(qvals []float64, tau float64) []float64 {
	if len(qvals) == 0 {
		return nil
	}
	if tau <= 0 {
		tau = 1
	}
	maxQ := qvals[0]
	for _, q := range qvals[1:] {
		if q > maxQ {
			maxQ = q
		}
	}
	exp := make([]float64, len(qvals))
	sum := 0.0
	for i, q := range qvals {
		e := math.Exp((q - maxQ) / tau)
		exp[i] = e
		sum += e
	}
	if sum < 1e-12 {
		u := 1.0 / float64(len(qvals))
		for i := range exp {
			exp[i] = u
		}
		return exp
	}
	for i := range exp {
		exp[i] /= sum
	}
	return exp
}

// MatchRating is the FAQ overall rating: 100 * mean(((q-min)/(max-min))^2).
func MatchRating(qChosen []float64) float64 {
	if len(qChosen) == 0 {
		return 0
	}
	var sum float64
	for _, q := range qChosen {
		// per-decision min/max not stored here; caller passes normalized ratio^2
		sum += q
	}
	return math.Round(100*sum/float64(len(qChosen))*100) / 100
}

// AvgInt returns rounded mean of ints.
func AvgInt(vals []int) int {
	if len(vals) == 0 {
		return 0
	}
	s := 0
	for _, v := range vals {
		s += v
	}
	return int(math.Round(float64(s) / float64(len(vals))))
}

// GradeForScore maps average score to letter grade using tiers (descending min).
type GradeTier struct {
	Grade string  `json:"grade"`
	Min   float64 `json:"min"`
}

func DefaultGradeTiers() []GradeTier {
	return []GradeTier{
		{Grade: "AI", Min: 99},
		{Grade: "S+", Min: 95},
		{Grade: "S", Min: 92.5},
		{Grade: "S-", Min: 90},
		{Grade: "A+", Min: 86.5},
		{Grade: "A", Min: 82},
		{Grade: "A-", Min: 79},
		{Grade: "B+", Min: 75},
		{Grade: "B", Min: 70},
		{Grade: "B-", Min: 65},
		{Grade: "C+", Min: 60},
		{Grade: "C", Min: 55},
		{Grade: "C-", Min: 50},
		{Grade: "D", Min: 40},
		{Grade: "E", Min: 35},
		{Grade: "F", Min: 10},
		{Grade: "不正打", Min: -1e9},
	}
}

func GradeForScore(avg float64, tiers []GradeTier) string {
	if len(tiers) == 0 {
		tiers = DefaultGradeTiers()
	}
	sorted := make([]GradeTier, len(tiers))
	copy(sorted, tiers)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Min > sorted[j].Min })
	for _, t := range sorted {
		if avg >= t.Min {
			return t.Grade
		}
	}
	return "不正打"
}

const turnScoreValidGap = 25

// TurnScoresFromQValues maps q_values to per-option 0–100 scores for display and chosen-score grading.
// Valid options are within 25 points of the best; rank 4+ are discounted 20% per rank (ties share rank).
func TurnScoresFromQValues(qvals []float64, chosenIdx int) []int {
	base := baseLinearTurnScores(qvals, chosenIdx)
	if len(base) == 0 {
		return nil
	}
	return applyTurnScoreRules(base)
}

func baseLinearTurnScores(qvals []float64, chosenIdx int) []int {
	if len(qvals) == 0 {
		return nil
	}
	minQ, maxQ := qvals[0], qvals[0]
	for _, q := range qvals[1:] {
		if q < minQ {
			minQ = q
		}
		if q > maxQ {
			maxQ = q
		}
	}
	out := make([]int, len(qvals))
	span := maxQ - minQ
	if span < 1e-9 {
		for i := range out {
			out[i] = 0
		}
		if chosenIdx >= 0 && chosenIdx < len(out) {
			out[chosenIdx] = 100
		} else if len(out) == 1 {
			out[0] = 100
		}
		return out
	}
	for i, q := range qvals {
		out[i] = int(math.Round((q - minQ) / span * 100))
	}
	return out
}

func applyTurnScoreRules(scores []int) []int {
	if len(scores) == 0 {
		return nil
	}
	maxScore := scores[0]
	for _, s := range scores[1:] {
		if s > maxScore {
			maxScore = s
		}
	}
	threshold := maxScore - turnScoreValidGap

	type scored struct {
		idx   int
		score int
	}
	valid := make([]scored, 0, len(scores))
	for i, s := range scores {
		if s >= threshold {
			valid = append(valid, scored{i, s})
		}
	}
	sort.Slice(valid, func(i, j int) bool {
		if valid[i].score != valid[j].score {
			return valid[i].score > valid[j].score
		}
		return valid[i].idx < valid[j].idx
	})

	out := make([]int, len(scores))
	rank := 0
	prevScore := -1
	for _, v := range valid {
		if v.score != prevScore {
			rank++
			prevScore = v.score
		}
		s := v.score
		if rank >= 4 {
			mult := 1.0 - float64(rank-3)*0.2
			if mult < 0 {
				mult = 0
			}
			s = int(math.Round(float64(s) * mult))
		}
		out[v.idx] = s
	}
	return out
}

// FAQTurnScore returns the graded score for the human's chosen action index.
func FAQTurnScore(qvals []float64, chosenIdx int) int {
	scores := TurnScoresFromQValues(qvals, chosenIdx)
	if chosenIdx < 0 || chosenIdx >= len(scores) {
		return 0
	}
	return scores[chosenIdx]
}

// ChosenQRatio returns ((q_chosen-min)/(max-min))^2 (legacy Mortal FAQ; kept for reference).
func ChosenQRatio(qvals []float64, chosenIdx int) float64 {
	if len(qvals) == 0 || chosenIdx < 0 || chosenIdx >= len(qvals) {
		return 0
	}
	minQ, maxQ := qvals[0], qvals[0]
	for _, q := range qvals {
		if q < minQ {
			minQ = q
		}
		if q > maxQ {
			maxQ = q
		}
	}
	span := maxQ - minQ
	if span < 1e-9 {
		return 1
	}
	r := (qvals[chosenIdx] - minQ) / span
	return r * r
}
