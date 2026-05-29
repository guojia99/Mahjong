package handlers

import (
	"math"
	"sort"

	"mahjong-backend/config"
	"mahjong-backend/models"

	"github.com/gin-gonic/gin"
)

type paipuBucket struct {
	Games                         int
	Rounds                        int
	Riichi                        int
	DealIn                        int
	Tsumo                         int
	Ron                           int
	FuroActions                   int
	FuroRounds                    int
	MinkanActions                 int
	AnkanActions                  int
	MinkanRounds                  int
	AnkanRounds                   int
	FirstRiichiRounds             int
	ChaseRiichiDecls              int
	WinPointsSum                  int
	Wins                          int
	DealPointsSum                 int
	DealInEvents                  int
	RiichiHands                   int
	RiichiWinHands                int
	RiichiDealHands               int
	RiichiNotenHands              int
	RiichiPtSum                   int
	DamatenWins                   int
	DamatenListenOk               int
	MinkanWinPointsSum            int
	MinkanWinHands                int
	RiichiSelfDrawSum             int
	RiichiTsumoAfterSelfDrawSum   int
	RiichiTsumoWins               int
	RiichiHuAfterSelfDrawSum      int
	RiichiHuWins                  int
}

var paipuStatsRankTypes = map[string]bool{
	"avg_riichi": true, "riichi_rate": true, "damaten_rate": true, "damaten_listen_rate": true,
	"avg_deal_in": true, "deal_in_rate": true, "tsumo_rate": true, "win_rate": true, "avg_win_count": true,
	"avg_furo": true, "furo_rate": true, "avg_win_point": true, "avg_minkan_win_point": true, "avg_deal_point": true,
	"first_riichi_rate": true, "chase_riichi_rate": true,
	"total_minkan": true, "avg_minkan": true, "minkan_rate": true,
	"total_ankan": true, "avg_ankan": true, "ankan_rate": true,
	"riichi_win_rate": true, "riichi_deal_rate": true, "riichi_noten_rate": true,
	"avg_riichi_pt": true, "riichi_quality": true, "riichi_composite": true,
	"avg_riichi_discard_turn": true, "avg_riichi_tsumo_after_turn": true, "avg_riichi_hu_after_turn": true,
}

func newPaipuBucket() *paipuBucket {
	return &paipuBucket{}
}

func paipuActionsFromGameData(pd models.JSONField) []map[string]interface{} {
	if pd.IsNil() {
		return nil
	}
	pdMap := pd.AsMap()
	if pdMap == nil {
		return nil
	}
	actions := pdMap["actions"]
	if actions == nil {
		nested, ok := pdMap["majsoul_record_detail"]
		if !ok {
			return nil
		}
		nm, ok := nested.(map[string]interface{})
		if !ok {
			return nil
		}
		actions = nm["actions"]
		if actions == nil {
			return nil
		}
	}
	arr, ok := actions.([]interface{})
	if !ok {
		return nil
	}
	result := make([]map[string]interface{}, 0, len(arr))
	for _, a := range arr {
		if m, ok := a.(map[string]interface{}); ok {
			result = append(result, m)
		}
	}
	return result
}

func paipuPlayersList(pd models.JSONField) []map[string]interface{} {
	if pd.IsNil() {
		return nil
	}
	pdMap := pd.AsMap()
	if pdMap == nil {
		return nil
	}
	var pl interface{}
	if nested, ok := pdMap["majsoul_record_detail"]; ok {
		if nm, ok := nested.(map[string]interface{}); ok {
			pl = nm["players"]
		}
	}
	if pl == nil {
		pl = pdMap["players"]
	}
	if arr, ok := pl.([]interface{}); ok {
		result := make([]map[string]interface{}, 0, len(arr))
		for _, p := range arr {
			if m, ok := p.(map[string]interface{}); ok {
				result = append(result, m)
			}
		}
		return result
	}
	return nil
}

