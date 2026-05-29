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

// FAQTurnScore is Mortal FAQ per-move score: 100 * ((q_chosen-min)/(max-min))^2.
func FAQTurnScore(qvals []float64, chosenIdx int) int {
	return int(math.Round(100 * ChosenQRatio(qvals, chosenIdx)))
}

// ChosenQRatio returns ((q_chosen-min)/(max-min))^2 for FAQ rating accumulation.
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
