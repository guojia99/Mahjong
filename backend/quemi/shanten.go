package quemi

func sum9(counts []int) int {
	s := 0
	for i := 0; i < 9; i++ {
		s += counts[i]
	}
	return s
}

type mpKey struct {
	m, p int
}

func suitOptionsFn(counts []int) map[mpKey]struct{} {
	results := make(map[mpKey]struct{})

	if sum9(counts) == 0 {
		results[mpKey{0, 0}] = struct{}{}
		return results
	}

	i := 0
	for i < 9 && counts[i] == 0 {
		i++
	}
	if i == 9 {
		results[mpKey{0, 0}] = struct{}{}
		return results
	}

	cc := append([]int(nil), counts...)
	cc[i]--
	for k := range suitOptionsFn(cc) {
		results[k] = struct{}{}
	}
	cc[i]++

	if counts[i] >= 3 {
		cc[i] -= 3
		for k := range suitOptionsFn(cc) {
			results[mpKey{k.m + 1, k.p}] = struct{}{}
		}
		cc[i] += 3
	}

	if i <= 6 && counts[i+1] > 0 && counts[i+2] > 0 {
		cc[i]--
		cc[i+1]--
		cc[i+2]--
		for k := range suitOptionsFn(cc) {
			results[mpKey{k.m + 1, k.p}] = struct{}{}
		}
		cc[i]++
		cc[i+1]++
		cc[i+2]++
	}

	if counts[i] >= 2 {
		cc[i] -= 2
		for k := range suitOptionsFn(cc) {
			results[mpKey{k.m, k.p + 1}] = struct{}{}
		}
		cc[i] += 2
	}

	if i <= 7 && counts[i+1] > 0 {
		cc[i]--
		cc[i+1]--
		for k := range suitOptionsFn(cc) {
			results[mpKey{k.m, k.p + 1}] = struct{}{}
		}
		cc[i]++
		cc[i+1]++
	}

	if i <= 6 && counts[i+2] > 0 {
		cc[i]--
		cc[i+2]--
		for k := range suitOptionsFn(cc) {
			results[mpKey{k.m, k.p + 1}] = struct{}{}
		}
		cc[i]++
		cc[i+2]++
	}

	return results
}

func honorOptions(counts []int) (melds, partials int) {
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
		hand := c34
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

		mOpts := suitOptionsFn(hand[0:9][:])
		pOpts := suitOptionsFn(hand[9:18][:])
		sOpts := suitOptionsFn(hand[18:27][:])
		zm, zp := honorOptions(hand[27:34][:])

		maxScore := 0
		for mk := range mOpts {
			for pk := range pOpts {
				for sk := range sOpts {
					M := mk.m + pk.m + sk.m + zm
					P := mk.p + pk.p + sk.p + zp
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
	if kinds > 7 {
		return 6 - pairs
	}
	return 6 - pairs + max(0, 7-kinds)
}

var yaochuIndices = []int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33}

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
	pairBonus := 0
	if hasPair {
		pairBonus = 1
	}
	return 13 - kinds - pairBonus
}

// ComputeShanten returns minimum shanten for the given tiles.
func ComputeShanten(tiles []string) int {
	c34 := TilesToC34(tiles)
	return min(shantenGeneral(c34), shanten7Pairs(c34), shantenKokushi(c34))
}