func seatUIDMap(playersList []map[string]interface{}) map[int]int64 {
	m := make(map[int]int64)
	for _, p := range playersList {
		seat := toInt(p["seat"])
		aid := toInt64(p["accountId"])
		if aid == 0 {
			aid = toInt64(p["account_id"])
		}
		if aid != 0 && seat >= 0 {
			m[seat] = aid
		}
	}
	return m
}

func toInt(v interface{}) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	}
	return 0
}

func toInt64(v interface{}) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int:
		return int64(x)
	case int64:
		return x
	}
	return 0
}

func toFloat(v interface{}) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case int32:
		return float64(x)
	case bool:
		if x {
			return 1
		}
		return 0
	}
	return 0
}

func truthy(v interface{}) bool {
	if b := boolLoose(v); b != nil {
		return *b
	}
	return toFloat(v) != 0
}

func discardTileRiichi(data map[string]interface{}) bool {
	for _, key := range []string{"is_liqi", "isLiqi", "is_wliqi", "isWliqi"} {
		if v, ok := data[key]; ok && truthy(v) {
			return true
		}
	}
	return false
}

func readFloatArray(data map[string]interface{}, maxN int) []float64 {
	var raw interface{}
	raw = data["delta_scores"]
	if raw == nil {
		raw = data["deltaScores"]
	}
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]float64, 0, len(arr))
	for i, x := range arr {
		if i >= maxN {
			break
		}
		out = append(out, toFloat(x))
	}
	return out
}

func boolLoose(v interface{}) *bool {
	switch x := v.(type) {
	case bool:
		return &x
	case float64:
		b := x != 0
		return &b
	case string:
		switch x {
		case "true", "1", "yes":
			b := true
			return &b
		case "false", "0", "no", "":
			b := false
			return &b
		}
	}
	return nil
}

func notilePlayerTenpai(p map[string]interface{}) *bool {
	for _, key := range []string{"tingpai", "tingPai", "ting_pai"} {
		if v, ok := p[key]; ok {
			if b := boolLoose(v); b != nil {
				return b
			}
		}
	}
	tings := p["tings"]
	if tings == nil {
		tings = p["Tings"]
	}
	if arr, ok := tings.([]interface{}); ok {
		b := len(arr) > 0
		return &b
	}
	return nil
}

func playersTenpaiFromRecord(data map[string]interface{}) []*bool {
	var arr interface{}
	arr = data["players"]
	if arr == nil {
		arr = data["Players"]
	}
	a, ok := arr.([]interface{})
	if !ok || len(a) == 0 {
		return nil
	}
	out := make([]*bool, 4)
	for i, p := range a {
		m, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		seat := toInt(m["seat"])
		if seat == 0 && i > 0 {
			seat = i
		}
		if seat >= 0 && seat <= 3 {
			out[seat] = notilePlayerTenpai(m)
		}
	}
	return out
}

type seatStats struct {
	Riichi                       int
	Ron                          int
	Tsumo                        int
	DealIn                       int
	FuroActions                  int
	FuroRounds                   int
	MinkanActions                int
	AnkanActions                 int
	MinkanRounds                 int
	AnkanRounds                 int
	FirstRiichiRounds            int
	ChaseRiichiDecls             int
	WinPointsSum                 int
	Wins                         int
	DealPointsSum                int
	DealInEvents                 int
	RiichiHands                  int
	RiichiWinHands               int
	RiichiDealHands              int
	RiichiNotenHands             int
	RiichiPtSum                  int
	DamatenWins                  int
	DamatenListenOk              int
	MinkanWinPointsSum           int
	MinkanWinHands               int
	RiichiSelfDrawSum            int
	RiichiTsumoAfterSelfDrawSum  int
	RiichiTsumoWins              int
	RiichiHuAfterSelfDrawSum     int
	RiichiHuWins                 int
}

