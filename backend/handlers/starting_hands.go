package handlers

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

type startingHandResult struct {
	Score          float64
	Tiles          []string
	Chang          int
	Ju             int
	Ben            int
	DealerSeat     int
	Seat           int
	IsDealer       bool
	UID            int64
	DoraIndicators []string
	PlayerID       string
	GameID         string
	GameMode       string
	PlayerCount    int
	StartTime      string
	Breakdown      map[string]interface{}
}

func tileIndex(tile string) int {
	if len(tile) < 2 {
		return -1
	}
	rankCh := tile[0]
	suit := tile[1]
	if rankCh < '0' || rankCh > '9' {
		return -1
	}
	r := int(rankCh - '0')
	var base int
	switch suit {
	case 'm':
		base = 0
	case 'p':
		base = 9
	case 's':
		base = 18
	case 'z':
		if r < 1 || r > 7 {
			return -1
		}
		return 27 + (r - 1)
	default:
		return -1
	}
	if r == 0 {
		r = 5
	}
	if r < 1 || r > 9 {
		return -1
	}
	return base + (r - 1)
}

func isRedFive(tile string) bool {
	return len(tile) == 2 && tile[0] == '0' && (tile[1] == 'm' || tile[1] == 'p' || tile[1] == 's')
}

func doraFromIndicator(indicator string) string {
	if len(indicator) < 2 {
		return ""
	}
	rankCh := indicator[0]
	suit := indicator[1]
	if rankCh < '0' || rankCh > '9' {
		return ""
	}
	r := int(rankCh - '0')
	switch suit {
	case 'm', 'p', 's':
		if r == 0 {
			r = 5
		}
		if r < 1 || r > 9 {
			return ""
		}
		nextR := 1
		if r < 9 {
			nextR = r + 1
		}
		return fmt.Sprintf("%d%c", nextR, suit)
	case 'z':
		var nextR int
		if r >= 1 && r <= 4 {
			if r == 4 {
				nextR = 1
			} else {
				nextR = r + 1
			}
		} else if r >= 5 && r <= 7 {
			if r == 7 {
				nextR = 5
			} else {
				nextR = r + 1
			}
		} else {
			return ""
		}
		return fmt.Sprintf("%dz", nextR)
	}
	return ""
}

func doraEquivLadder(n int) float64 {
	if n <= 0 {
		return 0
	}
	return float64(n*(3*n+5)) / 2.0
}

func fieldWindTile(chang int) string {
	if chang < 0 || chang > 2 {
		return ""
	}
	return fmt.Sprintf("%dz", chang+1)
}

func seatWindTile(seat, dealerSeat, playerCount int) string {
	if playerCount <= 0 {
		return ""
	}
	rel := (seat - dealerSeat) % playerCount
	if rel < 0 {
		rel += playerCount
	}
	if rel < 0 || rel > 3 {
		return ""
	}
	return fmt.Sprintf("%dz", rel+1)
}

func suitShapeDPFn(counts [9]int, memo map[[9]int]int) int {
	if sum9(counts) == 0 {
		return 0
	}
	i := 0
	for i < 9 && counts[i] == 0 {
		i++
	}
	if i == 9 {
		return 0
	}
	key := counts
	if v, ok := memo[key]; ok {
		return v
	}

	best := 0

	cc := counts
	cc[i]--
	s := suitShapeDPFn(cc, memo)
	if s > best {
		best = s
	}
	cc[i]++

	if counts[i] >= 3 {
		cc[i] -= 3
		s = 12 + suitShapeDPFn(cc, memo)
		if s > best {
			best = s
		}
		cc[i] += 3
	}

	if i <= 6 && counts[i+1] > 0 && counts[i+2] > 0 {
		seqPts := 9
		if i > 0 && i < 6 {
			seqPts = 12
		}
		cc[i]--
		cc[i+1]--
		cc[i+2]--
		s = seqPts + suitShapeDPFn(cc, memo)
		if s > best {
			best = s
		}
		cc[i]++
		cc[i+1]++
		cc[i+2]++
	}

	if counts[i] >= 2 {
		cc[i] -= 2
		s = 4 + suitShapeDPFn(cc, memo)
		if s > best {
			best = s
		}
		cc[i] += 2
	}

	if i <= 7 && counts[i+1] > 0 {
		canLeft := i >= 1 && counts[i-1] > 0
		canRight := i <= 6 && counts[i+2] > 0
		if !canLeft && !canRight {
			bonus := 4
			if i == 0 || i == 7 {
				bonus = 2
			} else if i == 3 || i == 4 {
				bonus = 5
			}
			cc[i]--
			cc[i+1]--
			s = bonus + suitShapeDPFn(cc, memo)
			if s > best {
				best = s
			}
			cc[i]++
			cc[i+1]++
		}
	}

	if i <= 6 && counts[i+2] > 0 && counts[i+1] == 0 {
		cc[i]--
		cc[i+2]--
		s = 2 + suitShapeDPFn(cc, memo)
		if s > best {
			best = s
		}
		cc[i]++
		cc[i+2]++
	}

	memo[key] = best
	return best
}

