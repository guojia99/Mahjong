package mortal

import (
	"encoding/json"
	"fmt"
)

type builtEvent struct {
	JSON        string
	ActionIndex int
	Kind        string
	Actor       int
}

type mjaiBuilder struct {
	perspective int
	names       [4]string
	out         []builtEvent
	gameStarted bool
	doraCount   int // indicators revealed so far this kyoku
	openPon     [4][]string // rotated seat -> pon tile(s) still open (not yet kakan)
	riichiPending [4]bool   // reach declared, waiting for reach_accepted
	rinshanAfterAnkanActor int // rotated seat; emit dora before next tsumo (-1 = none)
}

// BuildMjaiEvents converts雀魂 actions to mjai JSON strings for one perspective (rotated to seat 0).
func BuildMjaiEvents(actions []map[string]interface{}, perspective int, names [4]string) ([]builtEvent, error) {
	b := &mjaiBuilder{perspective: perspective, names: names}
	for actionIndex, act := range actions {
		if err := b.handleAction(actionIndex, act); err != nil {
			return nil, fmt.Errorf("action %d (%s): %w", actionIndex, toString(act["name"]), err)
		}
	}
	if b.gameStarted {
		b.emit(map[string]interface{}{"type": "end_game"}, len(actions), "end_game")
	}
	return b.out, nil
}

func (b *mjaiBuilder) emit(ev map[string]interface{}, actionIndex int, kind string) {
	raw, _ := json.Marshal(ev)
	actor := -1
	if a, ok := ev["actor"].(int); ok {
		actor = a
	}
	b.out = append(b.out, builtEvent{JSON: string(raw), ActionIndex: actionIndex, Kind: kind, Actor: actor})
}

func (b *mjaiBuilder) emitDorasFromList(actionIndex int, doras []string, kind string) {
	for len(doras) > b.doraCount {
		marker := majsoulTileToMjai(doras[b.doraCount])
		if marker == "" {
			break
		}
		b.emit(map[string]interface{}{
			"type":        "dora",
			"dora_marker": marker,
		}, actionIndex, kind)
		b.doraCount++
	}
}

func (b *mjaiBuilder) handleAction(actionIndex int, act map[string]interface{}) error {
	name := toString(act["name"])
	data, _ := act["data"].(map[string]interface{})
	if data == nil {
		return nil
	}

	if endsWith(name, "RecordNewRound") {
		return b.onNewRound(actionIndex, data)
	}
	if endsWith(name, "RecordDealTile") {
		b.onDealTile(actionIndex, data)
		return nil
	}
	if endsWith(name, "RecordDiscardTile") {
		b.onDiscardTile(actionIndex, data)
		return nil
	}
	if endsWith(name, "RecordChiPengGang") {
		b.onChiPengGang(actionIndex, data)
		return nil
	}
	if endsWith(name, "RecordAnGangAddGang") {
		b.onAnkanKakan(actionIndex, data)
		return nil
	}
	if endsWith(name, "RecordHule") {
		b.onHule(actionIndex, data)
		return nil
	}
	if endsWith(name, "RecordLiuJu") {
		b.onRyukyoku(actionIndex, data)
		return nil
	}
	if endsWith(name, "RecordNoTile") {
		b.emit(map[string]interface{}{"type": "ryukyoku"}, actionIndex, "ryukyoku")
		b.emit(map[string]interface{}{"type": "end_kyoku"}, actionIndex, "end_kyoku")
		return nil
	}
	return nil
}

