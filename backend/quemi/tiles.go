package quemi

import (
	"fmt"
	"regexp"
	"sort"
)

var tilePattern = regexp.MustCompile(`^(\d)([mpsz])$`)

// PuzzleTileOrder is the canonical tile sort order (no red fives).
var PuzzleTileOrder = []string{
	"1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
	"1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p",
	"1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s",
	"1z", "2z", "3z", "4z", "5z", "6z", "7z",
}

// TileToIndex maps a tile string to 0–33 index, or -1 if invalid.
func TileToIndex(tile string) int {
	m := tilePattern.FindStringSubmatch(tile)
	if m == nil {
		return -1
	}
	num := int(m[1][0] - '0')
	switch m[2] {
	case "m":
		return num - 1
	case "p":
		return 9 + num - 1
	case "s":
		return 18 + num - 1
	case "z":
		return 27 + num - 1
	default:
		return -1
	}
}

// TileToPai parses a tile string into Pai.
func TileToPai(tile string) (Pai, error) {
	m := tilePattern.FindStringSubmatch(tile)
	if m == nil {
		return Pai{}, fmt.Errorf("invalid tile: %s", tile)
	}
	return Pai{Type: PaiType(m[2]), Num: int(m[1][0] - '0')}, nil
}

// MustTileToPai parses a tile or panics (for internal use with known-good tiles).
func MustTileToPai(tile string) Pai {
	p, err := TileToPai(tile)
	if err != nil {
		panic(err)
	}
	return p
}

// PaiToTile formats Pai as tile string.
func PaiToTile(p Pai) string {
	return fmt.Sprintf("%d%s", p.Num, p.Type)
}

// SortTilesCanonical returns tiles sorted by comparePai order.
func SortTilesCanonical(tiles []string) []string {
	out := append([]string(nil), tiles...)
	sort.Slice(out, func(i, j int) bool {
		return ComparePai(MustTileToPai(out[i]), MustTileToPai(out[j])) < 0
	})
	return out
}

// BuildCanonicalAnswer returns 13 sorted hand tiles + draw.
func BuildCanonicalAnswer(hand13 []string, draw string) []string {
	sorted := SortTilesCanonical(hand13)
	out := make([]string, 0, 14)
	out = append(out, sorted...)
	out = append(out, draw)
	return out
}

// CountTiles counts occurrences per tile string.
func CountTiles(tiles []string) map[string]int {
	c := make(map[string]int)
	for _, t := range tiles {
		if t == "" {
			continue
		}
		c[t]++
	}
	return c
}

// TilesToC34 converts tiles to a 34-element count array.
func TilesToC34(tiles []string) [34]int {
	var c34 [34]int
	for _, t := range tiles {
		i := TileToIndex(t)
		if i >= 0 {
			c34[i]++
		}
	}
	return c34
}