func huPoints(h map[string]interface{}) int {
	n := func(v interface{}) int {
		f := toFloat(v)
		if f != f {
			return 0
		}
		return int(f)
	}
	r := n(h["point_rong"])
	if r == 0 {
		r = n(h["point_zimo"])
	}
	if r == 0 {
		r = n(h["point_sum"])
	}
	if r == 0 {
		r = n(h["dadian"])
	}
	return r
}

func aggregatePaipuPerGameStats(actions []map[string]interface{}) (map[int]*seatStats, int) {
	st := make(map[int]*seatStats)
	getOrCreate := func(seat int) *seatStats {
		if s, ok := st[seat]; ok {
			return s
		}
		s := &seatStats{}
		st[seat] = s
		return s
	}

	hands := 0
	drawsSelf := [4]int{0, 0, 0, 0}
	riichiDeclDraws := [4]int{-1, -1, -1, -1}

	roundLiqi := [4]bool{}
	roundFuro := [4]bool{}
	roundMinkan := [4]bool{}
	roundAnkan := [4]bool{}

	flushHandEnd := func(data map[string]interface{}, kind string) {
		hands++
		deltas := readFloatArray(data, 4)
		for len(deltas) < 4 {
			deltas = append(deltas, 0)
		}

		payerSeat := -1
		if kind == "hule" {
			minV := 0.0
			for i, d := range deltas {
				if d < minV {
					minV = d
					payerSeat = i
				}
			}
		}

		hulesRaw := data["hules"]
		winners := map[int]bool{}
		anyRon := false
		if hulesArr, ok := hulesRaw.([]interface{}); ok {
			for _, raw := range hulesArr {
				h, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}
				si := toInt(h["seat"])
				if si < 0 || si > 3 {
					continue
				}
				zimo := false
				if v, ok := h["zimo"]; ok {
					zimo = truthy(v)
				}
				pts := huPoints(h)
				row := getOrCreate(si)
				row.WinPointsSum += pts
				row.Wins++
				if kind == "hule" && roundLiqi[si] {
					rs := riichiDeclDraws[si]
					if rs >= 0 {
						after := drawsSelf[si] - rs
						if after < 0 {
							after = 0
						}
						row.RiichiHuAfterSelfDrawSum += after
						row.RiichiHuWins++
						if zimo {
							row.RiichiTsumoAfterSelfDrawSum += after
							row.RiichiTsumoWins++
						}
					}
				}
				if kind == "hule" && roundMinkan[si] {
					row.MinkanWinPointsSum += pts
					row.MinkanWinHands++
				}
				winners[si] = true
				if zimo {
					row.Tsumo++
				} else {
					row.Ron++
					anyRon = true
				}
			}
		}

		if kind == "hule" {
			for si := range winners {
				if si >= 0 && si <= 3 && !roundLiqi[si] && !roundFuro[si] {
					getOrCreate(si).DamatenWins++
				}
			}
		}

		tenpai := [4]*bool{}
		if kind == "notile" {
			var arr interface{}
			arr = data["players"]
			if arr == nil {
				arr = data["Players"]
			}
			if pa, ok := arr.([]interface{}); ok {
				for i, p := range pa {
					m, ok := p.(map[string]interface{})
					if !ok {
						continue
					}
					seat := toInt(m["seat"])
					if seat == 0 && i > 0 {
						seat = i
					}
					if seat >= 0 && seat <= 3 {
						tenpai[seat] = notilePlayerTenpai(m)
					}
				}
			}
		}

		var tpPlayers []*bool
		if kind == "hule" || kind == "liuju" {
			tpPlayers = playersTenpaiFromRecord(data)
		}

		for s := 0; s < 4; s++ {
			if roundLiqi[s] || roundFuro[s] {
				continue
			}
			won := winners[s]
			tenOk := won
			if !tenOk && kind == "notile" && tenpai[s] != nil && *tenpai[s] {
				tenOk = true
			}
			if !tenOk && (kind == "hule" || kind == "liuju") && tpPlayers != nil && s < len(tpPlayers) && tpPlayers[s] != nil && *tpPlayers[s] {
				tenOk = true
			}
			if tenOk {
				getOrCreate(s).DamatenListenOk++
			}
		}

		if anyRon && payerSeat >= 0 {
			loss := int(math.Abs(deltas[payerSeat]))
			if payerSeat < len(deltas) {
				loss = int(math.Abs(deltas[payerSeat]))
			}
			if loss < 0 {
				loss = 0
			}
			pr := getOrCreate(payerSeat)
			pr.DealIn++
			pr.DealInEvents++
			pr.DealPointsSum += loss
		}

		for s := 0; s < 4; s++ {
			r := getOrCreate(s)
			if roundLiqi[s] {
				r.RiichiHands++
				dv := 0
				if s < len(deltas) {
					dv = int(deltas[s])
				}
				r.RiichiPtSum += dv
				if winners[s] {
					r.RiichiWinHands++
				}
				if kind == "hule" && anyRon && payerSeat == s {
					r.RiichiDealHands++
				}
				// 立直流听：立直后以小局流局（荒牌/途中流局等）结束且未和牌即计入
				if (kind == "notile" || kind == "liuju") && !winners[s] {
					r.RiichiNotenHands++
				}
			}
			if roundFuro[s] {
				r.FuroRounds++
			}
			if roundMinkan[s] {
				r.MinkanRounds++
			}
			if roundAnkan[s] {
				r.AnkanRounds++
			}
		}

		roundLiqi = [4]bool{}
		roundFuro = [4]bool{}
		roundMinkan = [4]bool{}
		roundAnkan = [4]bool{}
	}

	for _, act := range actions {
		name, _ := act["name"].(string)
		data, _ := act["data"].(map[string]interface{})
		if data == nil {
			continue
		}

		if len(name) >= len("RecordNewRound") && name[len(name)-len("RecordNewRound"):] == "RecordNewRound" {
			drawsSelf = [4]int{0, 0, 0, 0}
			riichiDeclDraws = [4]int{-1, -1, -1, -1}
			roundLiqi = [4]bool{}
			roundFuro = [4]bool{}
			roundMinkan = [4]bool{}
			roundAnkan = [4]bool{}
			continue
		}

		if len(name) >= len("RecordDealTile") && name[len(name)-len("RecordDealTile"):] == "RecordDealTile" {
			si := toInt(data["seat"])
			if si >= 0 && si <= 3 {
				drawsSelf[si]++
			}
			continue
		}

		if len(name) >= len("RecordDiscardTile") && name[len(name)-len("RecordDiscardTile"):] == "RecordDiscardTile" {
			si := toInt(data["seat"])
			if si < 0 || si > 3 {
				continue
			}
			if discardTileRiichi(data) {
				anyBefore := false
				for _, v := range roundLiqi {
					if v {
						anyBefore = true
						break
					}
				}
				row := getOrCreate(si)
				row.Riichi++
				dcnt := drawsSelf[si]
				row.RiichiSelfDrawSum += dcnt
				riichiDeclDraws[si] = dcnt
				if !anyBefore {
					row.FirstRiichiRounds++
				} else {
					row.ChaseRiichiDecls++
				}
				roundLiqi[si] = true
			}
			continue
		}

		if len(name) >= len("RecordChiPengGang") && name[len(name)-len("RecordChiPengGang"):] == "RecordChiPengGang" {
			si := toInt(data["seat"])
			if si >= 0 && si <= 3 {
				row := getOrCreate(si)
				row.FuroActions++
				roundFuro[si] = true
				if t := toFloat(data["type"]); t == 2 {
					row.MinkanActions++
					roundMinkan[si] = true
				}
			}
			continue
		}

		if len(name) >= len("RecordAnGangAddGang") && name[len(name)-len("RecordAnGangAddGang"):] == "RecordAnGangAddGang" {
			si := toInt(data["seat"])
			if si >= 0 && si <= 3 {
				row := getOrCreate(si)
				row.AnkanActions++
				roundAnkan[si] = true
			}
			continue
		}

		if len(name) >= len("RecordHule") && name[len(name)-len("RecordHule"):] == "RecordHule" {
			flushHandEnd(data, "hule")
			continue
		}

		if len(name) >= len("RecordLiuJu") && name[len(name)-len("RecordLiuJu"):] == "RecordLiuJu" {
			flushHandEnd(data, "liuju")
			continue
		}

		if len(name) >= len("RecordNoTile") && name[len(name)-len("RecordNoTile"):] == "RecordNoTile" {
			flushHandEnd(data, "notile")
			continue
		}
	}

	return st, hands
}