func suitShapeDPScore(counts [9]int) int {
	memo := make(map[[9]int]int)
	return suitShapeDPFn(counts, memo)
}

func sum9(a [9]int) int {
	s := 0
	for _, v := range a {
		s += v
	}
	return s
}

func sum34(a [34]int) int {
	s := 0
	for _, v := range a {
		s += v
	}
	return s
}

func honorShapeScore(c34 [34]int, yakuhaiSet map[int]bool) (int, map[string]int) {
	score := 0
	triplets := 0
	pairs := 0
	ykPairs := 0
	ykTriplets := 0
	for r := 27; r < 34; r++ {
		c := c34[r]
		isYk := yakuhaiSet[r]
		if c >= 3 {
			if isYk {
				score += 14
			} else {
				score += 10
			}
			triplets++
			if isYk {
				ykTriplets++
			}
		} else if c == 2 {
			if isYk {
				score += 8
			} else {
				score += 3
			}
			pairs++
			if isYk {
				ykPairs++
			}
		}
	}
	return score, map[string]int{
		"triplets": triplets, "pairs": pairs,
		"yakuhai_pairs": ykPairs, "yakuhai_triplets": ykTriplets,
	}
}

var suitOptionsNumbered = make(map[[9]int][2]int)

func suitOptionsFn(counts [9]int) map[[2]int]bool {
	if sum9(counts) == 0 {
		return map[[2]int]bool{{0, 0}: true}
	}
	i := 0
	for i < 9 && counts[i] == 0 {
		i++
	}
	if i == 9 {
		return map[[2]int]bool{{0, 0}: true}
	}

	results := map[[2]int]bool{}

	cc := counts
	cc[i]--
	for opt := range suitOptionsFn(cc) {
		results[opt] = true
	}
	cc[i]++

	if counts[i] >= 3 {
		cc[i] -= 3
		for opt := range suitOptionsFn(cc) {
			results[[2]int{opt[0] + 1, opt[1]}] = true
		}
		cc[i] += 3
	}

	if i <= 6 && counts[i+1] > 0 && counts[i+2] > 0 {
		cc[i]--
		cc[i+1]--
		cc[i+2]--
		for opt := range suitOptionsFn(cc) {
			results[[2]int{opt[0] + 1, opt[1]}] = true
		}
		cc[i]++
		cc[i+1]++
		cc[i+2]++
	}

	if counts[i] >= 2 {
		cc[i] -= 2
		for opt := range suitOptionsFn(cc) {
			results[[2]int{opt[0], opt[1] + 1}] = true
		}
		cc[i] += 2
	}

	if i <= 7 && counts[i+1] > 0 {
		cc[i]--
		cc[i+1]--
		for opt := range suitOptionsFn(cc) {
			results[[2]int{opt[0], opt[1] + 1}] = true
		}
		cc[i]++
		cc[i+1]++
	}

	if i <= 6 && counts[i+2] > 0 {
		cc[i]--
		cc[i+2]--
		for opt := range suitOptionsFn(cc) {
			results[[2]int{opt[0], opt[1] + 1}] = true
		}
		cc[i]++
		cc[i+2]++
	}

	return results
}

func honorOptions(counts [7]int) (int, int) {
	melds := 0
	partials := 0
	for _, c := range counts {
		if c >= 3 {
			melds++
		} else if c == 2 {
			partials++
		}
	}
	return melds, partials
}

