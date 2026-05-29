package mortal

// majsoulTileToMjai converts雀魂牌面 (1m, 0m, 1z…) to mjai (1m, 5mr, E…).
func majsoulTileToMjai(t string) string {
	if t == "" {
		return t
	}
	if len(t) >= 2 && t[0] == '0' {
		suit := t[1]
		switch suit {
		case 'm':
			return "5mr"
		case 'p':
			return "5pr"
		case 's':
			return "5sr"
		}
	}
	if len(t) == 2 && t[1] == 'z' {
		switch t[0] {
		case '1':
			return "E"
		case '2':
			return "S"
		case '3':
			return "W"
		case '4':
			return "N"
		case '5':
			return "P"
		case '6':
			return "F"
		case '7':
			return "C"
		}
	}
	return t
}

func mjaiTileToMajsoul(t string) string {
	switch t {
	case "5mr":
		return "0m"
	case "5pr":
		return "0p"
	case "5sr":
		return "0s"
	case "E":
		return "1z"
	case "S":
		return "2z"
	case "W":
		return "3z"
	case "N":
		return "4z"
	case "P":
		return "5z"
	case "F":
		return "6z"
	case "C":
		return "7z"
	default:
		return t
	}
}

func majsoulTilesToMjai(tiles []string) []string {
	out := make([]string, len(tiles))
	for i, t := range tiles {
		out[i] = majsoulTileToMjai(t)
	}
	return out
}

func rotateSeat(seat, perspective int) int {
	return (seat - perspective + 4) % 4
}

func rotateSeats4[T any](arr [4]T, perspective int) [4]T {
	var out [4]T
	for i := 0; i < 4; i++ {
		out[rotateSeat(i, perspective)] = arr[i]
	}
	return out
}

// mjaiTilesMatch treats red-five variants as the same suit tile.
func mjaiTilesMatch(a, b string) bool {
	if a == b {
		return true
	}
	norm := func(t string) string {
		switch t {
		case "5mr":
			return "5m"
		case "5pr":
			return "5p"
		case "5sr":
			return "5s"
		default:
			return t
		}
	}
	return norm(a) == norm(b)
}