func (b *mjaiBuilder) onNewRound(actionIndex int, data map[string]interface{}) error {
	if !b.gameStarted {
		rotNames := rotateSeats4(b.names, b.perspective)
		b.emit(map[string]interface{}{
			"type":  "start_game",
			"names": []string{rotNames[0], rotNames[1], rotNames[2], rotNames[3]},
		}, actionIndex, "start_game")
		b.gameStarted = true
	}

	chang := toInt(data["chang"])
	ju := toInt(data["ju"])
	ben := toInt(data["ben"])
	bakaze := "E"
	switch chang {
	case 1:
		bakaze = "S"
	case 2:
		bakaze = "W"
	case 3:
		bakaze = "N"
	}

	scoresArr := [4]int{25000, 25000, 25000, 25000}
	if arr, ok := data["scores"].([]interface{}); ok {
		for i := 0; i < 4 && i < len(arr); i++ {
			scoresArr[i] = toInt(arr[i])
		}
	}
	scoresRot := rotateSeats4(scoresArr, b.perspective)

	op, _ := data["operation"].(map[string]interface{})
	dealerSeat := ju % 4
	if op != nil {
		dealerSeat = toInt(op["seat"])
	}
	oya := rotateSeat(dealerSeat, b.perspective)

	tehais := make([][]string, 4)
	for rs := 0; rs < 4; rs++ {
		origSeat := (rs + b.perspective) % 4
		key := fmt.Sprintf("tiles%d", origSeat)
		tiles := stringSlice(data[key])
		if rs == 0 {
			if len(tiles) == 14 {
				tiles = tiles[:13]
			}
			tehais[rs] = majsoulTilesToMjai(tiles)
		} else {
			hidden := make([]string, 13)
			for i := range hidden {
				hidden[i] = "?"
			}
			tehais[rs] = hidden
		}
	}

	doras := stringSlice(data["doras"])
	b.doraCount = 0
	b.openPon = [4][]string{}
	b.riichiPending = [4]bool{}
	b.rinshanAfterAnkanActor = -1
	doraMarker := ""
	if len(doras) > 0 {
		doraMarker = majsoulTileToMjai(doras[0])
	}
	if doraMarker == "" {
		return fmt.Errorf("missing dora marker in newround")
	}

	b.emit(map[string]interface{}{
		"type":        "start_kyoku",
		"bakaze":      bakaze,
		"dora_marker": doraMarker,
		"kyoku":       ju + 1,
		"honba":       ben,
		"kyotaku":     toInt(data["liqibang"]),
		"oya":         oya,
		"scores":      []int{scoresRot[0], scoresRot[1], scoresRot[2], scoresRot[3]},
		"tehais":      tehais,
	}, actionIndex, "start_kyoku")
	b.doraCount = 1

	// 亲家必须先摸牌（第14张），再打牌
	dealerRot := rotateSeat(dealerSeat, b.perspective)
	if dealerRot == 0 {
		origTiles := stringSlice(data[fmt.Sprintf("tiles%d", dealerSeat)])
		if len(origTiles) == 14 {
			b.emit(map[string]interface{}{
				"type":  "tsumo",
				"actor": 0,
				"pai":   majsoulTileToMjai(origTiles[13]),
			}, actionIndex, "tsumo_dealer")
		}
	} else {
		b.emit(map[string]interface{}{
			"type":  "tsumo",
			"actor": dealerRot,
			"pai":   "?",
		}, actionIndex, "tsumo_dealer_hidden")
	}
	return nil
}

func (b *mjaiBuilder) onDealTile(actionIndex int, data map[string]interface{}) {
	seat := rotateSeat(toInt(data["seat"]), b.perspective)
	if lq, ok := data["liqi"].(map[string]interface{}); ok {
		lqSeat := rotateSeat(toInt(lq["seat"]), b.perspective)
		if lqSeat >= 0 && lqSeat < 4 && b.riichiPending[lqSeat] {
			b.emit(map[string]interface{}{
				"type":  "reach_accepted",
				"actor": lqSeat,
			}, actionIndex, "reach_accepted")
			b.riichiPending[lqSeat] = false
		}
	}
	// 暗杠后：先翻 dora，再岭上摸牌（对齐 libriichi arena）
	if seat == b.rinshanAfterAnkanActor {
		b.emitDorasFromList(actionIndex, stringSlice(data["doras"]), "dora_after_ankan")
		b.rinshanAfterAnkanActor = -1
	}
	tile := majsoulTileToMjai(toString(data["tile"]))
	if seat == 0 {
		b.emit(map[string]interface{}{
			"type":  "tsumo",
			"actor": 0,
			"pai":   tile,
		}, actionIndex, "tsumo")
	} else {
		b.emit(map[string]interface{}{
			"type":  "tsumo",
			"actor": seat,
			"pai":   "?",
		}, actionIndex, "tsumo_other")
	}
	b.emitDorasFromList(actionIndex, stringSlice(data["doras"]), "dora_deal")
}

func (b *mjaiBuilder) onDiscardTile(actionIndex int, data map[string]interface{}) {
	seat := rotateSeat(toInt(data["seat"]), b.perspective)
	tile := majsoulTileToMjai(toString(data["tile"]))
	isLiqi := toBool(data["is_liqi"]) || toBool(data["is_wliqi"])

	// mjai: reach 必须在 dahai 之前
	if isLiqi {
		b.emit(map[string]interface{}{
			"type":  "reach",
			"actor": seat,
		}, actionIndex, "reach")
		b.riichiPending[seat] = true
	}
	b.emit(map[string]interface{}{
		"type":      "dahai",
		"actor":     seat,
		"pai":       tile,
		"tsumogiri": toBool(data["moqie"]),
	}, actionIndex, "dahai")
	b.emitDorasFromList(actionIndex, stringSlice(data["doras"]), "dora_discard")
}