func shantenGeneral(c34 [34]int) int {
	best := 8
	for hasPair := 0; hasPair <= 1; hasPair++ {
		var hand [34]int
		copy(hand[:], c34[:])
		if hasPair == 1 {
			found := false
			for i := 0; i < 34; i++ {
				if hand[i] >= 2 {
					hand[i] -= 2
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		mOpts := suitOptionsFn(toArray9(hand, 0))
		pOpts := suitOptionsFn(toArray9(hand, 9))
		sOpts := suitOptionsFn(toArray9(hand, 18))
		zm, zp := honorOptions(toArray7(hand, 27))

		maxScore := 0
		for mm := range mOpts {
			for pm := range pOpts {
				for sm := range sOpts {
					M := mm[0] + pm[0] + sm[0] + zm
					P := mm[1] + pm[1] + sm[1] + zp
					if M > 4 {
						M = 4
					}
					cap := 4 - M
					if cap < 0 {
						cap = 0
					}
					usedP := P
					if usedP > cap {
						usedP = cap
					}
					score := 2*M + usedP
					if score > maxScore {
						maxScore = score
					}
				}
			}
		}
		sh := 8 - maxScore - hasPair
		if sh < best {
			best = sh
		}
	}
	return best
}

func toArray9(hand [34]int, offset int) [9]int {
	var arr [9]int
	copy(arr[:], hand[offset:offset+9])
	return arr
}

func toArray7(hand [34]int, offset int) [7]int {
	var arr [7]int
	copy(arr[:], hand[offset:offset+7])
	return arr
}

func shanten7Pairs(c34 [34]int) int {
	pairs := 0
	kinds := 0
	for _, x := range c34 {
		if x >= 2 {
			pairs++
		}
		if x >= 1 {
			kinds++
		}
	}
	if pairs > 7 {
		pairs = 7
	}
	return 6 - pairs + max(0, 7-kinds)
}

var yaochuIndices = [13]int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33}

func shantenKokushi(c34 [34]int) int {
	kinds := 0
	hasPair := false
	for _, i := range yaochuIndices {
		if c34[i] >= 1 {
			kinds++
		}
		if c34[i] >= 2 {
			hasPair = true
		}
	}
	return 13 - kinds - boolToInt(hasPair)
}

func computeShanten(c34 [34]int) int {
	return min(shantenGeneral(c34), shanten7Pairs(c34), shantenKokushi(c34))
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func min(a, b, c int) int {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	return m
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func iipeikouPotentialOneSuit(counts [9]int) float64 {
	best := 0.0
	for k := 0; k < 7; k++ {
		if counts[k] >= 2 && counts[k+1] >= 2 && counts[k+2] >= 2 {
			best = math.Max(best, 8.0)
		}
	}
	for k := 0; k < 7; k++ {
		a, b, c := counts[k], counts[k+1], counts[k+2]
		if (a >= 2 && b >= 2 && c >= 1) || (a >= 1 && b >= 2 && c >= 2) {
			best = math.Max(best, 4.0)
		}
	}
	for r := 0; r < 8; r++ {
		if counts[r] >= 2 && counts[r+1] >= 2 {
			leftOk := r == 0 || counts[r-1] == 0
			rightOk := r+1 == 8 || counts[r+2] == 0
			if leftOk && rightOk {
				best = math.Max(best, 1.5)
			}
		}
	}
	return best
}

func daisangenPotential(c34 [34]int) float64 {
	d := [3]int{c34[31], c34[32], c34[33]}
	if d[0] < 1 || d[1] < 1 || d[2] < 1 {
		return 0
	}
	pairs := 0
	trips := 0
	for _, x := range d {
		if x >= 2 {
			pairs++
		}
		if x >= 3 {
			trips++
		}
	}
	if pairs >= 2 && trips >= 1 {
		return 15.0
	}
	if pairs >= 2 {
		return 8.0
	}
	return 0
}

func yakuPotentialBonus(c34 [34]int) (float64, map[string]float64) {
	details := make(map[string]float64)
	suitCounts := [3]int{
		sum9(toArray9(c34, 0)),
		sum9(toArray9(c34, 9)),
		sum9(toArray9(c34, 18)),
	}
	honorCount := 0
	for i := 27; i < 34; i++ {
		honorCount += c34[i]
	}
	sorted := make([]int, 3)
	copy(sorted, suitCounts[:])
	sort.Sort(sort.Reverse(sort.IntSlice(sorted)))
	maxSuit := sorted[0]
	secondSuit := sorted[1]

	tanyaoMiddle := 0
	for _, sb := range []int{0, 9, 18} {
		for r := 1; r <= 7; r++ {
			tanyaoMiddle += c34[sb+r]
		}
	}

	if honorCount == 0 && tanyaoMiddle >= 10 {
		tm := tanyaoMiddle
		if tm > 13 {
			tm = 13
		}
		switch tm {
		case 10:
			details["tanyao"] = 1.5
		case 11:
			details["tanyao"] = 3.5
		case 12:
			details["tanyao"] = 7.5
		default:
			details["tanyao"] = 10.0
		}
	}

	pairs := 0
	for _, x := range c34 {
		if x >= 2 {
			pairs++
		}
	}
	if pairs >= 3 {
		p := pairs
		if p > 6 {
			p = 6
		}
		switch p {
		case 3:
			details["chiitoitsu"] = 1.5
		case 4:
			details["chiitoitsu"] = 3.5
		case 5:
			details["chiitoitsu"] = 6.5
		default:
			details["chiitoitsu"] = 10.0
		}
	}

	ittsuuBest := 0.0
	for _, sb := range []int{0, 9, 18} {
		kinds := 0
		for r := 0; r < 9; r++ {
			if c34[sb+r] >= 1 {
				kinds++
			}
		}
		if kinds >= 6 {
			switch {
			case kinds >= 9:
				ittsuuBest = math.Max(ittsuuBest, 10.0)
			case kinds == 8:
				ittsuuBest = math.Max(ittsuuBest, 5.0)
			case kinds == 7:
				ittsuuBest = math.Max(ittsuuBest, 3.0)
			default:
				ittsuuBest = math.Max(ittsuuBest, 1.0)
			}
		}
	}
	if ittsuuBest > 0 {
		details["ittsuu"] = ittsuuBest
	}

	sanshokuBest := 0.0
	for n := 0; n < 7; n++ {
		s2, s1 := 0, 0
		for _, sb := range []int{0, 9, 18} {
			inRun := c34[sb+n] + c34[sb+n+1] + c34[sb+n+2]
			if inRun >= 2 {
				s2++
				s1++
			} else if inRun >= 1 {
				s1++
			}
		}
		if s2 == 3 {
			sanshokuBest = math.Max(sanshokuBest, 6.5)
		} else if s2 >= 2 && s1 == 3 {
			sanshokuBest = math.Max(sanshokuBest, 3.5)
		} else if s1 == 3 {
			sanshokuBest = math.Max(sanshokuBest, 1.5)
		}
	}
	if sanshokuBest > 0 {
		details["sanshoku_doujun"] = sanshokuBest
	}

	sanshokuDKBest := 0.0
	for rank := 0; rank < 9; rank++ {
		s3, s2, s1 := 0, 0, 0
		for _, sb := range []int{0, 9, 18} {
			if c34[sb+rank] >= 3 {
				s3++
			}
			if c34[sb+rank] >= 2 {
				s2++
			}
			if c34[sb+rank] >= 1 {
				s1++
			}
		}
		if s3 == 3 {
			sanshokuDKBest = math.Max(sanshokuDKBest, 10.0)
		} else if s2 == 3 {
			sanshokuDKBest = math.Max(sanshokuDKBest, 7.0)
		} else if s2 >= 2 && s1 == 3 {
			sanshokuDKBest = math.Max(sanshokuDKBest, 4.0)
		} else if s1 == 3 {
			sanshokuDKBest = math.Max(sanshokuDKBest, 1.5)
		}
	}
	if sanshokuDKBest > 0 {
		details["sanshoku_doukou"] = sanshokuDKBest
	}

	triplets := 0
	for _, x := range c34 {
		if x >= 3 {
			triplets++
		}
	}
	switch {
	case triplets >= 2:
		details["sanankou"] = 4.5
	case triplets == 1 && pairs >= 3:
		details["sanankou"] = 2.5
	case pairs >= 4:
		details["sanankou"] = 1.5
	}

	if pairs+triplets >= 5 {
		details["toitoi"] = 3.5
	} else if pairs+triplets >= 4 && triplets >= 1 {
		details["toitoi"] = 2.5
	}

	if secondSuit == 0 && honorCount == 0 {
		switch {
		case maxSuit >= 11:
			details["chinitsu"] = 20.0
		case maxSuit >= 10:
			details["chinitsu"] = 16.0
		case maxSuit >= 9:
			details["chinitsu"] = 12.0
		}
	} else if secondSuit == 0 && maxSuit >= 9 && honorCount >= 1 && honorCount <= 4 {
		details["honitsu"] = 10.0
	} else if secondSuit == 0 && maxSuit >= 8 && honorCount >= 1 && honorCount <= 5 {
		details["honitsu"] = 7.5
	} else if secondSuit <= 1 && maxSuit+honorCount >= 9 {
		details["honitsu"] = 5.0
	} else if secondSuit <= 2 && maxSuit+honorCount >= 8 {
		details["honitsu"] = 2.0
	}

	edgeCount := 0
	for _, sb := range []int{0, 9, 18} {
		for _, r := range []int{0, 1, 2, 6, 7, 8} {
			edgeCount += c34[sb+r]
		}
	}

	if honorCount == 0 && edgeCount >= 11 {
		details["junchan"] = 6.5
	} else if honorCount == 0 && edgeCount >= 9 {
		details["junchan"] = 3.0
	}
	if edgeCount+honorCount >= 11 {
		details["chanta"] = 4.5
	} else if edgeCount+honorCount >= 9 {
		details["chanta"] = 2.0
	}

	yaochu := 0
	for _, i := range yaochuIndices {
		yaochu += c34[i]
	}
	if yaochu >= 11 {
		details["honroutou"] = 6.5
	} else if yaochu >= 9 {
		details["honroutou"] = 3.0
	}

	ipBest := math.Max(
		iipeikouPotentialOneSuit(toArray9(c34, 0)),
		math.Max(
			iipeikouPotentialOneSuit(toArray9(c34, 9)),
			iipeikouPotentialOneSuit(toArray9(c34, 18)),
		),
	)
	if ipBest > 0 {
		details["iipeikou"] = ipBest
	}

	dg := daisangenPotential(c34)
	if dg > 0 {
		details["daisangen"] = dg
	}

	total := 0.0
	for _, v := range details {
		total += v
	}
	return total, details
}

func evaluateStartingHand(tiles []string, chang, dealerSeat, seat int, doraIndicators []string, playerCount int) (float64, map[string]interface{}) {
	if len(tiles) < 13 {
		return 0, nil
	}
	tiles13 := tiles[:13]

	c34 := [34]int{}
	redDoraCount := 0
	for _, t := range tiles13 {
		idx := tileIndex(t)
		if idx < 0 {
			return 0, nil
		}
		c34[idx]++
		if isRedFive(t) {
			redDoraCount++
		}
	}

	fw := fieldWindTile(chang)
	sw := seatWindTile(seat, dealerSeat, playerCount)
	yakuhaiSet := make(map[int]bool)
	for _, t := range []string{fw, sw, "31z", "32z", "33z"} {
		idx := tileIndex(t)
		if idx >= 0 {
			yakuhaiSet[idx] = true
		}
	}

	mScore := suitShapeDPScore(toArray9(c34, 0))
	pScore := suitShapeDPScore(toArray9(c34, 9))
	sScore := suitShapeDPScore(toArray9(c34, 18))
	honorScore, honorDetail := honorShapeScore(c34, yakuhaiSet)
	shapeScore := mScore + pScore + sScore + honorScore

	sh := computeShanten(c34)
	shantenBonus := math.Max(0, float64(8-sh)*4.0)
	if sh <= 0 {
		shantenBonus += 1.5
	}

	doraTileNames := []string{}
	doraTileIndices := []int{}
	for _, d := range doraIndicators {
		dt := doraFromIndicator(d)
		if dt != "" {
			di := tileIndex(dt)
			if di >= 0 {
				doraTileIndices = append(doraTileIndices, di)
				doraTileNames = append(doraTileNames, dt)
			}
		}
	}

	doraIndexSet := make(map[int]bool)
	for _, di := range doraTileIndices {
		doraIndexSet[di] = true
	}

	nDoraEquiv := 0
	for _, t := range tiles13 {
		if isRedFive(t) {
			nDoraEquiv++
		} else {
			ti := tileIndex(t)
			if doraIndexSet[ti] {
				nDoraEquiv++
			}
		}
	}

	adjacentDora := 0
	for _, di := range doraTileIndices {
		if di < 27 {
			suitBase := (di / 9) * 9
			rank := di % 9
			for _, nb := range []int{rank - 1, rank + 1} {
				if nb >= 0 && nb <= 8 {
					adjacentDora += c34[suitBase+nb]
				}
			}
		}
	}

	yakuBonus, yakuDetails := yakuPotentialBonus(c34)
	roundedYaku := make(map[string]float64)
	for k, v := range yakuDetails {
		roundedYaku[k] = math.Round(v*10) / 10
	}

	doraEquivLadder := doraEquivLadder(nDoraEquiv)
	tripletSameDora := 0.0
	tripletSet := make(map[int]bool)
	for _, di := range doraTileIndices {
		if c34[di] >= 3 {
			tripletSet[di] = true
		}
	}
	if len(tripletSet) > 0 {
		tripletSameDora = 8.0
	}
	doraBonus := doraEquivLadder + float64(adjacentDora)*1.5 + tripletSameDora

	total := float64(shapeScore) + shantenBonus + doraBonus + yakuBonus

	yakuhaiTiles := make([]int, 0)
	for _, t := range []string{fw, sw, "31z", "32z", "33z"} {
		idx := tileIndex(t)
		if idx >= 0 {
			yakuhaiTiles = append(yakuhaiTiles, idx)
		}
	}
	sort.Ints(yakuhaiTiles)

	breakdown := map[string]interface{}{
		"shape_score":           shapeScore,
		"shape_detail": map[string]interface{}{
			"m_score": mScore, "p_score": pScore, "s_score": sScore,
			"honor_score": honorScore, "honor": honorDetail,
		},
		"yaku_potential_bonus":      math.Round(yakuBonus*10) / 10,
		"yaku_potential":            roundedYaku,
		"tanyao":                    detailsHasKey(yakuDetails, "tanyao"),
		"tanyao_bonus":              yakuDetails["tanyao"],
		"honitsu_bonus":             yakuDetails["honitsu"] + yakuDetails["chinitsu"],
		"shanten":                   sh,
		"shanten_breakdown": map[string]int{
			"general": shantenGeneral(c34),
			"pairs7":  shanten7Pairs(c34),
			"kokushi": shantenKokushi(c34),
		},
		"shanten_bonus":                math.Round(shantenBonus*10) / 10,
		"red_dora":                    redDoraCount,
		"red_dora_bonus":              0.0,
		"dora_equiv_count":            nDoraEquiv,
		"dora_count":                  0,
		"dora_tiles":                  doraTileNames,
		"adjacent_dora":               adjacentDora,
		"dora_equiv_ladder_bonus":     math.Round(doraEquivLadder*10) / 10,
		"dora_triplet_same_bonus":     tripletSameDora,
		"dora_bonus":                  math.Round(doraBonus*10) / 10,
		"yakuhai_tiles":               yakuhaiTiles,
	}

	return math.Round(total*10) / 10, breakdown
}

func detailsHasKey(m map[string]float64, k string) bool {
	_, ok := m[k]
	return ok
}

func extractStartingHandsFromGame(game *models.Game) []startingHandResult {
	pd := game.PaipuData
	actions := paipuActionsFromGameData(pd)
	if len(actions) == 0 {
		return nil
	}

	playersList := paipuPlayersList(pd)
	suMap := seatUIDMap(playersList)
	playerCount := game.PlayerCount
	if playerCount == 0 {
		playerCount = 4
	}

	var out []startingHandResult
	for _, act := range actions {
		name, _ := act["name"].(string)
		if !strings.HasSuffix(name, "RecordNewRound") {
			continue
		}
		data, ok := act["data"].(map[string]interface{})
		if !ok {
			continue
		}

		chang := toInt(data["chang"])
		ju := toInt(data["ju"])
		ben := toInt(data["ben"])

		var doraIndicators []string
		if doras, ok := data["doras"].([]interface{}); ok {
			for _, d := range doras {
				if s, ok := d.(string); ok {
					doraIndicators = append(doraIndicators, s)
				}
			}
		}

		dealerSeat := ju
		if op, ok := data["operation"].(map[string]interface{}); ok {
			v := toInt(op["seat"])
			if v >= 0 && v < playerCount {
				dealerSeat = v
			}
		}

		for seat := 0; seat < playerCount; seat++ {
			tileKey := fmt.Sprintf("tiles%d", seat)
			tileRaw := data[tileKey]
			tileArr, ok := tileRaw.([]interface{})
			if !ok || len(tileArr) < 13 {
				continue
			}
			tiles := make([]string, 0, len(tileArr))
			for _, t := range tileArr {
				if s, ok := t.(string); ok {
					tiles = append(tiles, s)
				}
			}

			uid := suMap[seat]
			score, breakdown := evaluateStartingHand(tiles, chang, dealerSeat, seat, doraIndicators, playerCount)
			if breakdown == nil {
				continue
			}

			out = append(out, startingHandResult{
				Score:          score,
				Tiles:          tiles[:13],
				Chang:          chang,
				Ju:             ju,
				Ben:            ben,
				DealerSeat:     dealerSeat,
				Seat:           seat,
				IsDealer:       seat == dealerSeat,
				UID:            uid,
				DoraIndicators: doraIndicators,
				Breakdown:      breakdown,
			})
		}
	}
	return out
}

func computeAllHands(playerCountQ, gameModeQ string) []startingHandResult {
	qs := config.DB.Where("game_type = ?", "online")
	if playerCountQ != "" {
		qs = qs.Where("player_count = ?", playerCountQ)
	}
	if gameModeQ == "east_wind" || gameModeQ == "half_match" {
		qs = qs.Where("game_mode = ?", gameModeQ)
	}
	qs = qs.Order("start_time DESC")

	var games []models.Game
	qs.Find(&games)

	var accounts []models.MahjongSoulAccount
	config.DB.Where("player_id IS NOT NULL").Find(&accounts)
	uidToPlayerID := make(map[int64]string)
	for _, acc := range accounts {
		if acc.PlayerID != nil && acc.UID != 0 {
			uidToPlayerID[acc.UID] = *acc.PlayerID
		}
	}

	seen := make(map[string]bool)
	var out []startingHandResult
	for i := range games {
		g := &games[i]
		actions := paipuActionsFromGameData(g.PaipuData)
		if len(actions) == 0 {
			continue
		}
		dk := paipuDedupeKey(g)
		if seen[dk] {
			continue
		}
		seen[dk] = true

		hands := extractStartingHandsFromGame(g)
		startTimeStr := formatTime(g.StartTime)
		for j := range hands {
			pid := uidToPlayerID[hands[j].UID]
			if pid == "" {
				continue
			}
			hands[j].PlayerID = pid
			hands[j].GameID = g.ID
			hands[j].GameMode = g.GameMode
			hands[j].PlayerCount = g.PlayerCount
			hands[j].StartTime = startTimeStr
			out = append(out, hands[j])
		}
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].Score > out[j].Score
	})
	return out
}

func StartingHands(c *gin.Context) {
	tab := c.DefaultQuery("tab", "overall")
	if tab != "personal" {
		tab = "overall"
	}
	playerID := c.Query("player_id")
	playerCountQ := c.Query("player_count")
	gameModeQ := c.Query("game_mode")
	page := parseQueryInt(c, "page", 1)
	pageSize := parseQueryInt(c, "page_size", 20)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 1
	}
	if pageSize > 100 {
		pageSize = 100
	}

	if tab == "personal" && playerID == "" {
		respondError(c, http.StatusBadRequest, "personal tab requires player_id")
		return
	}

	cached := computeAllHands(playerCountQ, gameModeQ)

	filtered := cached
	if tab == "personal" {
		filtered = nil
		for _, h := range cached {
			if h.PlayerID == playerID {
				filtered = append(filtered, h)
			}
		}
	}

	total := len(filtered)
	start := (page - 1) * pageSize
	end := start + pageSize
	if end > total {
		end = total
	}
	pageHands := filtered[start:end]

	pidSet := make(map[string]bool)
	for _, h := range pageHands {
		pidSet[h.PlayerID] = true
	}
	if tab == "personal" {
		pidSet[playerID] = true
	}

	var players []models.Player
	if len(pidSet) > 0 {
		ids := make([]string, 0, len(pidSet))
		for id := range pidSet {
			ids = append(ids, id)
		}
		config.DB.Where("id IN ?", ids).Find(&players)
	}
	playersMap := make(map[string]*models.Player)
	for i := range players {
		playersMap[players[i].ID] = &players[i]
	}

	results := make([]gin.H, 0)
	for _, h := range pageHands {
		player := playersMap[h.PlayerID]
		if player == nil {
			continue
		}
		results = append(results, gin.H{
			"score":           h.Score,
			"tiles":           h.Tiles,
			"chang":           h.Chang,
			"ju":              h.Ju,
			"ben":             h.Ben,
			"dealer_seat":     h.DealerSeat,
			"seat":            h.Seat,
			"is_dealer":       h.IsDealer,
			"dora_indicators": h.DoraIndicators,
			"breakdown":       h.Breakdown,
			"game_id":         h.GameID,
			"game_mode":       h.GameMode,
			"player_count":    h.PlayerCount,
			"start_time":      h.StartTime,
			"player":          getPlayerBrief(player),
		})
	}

	responseData := gin.H{
		"count":     total,
		"page":      page,
		"page_size": pageSize,
		"results":   results,
	}

	if tab == "personal" {
		scores := make([]float64, 0, len(filtered))
		for _, h := range filtered {
			scores = append(scores, h.Score)
		}
		avg := 0.0
		maxS := 0.0
		minS := 0.0
		if len(scores) > 0 {
			sum := 0.0
			maxS = scores[0]
			minS = scores[0]
			for _, s := range scores {
				sum += s
				if s > maxS {
					maxS = s
				}
				if s < minS {
					minS = s
				}
			}
			avg = math.Round(sum/float64(len(scores))*100) / 100
		}
		target := playersMap[playerID]
		var playerData gin.H
		if target != nil {
			playerData = getPlayerBrief(target)
		}
		responseData["summary"] = gin.H{
			"player":        playerData,
			"total_hands":   total,
			"average_score": avg,
			"max_score":     maxS,
			"min_score":     minS,
		}
	}

	respondOK(c, responseData)
}

func StartingHandsPlayerAverages(c *gin.Context) {
	playerCountQ := c.Query("player_count")
	gameModeQ := c.Query("game_mode")
	minHands := parseQueryInt(c, "min_hands", 8)
	if minHands < 1 {
		minHands = 1
	}

	cached := computeAllHands(playerCountQ, gameModeQ)

	type aggRow struct {
		Sum   float64
		Count int
		Best  float64
		Worst float64
	}
	agg := make(map[string]*aggRow)
	for _, h := range cached {
		r, ok := agg[h.PlayerID]
		if !ok {
			r = &aggRow{Best: math.Inf(-1), Worst: math.Inf(1)}
			agg[h.PlayerID] = r
		}
		r.Sum += h.Score
		r.Count++
		if h.Score > r.Best {
			r.Best = h.Score
		}
		if h.Score < r.Worst {
			r.Worst = h.Score
		}
	}

	type item struct {
		PlayerID     string
		TotalHands   int
		AverageScore float64
		BestScore    float64
		WorstScore   float64
	}
	items := make([]item, 0)
	for pid, row := range agg {
		if row.Count < minHands {
			continue
		}
		avg := math.Round(row.Sum/float64(row.Count)*100) / 100
		items = append(items, item{
			PlayerID:     pid,
			TotalHands:   row.Count,
			AverageScore: avg,
			BestScore:    row.Best,
			WorstScore:   row.Worst,
		})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].AverageScore > items[j].AverageScore
	})

	pidSet := make(map[string]bool)
	for _, it := range items {
		pidSet[it.PlayerID] = true
	}

	var players []models.Player
	if len(pidSet) > 0 {
		ids := make([]string, 0, len(pidSet))
		for id := range pidSet {
			ids = append(ids, id)
		}
		config.DB.Where("id IN ?", ids).Find(&players)
	}
	playersMap := make(map[string]*models.Player)
	for i := range players {
		playersMap[players[i].ID] = &players[i]
	}

	result := make([]gin.H, 0)
	for _, it := range items {
		player := playersMap[it.PlayerID]
		if player == nil {
			continue
		}
		result = append(result, gin.H{
			"player":          getPlayerBrief(player),
			"total_hands":     it.TotalHands,
			"average_score":   it.AverageScore,
			"best_score":      it.BestScore,
			"worst_score":     it.WorstScore,
		})
	}

	respondOK(c, result)
}