func bucketAdd(b *paipuBucket, s *seatStats, nhands int) {
	b.Games++
	b.Rounds += nhands
	b.Riichi += s.Riichi
	b.DealIn += s.DealIn
	b.Tsumo += s.Tsumo
	b.Ron += s.Ron
	b.FuroActions += s.FuroActions
	b.FuroRounds += s.FuroRounds
	b.MinkanActions += s.MinkanActions
	b.AnkanActions += s.AnkanActions
	b.MinkanRounds += s.MinkanRounds
	b.AnkanRounds += s.AnkanRounds
	b.FirstRiichiRounds += s.FirstRiichiRounds
	b.ChaseRiichiDecls += s.ChaseRiichiDecls
	b.WinPointsSum += s.WinPointsSum
	b.Wins += s.Wins
	b.DealPointsSum += s.DealPointsSum
	b.DealInEvents += s.DealInEvents
	b.RiichiHands += s.RiichiHands
	b.RiichiWinHands += s.RiichiWinHands
	b.RiichiDealHands += s.RiichiDealHands
	b.RiichiNotenHands += s.RiichiNotenHands
	b.RiichiPtSum += s.RiichiPtSum
	b.DamatenWins += s.DamatenWins
	b.DamatenListenOk += s.DamatenListenOk
	b.MinkanWinPointsSum += s.MinkanWinPointsSum
	b.MinkanWinHands += s.MinkanWinHands
	b.RiichiSelfDrawSum += s.RiichiSelfDrawSum
	b.RiichiTsumoAfterSelfDrawSum += s.RiichiTsumoAfterSelfDrawSum
	b.RiichiTsumoWins += s.RiichiTsumoWins
	b.RiichiHuAfterSelfDrawSum += s.RiichiHuAfterSelfDrawSum
	b.RiichiHuWins += s.RiichiHuWins
}