func (b *mjaiBuilder) onChiPengGang(actionIndex int, data map[string]interface{}) {
	seat := rotateSeat(toInt(data["seat"]), b.perspective)
	t := toInt(data["type"])
	tiles := stringSlice(data["tiles"])
	target := -1
	if arr, ok := data["froms"].([]interface{}); ok {
		seatOrig := toInt(data["seat"])
		for _, f := range arr {
			fs := toInt(f)
			if fs != seatOrig {
				target = rotateSeat(fs, b.perspective)
				break
			}
		}
	}
	if target < 0 {
		return
	}

	pai := ""
	consumed := []string{}
	if len(tiles) > 0 {
		pai = majsoulTileToMjai(tiles[len(tiles)-1])
		for i := 0; i < len(tiles)-1; i++ {
			consumed = append(consumed, majsoulTileToMjai(tiles[i]))
		}
	}

	switch t {
	case 0:
		b.emit(map[string]interface{}{
			"type":     "chi",
			"actor":    seat,
			"target":   target,
			"pai":      pai,
			"consumed": consumed,
		}, actionIndex, "chi")
	case 1:
		b.emit(map[string]interface{}{
			"type":     "pon",
			"actor":    seat,
			"target":   target,
			"pai":      pai,
			"consumed": consumed,
		}, actionIndex, "pon")
		b.trackPon(seat, pai)
	case 2:
		b.emit(map[string]interface{}{
			"type":     "daiminkan",
			"actor":    seat,
			"target":   target,
			"pai":      pai,
			"consumed": consumed,
		}, actionIndex, "daiminkan")
	}
}

func (b *mjaiBuilder) onAnkanKakan(actionIndex int, data map[string]interface{}) {
	seat := rotateSeat(toInt(data["seat"]), b.perspective)
	tile := ""
	switch tf := data["tiles"].(type) {
	case string:
		tile = majsoulTileToMjai(tf)
	case []interface{}:
		if len(tf) > 0 {
			tile = majsoulTileToMjai(toString(tf[0]))
		}
	}
	if tile == "" {
		return
	}
	// 雀魂：有同牌碰后的 RecordAnGangAddGang 为加杠；无碰时 type=3 为暗杠（type=2 在数据里仅见于加杠）。
	isKakan := b.hasOpenPon(seat, tile)
	if isKakan {
		b.emit(map[string]interface{}{
			"type":     "kakan",
			"actor":    seat,
			"pai":      tile,
			"consumed": []string{tile, tile, tile},
		}, actionIndex, "kakan")
		b.clearOpenPon(seat, tile)
	} else {
		b.emit(map[string]interface{}{
			"type":     "ankan",
			"actor":    seat,
			"consumed": []string{tile, tile, tile, tile},
		}, actionIndex, "ankan")
		b.rinshanAfterAnkanActor = seat
	}
}

func (b *mjaiBuilder) trackPon(seat int, pai string) {
	b.openPon[seat] = append(b.openPon[seat], pai)
}

func (b *mjaiBuilder) hasOpenPon(seat int, tile string) bool {
	for _, p := range b.openPon[seat] {
		if mjaiTilesMatch(p, tile) {
			return true
		}
	}
	return false
}

func (b *mjaiBuilder) clearOpenPon(seat int, tile string) {
	rest := b.openPon[seat][:0]
	for _, p := range b.openPon[seat] {
		if !mjaiTilesMatch(p, tile) {
			rest = append(rest, p)
		}
	}
	b.openPon[seat] = rest
}

func (b *mjaiBuilder) onHule(actionIndex int, data map[string]interface{}) {
	hules, _ := data["hules"].([]interface{})
	deltasRaw, _ := data["delta_scores"].([]interface{})
	if deltasRaw == nil {
		deltasRaw, _ = data["deltaScores"].([]interface{})
	}
	for _, h := range hules {
		hm, ok := h.(map[string]interface{})
		if !ok {
			continue
		}
		actor := rotateSeat(toInt(hm["seat"]), b.perspective)
		zimo := toBool(hm["zimo"])
		target := actor
		if !zimo {
			target = rotateSeat(toInt(hm["who"]), b.perspective)
		}
		ev := map[string]interface{}{
			"type":   "hora",
			"actor":  actor,
			"target": target,
		}
		if len(deltasRaw) >= 4 {
			deltas := make([]int, 4)
			for i := 0; i < 4; i++ {
				deltas[i] = toInt(deltasRaw[i])
			}
			ev["deltas"] = rotateSeats4([4]int{deltas[0], deltas[1], deltas[2], deltas[3]}, b.perspective)
		}
		b.emit(ev, actionIndex, "hora")
	}
	b.emit(map[string]interface{}{"type": "end_kyoku"}, actionIndex, "end_kyoku")
}

func (b *mjaiBuilder) onRyukyoku(actionIndex int, data map[string]interface{}) {
	ev := map[string]interface{}{"type": "ryukyoku"}
	if arr, ok := data["delta_scores"].([]interface{}); ok && len(arr) >= 4 {
		deltas := make([]int, 4)
		for i := 0; i < 4; i++ {
			deltas[i] = toInt(arr[i])
		}
		ev["deltas"] = rotateSeats4([4]int{deltas[0], deltas[1], deltas[2], deltas[3]}, b.perspective)
	}
	b.emit(ev, actionIndex, "ryukyoku")
	b.emit(map[string]interface{}{"type": "end_kyoku"}, actionIndex, "end_kyoku")
}