func paipuDedupeKey(game *models.Game) string {
	if !game.PaipuData.IsNil() {
		pdMap := game.PaipuData.AsMap()
		if pdMap != nil {
			if nested, ok := pdMap["majsoul_record_detail"]; ok {
				if nm, ok := nested.(map[string]interface{}); ok {
					if u, ok := nm["uuid"]; ok {
						if s, ok := u.(string); ok && s != "" {
							return s
						}
					}
				}
			}
			if u, ok := pdMap["uuid"]; ok {
				if s, ok := u.(string); ok && s != "" {
					return s
				}
			}
		}
	}
	if game.SourceURL != "" {
		return game.SourceURL
	}
	return game.ID
}

func emptySeatStats() *seatStats {
	return &seatStats{}
}

func buildRankItems(buckets map[string]*paipuBucket, rankType string, minGames int) ([]map[string]interface{}, bool) {
	type rankItem struct {
		PlayerID string
		Rate     float64
		Count    int
		Total    int
		Rounds   int
	}
	items := make([]rankItem, 0)
	reverse := true

	for pid, b := range buckets {
		gcount := b.Games
		if gcount < minGames {
			continue
		}
		rounds := b.Rounds
		riichi := b.Riichi
		dealIn := b.DealIn
		tsumo := b.Tsumo
		ron := b.Ron
		wins := tsumo + ron

		rate := 0.0
		count := 0
		total := 0

		switch rankType {
		case "avg_riichi":
			if gcount == 0 {
				continue
			}
			rate = round2(float64(riichi) / float64(gcount))
			count = riichi
			total = gcount
		case "riichi_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(riichi) / float64(rounds) * 100)
			count = riichi
			total = rounds
		case "avg_deal_in":
			if gcount == 0 {
				continue
			}
			rate = round2(float64(dealIn) / float64(gcount))
			count = dealIn
			total = gcount
		case "deal_in_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(dealIn) / float64(rounds) * 100)
			count = dealIn
			total = rounds
		case "tsumo_rate":
			if wins <= 0 {
				continue
			}
			rate = round2(float64(tsumo) / float64(wins) * 100)
			count = tsumo
			total = wins
		case "win_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(wins) / float64(rounds) * 100)
			count = wins
			total = rounds
		case "damaten_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(b.DamatenWins) / float64(rounds) * 100)
			count = b.DamatenWins
			total = rounds
		case "damaten_listen_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(b.DamatenListenOk) / float64(rounds) * 100)
			count = b.DamatenListenOk
			total = rounds
		case "avg_win_count":
			if gcount == 0 {
				continue
			}
			rate = round2(float64(b.Wins) / float64(gcount))
			count = b.Wins
			total = gcount
		case "avg_furo":
			if gcount == 0 {
				continue
			}
			rate = round2(float64(b.FuroActions) / float64(gcount))
			count = b.FuroActions
			total = gcount
		case "furo_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(b.FuroRounds) / float64(rounds) * 100)
			count = b.FuroRounds
			total = rounds
		case "avg_win_point":
			if b.Wins <= 0 {
				continue
			}
			rate = round1(float64(b.WinPointsSum) / float64(b.Wins))
			count = b.WinPointsSum
			total = b.Wins
		case "avg_minkan_win_point":
			if b.MinkanWinHands <= 0 {
				continue
			}
			rate = round1(float64(b.MinkanWinPointsSum) / float64(b.MinkanWinHands))
			count = b.MinkanWinPointsSum
			total = b.MinkanWinHands
		case "avg_deal_point":
			if b.DealInEvents <= 0 {
				continue
			}
			rate = round1(float64(b.DealPointsSum) / float64(b.DealInEvents))
			count = b.DealPointsSum
			total = b.DealInEvents
		case "first_riichi_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(b.FirstRiichiRounds) / float64(rounds) * 100)
			count = b.FirstRiichiRounds
			total = rounds
		case "chase_riichi_rate":
			if riichi <= 0 {
				continue
			}
			rate = round2(float64(b.ChaseRiichiDecls) / float64(riichi) * 100)
			count = b.ChaseRiichiDecls
			total = riichi
		case "total_minkan":
			rate = float64(b.MinkanActions)
			count = b.MinkanActions
			total = gcount
		case "avg_minkan":
			if gcount == 0 {
				continue
			}
			rate = round2(float64(b.MinkanActions) / float64(gcount))
			count = b.MinkanActions
			total = gcount
		case "minkan_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(b.MinkanRounds) / float64(rounds) * 100)
			count = b.MinkanRounds
			total = rounds
		case "total_ankan":
			rate = float64(b.AnkanActions)
			count = b.AnkanActions
			total = gcount
		case "avg_ankan":
			if gcount == 0 {
				continue
			}
			rate = round2(float64(b.AnkanActions) / float64(gcount))
			count = b.AnkanActions
			total = gcount
		case "ankan_rate":
			if rounds == 0 {
				continue
			}
			rate = round2(float64(b.AnkanRounds) / float64(rounds) * 100)
			count = b.AnkanRounds
			total = rounds
		case "riichi_win_rate":
			if b.RiichiHands <= 0 {
				continue
			}
			rate = round2(float64(b.RiichiWinHands) / float64(b.RiichiHands) * 100)
			count = b.RiichiWinHands
			total = b.RiichiHands
		case "riichi_deal_rate":
			if b.RiichiHands <= 0 {
				continue
			}
			rate = round2(float64(b.RiichiDealHands) / float64(b.RiichiHands) * 100)
			count = b.RiichiDealHands
			total = b.RiichiHands
		case "riichi_noten_rate":
			if b.RiichiHands <= 0 {
				continue
			}
			rate = round2(float64(b.RiichiNotenHands) / float64(b.RiichiHands) * 100)
			count = b.RiichiNotenHands
			total = b.RiichiHands
			reverse = false
		case "avg_riichi_pt":
			if b.RiichiHands <= 0 {
				continue
			}
			rate = round1(float64(b.RiichiPtSum) / float64(b.RiichiHands))
			count = b.RiichiPtSum
			total = b.RiichiHands
		case "riichi_quality":
			if b.RiichiHands <= 0 {
				continue
			}
			rate = round2(float64(b.RiichiWinHands-b.RiichiDealHands) / float64(b.RiichiHands) * 100)
			count = b.RiichiWinHands - b.RiichiDealHands
			total = b.RiichiHands
		case "riichi_composite":
			sc := riichiCompositeScore(b)
			if sc < 0 {
				continue
			}
			rate = sc
			count = b.RiichiWinHands
			total = b.RiichiHands
		case "avg_riichi_discard_turn":
			if riichi <= 0 {
				continue
			}
			rate = round2(float64(b.RiichiSelfDrawSum) / float64(riichi))
			count = b.RiichiSelfDrawSum
			total = riichi
			reverse = false
		case "avg_riichi_tsumo_after_turn":
			if b.RiichiTsumoWins <= 0 {
				continue
			}
			rate = round2(float64(b.RiichiTsumoAfterSelfDrawSum) / float64(b.RiichiTsumoWins))
			count = b.RiichiTsumoAfterSelfDrawSum
			total = b.RiichiTsumoWins
			reverse = false
		case "avg_riichi_hu_after_turn":
			if b.RiichiHuWins <= 0 {
				continue
			}
			rate = round2(float64(b.RiichiHuAfterSelfDrawSum) / float64(b.RiichiHuWins))
			count = b.RiichiHuAfterSelfDrawSum
			total = b.RiichiHuWins
			reverse = false
		default:
			continue
		}

		items = append(items, rankItem{PlayerID: pid, Rate: rate, Count: count, Total: total, Rounds: rounds})
	}

	sort.Slice(items, func(i, j int) bool {
		if reverse {
			return items[i].Rate > items[j].Rate
		}
		return items[i].Rate < items[j].Rate
	})

	result := make([]map[string]interface{}, 0, len(items))
	for _, it := range items {
		result = append(result, map[string]interface{}{
			"player_id": it.PlayerID,
			"rate":      it.Rate,
			"count":     it.Count,
			"total":     it.Total,
			"rounds":    it.Rounds,
		})
	}
	return result, reverse
}

func riichiCompositeScore(b *paipuBucket) float64 {
	rh := b.RiichiHands
	if rh <= 0 {
		return -1
	}
	rw := b.RiichiWinHands
	rdh := b.RiichiDealHands
	rn := b.RiichiNotenHands
	rpt := b.RiichiPtSum
	ptPer := float64(rpt) / float64(rh)
	ptN := math.Max(0, math.Min(1, (ptPer+3000)/6000))
	netN := math.Max(0, math.Min(1, (float64(rw-rdh)/float64(rh)+1)*0.5))
	s := 0.24*(float64(rw)/float64(rh)) + 0.24*(1-float64(rdh)/float64(rh)) +
		0.19*(1-float64(rn)/float64(rh)) + 0.19*ptN + 0.14*netN
	return math.Round(100.0*s*100) / 100
}

func PaipuStatsRanking(c *gin.Context) {
	gameType := c.Query("game_type")
	if gameType == "offline" {
		respondOK(c, []interface{}{})
		return
	}

	rankType := c.Query("rank_type")
	if rankType == "" {
		rankType = "win_rate"
	}
	if !paipuStatsRankTypes[rankType] {
		rankType = "win_rate"
	}

	minGames := parseQueryInt(c, "min_games", 1)
	playerCount := c.Query("player_count")
	gameMode := c.Query("game_mode")

	qs := config.DB.Where("game_type = ?", "online").Order("start_time ASC")
	if playerCount != "" {
		qs = qs.Where("player_count = ?", playerCount)
	}
	if gameMode != "" {
		qs = qs.Where("game_mode = ?", gameMode)
	}

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
	buckets := make(map[string]*paipuBucket)
	getBucket := func(pid string) *paipuBucket {
		if b, ok := buckets[pid]; ok {
			return b
		}
		b := newPaipuBucket()
		buckets[pid] = b
		return b
	}

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

		playersList := paipuPlayersList(g.PaipuData)
		suMap := seatUIDMap(playersList)
		seatStat, nhands := aggregatePaipuPerGameStats(actions)
		if nhands <= 0 {
			continue
		}

		for seat, uid := range suMap {
			pid, ok := uidToPlayerID[uid]
			if !ok || pid == "" {
				continue
			}
			s := seatStat[seat]
			if s == nil {
				s = emptySeatStats()
			}
			getBucket(pid).Games++
			getBucket(pid).Rounds += nhands
			b := getBucket(pid)
			b.Riichi += s.Riichi
			b.DealIn += s.DealIn
			b.Tsumo += s.Tsumo
			b.Ron += s.Ron
			b.FuroActions += s.FuroActions
			b.FuroRounds += s.FuroRounds
			b.MinkanActions += s.MinkanActions
			b.AnkanActions += s.AnkanActions
			b.MinkanRounds += s.MinkanRounds
			b.AnkanRounds += s.AnkanRounds
			b.FirstRiichiRounds += s.FirstRiichiRounds
			b.ChaseRiichiDecls += s.ChaseRiichiDecls
			b.WinPointsSum += s.WinPointsSum
			b.Wins += s.Wins
			b.DealPointsSum += s.DealPointsSum
			b.DealInEvents += s.DealInEvents
			b.RiichiHands += s.RiichiHands
			b.RiichiWinHands += s.RiichiWinHands
			b.RiichiDealHands += s.RiichiDealHands
			b.RiichiNotenHands += s.RiichiNotenHands
			b.RiichiPtSum += s.RiichiPtSum
			b.DamatenWins += s.DamatenWins
			b.DamatenListenOk += s.DamatenListenOk
			b.MinkanWinPointsSum += s.MinkanWinPointsSum
			b.MinkanWinHands += s.MinkanWinHands
			b.RiichiSelfDrawSum += s.RiichiSelfDrawSum
			b.RiichiTsumoAfterSelfDrawSum += s.RiichiTsumoAfterSelfDrawSum
			b.RiichiTsumoWins += s.RiichiTsumoWins
			b.RiichiHuAfterSelfDrawSum += s.RiichiHuAfterSelfDrawSum
			b.RiichiHuWins += s.RiichiHuWins
		}
	}

	items, _ := buildRankItems(buckets, rankType, minGames)

	idSet := make(map[string]bool)
	for _, it := range items {
		if pid, ok := it["player_id"].(string); ok {
			idSet[pid] = true
		}
	}

	var players []models.Player
	if len(idSet) > 0 {
		ids := make([]string, 0, len(idSet))
		for id := range idSet {
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
		pid, _ := it["player_id"].(string)
		player := playersMap[pid]
		if player == nil {
			continue
		}
		result = append(result, gin.H{
			"player": getPlayerBrief(player),
			"rate":   it["rate"],
			"count":  it["count"],
			"total":  it["total"],
			"rounds": it["rounds"],
		})
	}

	respondOK(c, result)
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func round1(v float64) float64 {
	return math.Round(v*10) / 10
}
