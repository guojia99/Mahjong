package quemi

// Rule holds scoring rule toggles.
type Rule struct {
	ShiDuan      int
	DuoBeiYiMan  int
	FuHeYiMan    int
	LianFeng4    int
	AllowLeiMan  int
}

// DefaultRule returns standard rule settings.
func DefaultRule() Rule {
	return Rule{ShiDuan: 1, DuoBeiYiMan: 1, FuHeYiMan: 1, LianFeng4: 1, AllowLeiMan: 1}
}

// Yaku evaluates a hand for han.
type Yaku interface {
	Test(h *HandSet, rule *Rule) int
	Name() string
	IsDora() bool
}

type baseYaku struct {
	name   string
	isDora bool
}

func (b baseYaku) Name() string { return b.name }
func (b baseYaku) IsDora() bool { return b.isDora }

type menzenTsumo struct{ baseYaku }

func (y menzenTsumo) Test(h *HandSet, _ *Rule) int {
	if TestFlag(h.Flag, Tsumo|Menzen) {
		return 1
	}
	return 0
}
func (y menzenTsumo) Name() string { return "门前清自摸和" }

type tanYao struct{ baseYaku }

func (y tanYao) Test(h *HandSet, rule *Rule) int {
	if rule.ShiDuan == 0 && !TestFlag(h.Flag, Menzen) {
		return 0
	}
	for _, b := range h.Blocks {
		if b.ConsistYao() {
			return 0
		}
	}
	if h.Pair.ConsistYao() {
		return 0
	}
	return 1
}
func (y tanYao) Name() string { return "断幺九" }

type yakuhaiField struct {
	baseYaku
	fieldFlag int
	zNum      int
}

func (y yakuhaiField) Test(h *HandSet, _ *Rule) int {
	if !TestFlag(h.Flag, y.fieldFlag) {
		return 0
	}
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num == y.zNum {
			return 1
		}
	}
	return 0
}

func newYakuhaiField(fieldFlag, zNum int, name string) Yaku {
	return yakuhaiField{baseYaku: baseYaku{name: name}, fieldFlag: fieldFlag, zNum: zNum}
}

type yakuhaiHako struct{ baseYaku }

func (y yakuhaiHako) Test(h *HandSet, _ *Rule) int {
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num == 5 {
			return 1
		}
	}
	return 0
}
func (y yakuhaiHako) Name() string { return "役牌 - 白" }

type yakuhaiHatsu struct{ baseYaku }

func (y yakuhaiHatsu) Test(h *HandSet, _ *Rule) int {
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num == 6 {
			return 1
		}
	}
	return 0
}
func (y yakuhaiHatsu) Name() string { return "役牌 - 发" }

type yakuhaiCyuu struct{ baseYaku }

func (y yakuhaiCyuu) Test(h *HandSet, _ *Rule) int {
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num == 7 {
			return 1
		}
	}
	return 0
}
func (y yakuhaiCyuu) Name() string { return "役牌 - 中" }

type flagYaku struct {
	baseYaku
	flagVal       int
	requireMenzen bool
}

func (y flagYaku) Test(h *HandSet, _ *Rule) int {
	if y.requireMenzen && !TestFlag(h.Flag, Menzen) {
		return 0
	}
	if TestFlag(h.Flag, y.flagVal) {
		return 1
	}
	return 0
}

func newFlagYaku(flagVal int, name string, requireMenzen bool) Yaku {
	return flagYaku{baseYaku: baseYaku{name: name}, flagVal: flagVal, requireMenzen: requireMenzen}
}

type pinfu struct{ baseYaku }

func (y pinfu) Test(h *HandSet, _ *Rule) int {
	if !TestFlag(h.Flag, Menzen) {
		return 0
	}
	if h.Pair.GetPai()[0].IsYakuhai(h.Flag) > 0 {
		return 0
	}
	for _, b := range h.Blocks {
		if b.BType != BlockSeq {
			return 0
		}
	}
	if h.Type != MachiLiangMian {
		return 0
	}
	return 1
}
func (y pinfu) Name() string { return "平和" }

type iipeikou struct{ baseYaku }

func (y iipeikou) Test(h *HandSet, _ *Rule) int {
	if !TestFlag(h.Flag, Menzen) {
		return 0
	}
	lb := append([]Block(nil), h.Blocks...)
	for i := 0; i < 4; i++ {
		for j := i + 1; j < 4; j++ {
			if lb[i].EqualTo(lb[j]) && lb[i].BType == BlockSeq {
				lb = append(lb[:j], lb[j+1:]...)
				lb = append(lb[:i], lb[i+1:]...)
				if len(lb) < 2 || !lb[0].EqualTo(lb[1]) {
					return 1
				}
				return 0
			}
		}
	}
	return 0
}
func (y iipeikou) Name() string { return "一杯口" }

type ryanpeikou struct{ baseYaku }

func (y ryanpeikou) Test(h *HandSet, _ *Rule) int {
	if !TestFlag(h.Flag, Menzen) {
		return 0
	}
	lb := append([]Block(nil), h.Blocks...)
	for i := 0; i < 4; i++ {
		for j := i + 1; j < 4; j++ {
			if lb[i].EqualTo(lb[j]) && lb[i].BType == BlockSeq {
				lb = append(lb[:j], lb[j+1:]...)
				lb = append(lb[:i], lb[i+1:]...)
				if len(lb) >= 2 && lb[0].EqualTo(lb[1]) {
					return 3
				}
				return 0
			}
		}
	}
	return 0
}
func (y ryanpeikou) Name() string { return "两杯口" }

type doraYaku struct{ baseYaku }

func (y doraYaku) Test(h *HandSet, _ *Rule) int {
	cnt := 0
	for _, b := range h.Blocks {
		for _, p := range b.GetPai() {
			for _, d := range h.Dora {
				if d.Next().EqualTo(p) {
					cnt++
				}
			}
		}
	}
	for _, d := range h.Dora {
		if d.Next().EqualTo(h.Pair.GetPai()[0]) {
			cnt += 2
		}
	}
	return cnt
}
func (y doraYaku) Name() string { return "宝牌" }

type uraYaku struct{ baseYaku }

func (y uraYaku) Test(h *HandSet, _ *Rule) int {
	cnt := 0
	for _, b := range h.Blocks {
		for _, p := range b.GetPai() {
			for _, d := range h.Ura {
				if d.Next().EqualTo(p) {
					cnt++
				}
			}
		}
	}
	for _, d := range h.Ura {
		if d.Next().EqualTo(h.Pair.GetPai()[0]) {
			cnt += 2
		}
	}
	return cnt
}
func (y uraYaku) Name() string { return "里宝牌" }

type akaDoraYaku struct{ baseYaku }

func (y akaDoraYaku) Test(h *HandSet, _ *Rule) int { return h.RedCnt }
func (y akaDoraYaku) Name() string                 { return "赤宝牌" }

type toitoi struct{ baseYaku }

func (y toitoi) Test(h *HandSet, _ *Rule) int {
	for _, b := range h.Blocks {
		if b.BType == BlockSeq {
			return 0
		}
	}
	return 2
}
func (y toitoi) Name() string { return "对对和" }

type sanankou struct{ baseYaku }

func (y sanankou) Test(h *HandSet, _ *Rule) int {
	c := 0
	for _, b := range h.Blocks {
		if b.BType != BlockSeq && !b.IsOpen {
			c++
		}
	}
	if c == 3 {
		return 2
	}
	return 0
}
func (y sanankou) Name() string { return "三暗刻" }

type sanshokuDoukou struct{ baseYaku }

func (y sanshokuDoukou) Test(h *HandSet, _ *Rule) int {
	c := make([]int, 13)
	for _, b := range h.Blocks {
		if b.BType != BlockSeq {
			c[b.Num] |= 1 << PType2Int(b.PType)
			if c[b.Num] == 7 {
				return 2
			}
		}
	}
	return 0
}
func (y sanshokuDoukou) Name() string { return "三色同刻" }

type sanshokuDoujun struct{ baseYaku }

func (y sanshokuDoujun) Test(h *HandSet, _ *Rule) int {
	v := 2
	if !TestFlag(h.Flag, Menzen) {
		v--
	}
	c := make([]int, 13)
	for _, b := range h.Blocks {
		if b.BType == BlockSeq {
			c[b.Num] |= 1 << PType2Int(b.PType)
			if c[b.Num] == 7 {
				return v
			}
		}
	}
	return 0
}
func (y sanshokuDoujun) Name() string { return "三色同顺" }

type sankantsu struct{ baseYaku }

func (y sankantsu) Test(h *HandSet, _ *Rule) int {
	c := 0
	for _, b := range h.Blocks {
		if b.BType == BlockQuad {
			c++
		}
	}
	if c == 3 {
		return 2
	}
	return 0
}
func (y sankantsu) Name() string { return "三杠子" }

type shousangen struct{ baseYaku }

func (y shousangen) Test(h *HandSet, _ *Rule) int {
	c := 0
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num >= 5 && b.Num <= 7 {
			c++
		}
	}
	if c == 2 && h.Pair.Type == PaiZ && h.Pair.Num >= 5 && h.Pair.Num <= 7 {
		return 2
	}
	return 0
}
func (y shousangen) Name() string { return "小三元" }

type honroutou struct{ baseYaku }

func (y honroutou) Test(h *HandSet, _ *Rule) int {
	hasZi := false
	for _, b := range h.Blocks {
		if b.BType == BlockSeq || !b.GetPai()[0].IsYao() {
			return 0
		}
		if b.PType == PaiZ {
			hasZi = true
		}
	}
	if h.Pair.Type == PaiZ {
		hasZi = true
	}
	if h.Pair.GetPai()[0].IsYao() && hasZi {
		return 2
	}
	return 0
}
func (y honroutou) Name() string { return "混老头" }

type chantaiyao struct{ baseYaku }

func (y chantaiyao) Test(h *HandSet, _ *Rule) int {
	v := 2
	if !TestFlag(h.Flag, Menzen) {
		v--
	}
	haveZi, haveSEQ := false, false
	for _, b := range h.Blocks {
		if b.BType == BlockSeq {
			haveSEQ = true
		}
		if b.PType == PaiZ {
			haveZi = true
		}
		if !b.ConsistYao() {
			return 0
		}
	}
	if h.Pair.Type == PaiZ {
		haveZi = true
	}
	if !h.Pair.ConsistYao() || !haveZi || !haveSEQ {
		return 0
	}
	return v
}
func (y chantaiyao) Name() string { return "混全带幺九" }

type junchantaiyao struct{ baseYaku }

func (y junchantaiyao) Test(h *HandSet, _ *Rule) int {
	v := 3
	if !TestFlag(h.Flag, Menzen) {
		v--
	}
	haveZi, haveSEQ := false, false
	for _, b := range h.Blocks {
		if b.BType == BlockSeq {
			haveSEQ = true
		}
		if b.PType == PaiZ {
			haveZi = true
		}
		if !b.ConsistYao() {
			return 0
		}
	}
	if h.Pair.Type == PaiZ {
		haveZi = true
	}
	if !h.Pair.ConsistYao() || haveZi || !haveSEQ {
		return 0
	}
	return v
}
func (y junchantaiyao) Name() string { return "纯全带幺九" }

type honiisou struct{ baseYaku }

func (y honiisou) Test(h *HandSet, _ *Rule) int {
	v := 3
	if !TestFlag(h.Flag, Menzen) {
		v--
	}
	ct := [4]int{}
	for _, b := range h.Blocks {
		ct[PType2Int(b.PType)] = 1
	}
	ct[PType2Int(h.Pair.Type)] = 1
	if ct[0]+ct[1]+ct[2] == 1 && ct[3] == 1 {
		return v
	}
	return 0
}
func (y honiisou) Name() string { return "混一色" }

type chiniisou struct{ baseYaku }

func (y chiniisou) Test(h *HandSet, _ *Rule) int {
	v := 6
	if !TestFlag(h.Flag, Menzen) {
		v--
	}
	ct := [4]int{}
	for _, b := range h.Blocks {
		ct[PType2Int(b.PType)] = 1
	}
	ct[PType2Int(h.Pair.Type)] = 1
	if ct[0]+ct[1]+ct[2] == 1 && ct[3] == 0 {
		return v
	}
	return 0
}
func (y chiniisou) Name() string { return "清一色" }

type ikkitsuukan struct{ baseYaku }

func (y ikkitsuukan) Test(h *HandSet, _ *Rule) int {
	v := 2
	if !TestFlag(h.Flag, Menzen) {
		v--
	}
	c := [5]int{}
	for _, b := range h.Blocks {
		if b.BType != BlockSeq {
			continue
		}
		pi := PType2Int(b.PType)
		if b.Num == 1 {
			c[pi] |= 1
			if c[pi] == 7 {
				return v
			}
		}
		if b.Num == 4 {
			c[pi] |= 2
			if c[pi] == 7 {
				return v
			}
		}
		if b.Num == 7 {
			c[pi] |= 4
			if c[pi] == 7 {
				return v
			}
		}
	}
	return 0
}
func (y ikkitsuukan) Name() string { return "一气通贯" }

// Yakuman yakus

type daisangen struct{ baseYaku }

func (y daisangen) Test(h *HandSet, _ *Rule) int {
	c := 0
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num >= 5 && b.Num <= 7 {
			c++
		}
	}
	if c == 3 {
		return 1
	}
	return 0
}
func (y daisangen) Name() string { return "大三元" }

type suuankou struct{ baseYaku }

func (y suuankou) Test(h *HandSet, _ *Rule) int {
	if !TestFlag(h.Flag, Menzen) {
		return 0
	}
	c := 0
	for _, b := range h.Blocks {
		if b.BType != BlockSeq && !b.IsOpen {
			c++
		}
	}
	if c == 4 && !h.AgariPai.EqualTo(h.Pair.GetPai()[0]) {
		return 1
	}
	return 0
}
func (y suuankou) Name() string { return "四暗刻" }

type suuankouTanki struct{ baseYaku }

func (y suuankouTanki) Test(h *HandSet, rule *Rule) int {
	if !TestFlag(h.Flag, Menzen) {
		return 0
	}
	c := 0
	for _, b := range h.Blocks {
		if b.BType != BlockSeq && !b.IsOpen {
			c++
		}
	}
	if c == 4 && h.AgariPai.EqualTo(h.Pair.GetPai()[0]) {
		if rule.DuoBeiYiMan > 0 {
			return 2
		}
		return 1
	}
	return 0
}
func (y suuankouTanki) Name() string { return "四暗刻单骑" }

type shousuushi struct{ baseYaku }

func (y shousuushi) Test(h *HandSet, _ *Rule) int {
	c := 0
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num >= 1 && b.Num <= 4 {
			c++
		}
	}
	if c == 3 && h.Pair.Type == PaiZ && h.Pair.Num >= 1 && h.Pair.Num <= 4 {
		return 1
	}
	return 0
}
func (y shousuushi) Name() string { return "小四喜" }

type daisuushi struct{ baseYaku }

func (y daisuushi) Test(h *HandSet, rule *Rule) int {
	c := 0
	for _, b := range h.Blocks {
		if b.PType == PaiZ && b.Num >= 1 && b.Num <= 4 {
			c++
		}
	}
	if c == 4 {
		if rule.DuoBeiYiMan > 0 {
			return 2
		}
		return 1
	}
	return 0
}
func (y daisuushi) Name() string { return "大四喜" }

type tsuuiisou struct{ baseYaku }

func (y tsuuiisou) Test(h *HandSet, _ *Rule) int {
	for _, b := range h.Blocks {
		if b.PType != PaiZ {
			return 0
		}
	}
	if h.Pair.Type == PaiZ {
		return 1
	}
	return 0
}
func (y tsuuiisou) Name() string { return "字一色" }

type ryuuiisou struct{ baseYaku }

func (y ryuuiisou) Test(h *HandSet, _ *Rule) int {
	for _, b := range h.Blocks {
		for _, p := range b.GetPai() {
			if !p.IsRyu() {
				return 0
			}
		}
	}
	for _, p := range h.Pair.GetPai() {
		if !p.IsRyu() {
			return 0
		}
	}
	return 1
}
func (y ryuuiisou) Name() string { return "绿一色" }

type chinroutou struct{ baseYaku }

func (y chinroutou) Test(h *HandSet, _ *Rule) int {
	hasZi := false
	for _, b := range h.Blocks {
		if b.BType == BlockSeq || !b.GetPai()[0].IsYao() {
			return 0
		}
		if b.PType == PaiZ {
			hasZi = true
		}
	}
	if h.Pair.Type == PaiZ {
		hasZi = true
	}
	if h.Pair.GetPai()[0].IsYao() && !hasZi {
		return 1
	}
	return 0
}
func (y chinroutou) Name() string { return "清老头" }

type chuurenPoutou struct{ baseYaku }

func (y chuurenPoutou) Test(h *HandSet, rule *Rule) int {
	if !TestFlag(h.Flag, Menzen) {
		return 0
	}
	if new(chiniisou).Test(h, rule) == 0 {
		return 0
	}
	cnt := make([]int, 12)
	need := []int{0, 3, 1, 1, 1, 1, 1, 1, 1, 3}
	for _, b := range h.Blocks {
		if b.BType == BlockQuad {
			return 0
		}
		for _, p := range b.GetPai() {
			cnt[p.Num]++
		}
	}
	for _, p := range h.Pair.GetPai() {
		cnt[p.Num]++
	}
	mulNum := -1
	for i := 1; i <= 9; i++ {
		if cnt[i] < need[i] || cnt[i] > need[i]+1 {
			return 0
		}
		if cnt[i] == need[i]+1 {
			mulNum = i
		}
	}
	if mulNum != h.AgariPai.Num {
		return 1
	}
	return 0
}
func (y chuurenPoutou) Name() string { return "九莲宝灯" }

type junseiChuurenPoutou struct{ baseYaku }

func (y junseiChuurenPoutou) Test(h *HandSet, rule *Rule) int {
	if !TestFlag(h.Flag, Menzen) {
		return 0
	}
	if new(chiniisou).Test(h, rule) == 0 {
		return 0
	}
	cnt := make([]int, 12)
	need := []int{0, 3, 1, 1, 1, 1, 1, 1, 1, 3}
	for _, b := range h.Blocks {
		if b.BType == BlockQuad {
			return 0
		}
		for _, p := range b.GetPai() {
			cnt[p.Num]++
		}
	}
	for _, p := range h.Pair.GetPai() {
		cnt[p.Num]++
	}
	mulNum := -1
	for i := 1; i <= 9; i++ {
		if cnt[i] < need[i] || cnt[i] > need[i]+1 {
			return 0
		}
		if cnt[i] == need[i]+1 {
			mulNum = i
		}
	}
	if mulNum == h.AgariPai.Num {
		if rule.DuoBeiYiMan > 0 {
			return 2
		}
		return 1
	}
	return 0
}
func (y junseiChuurenPoutou) Name() string { return "纯正九莲宝灯" }

type suukantsu struct{ baseYaku }

func (y suukantsu) Test(h *HandSet, _ *Rule) int {
	for _, b := range h.Blocks {
		if b.BType != BlockQuad {
			return 0
		}
	}
	return 1
}
func (y suukantsu) Name() string { return "四杠子" }

type tenhouYaku struct{ baseYaku }

func (y tenhouYaku) Test(h *HandSet, _ *Rule) int {
	if !TestFlag(h.Flag, Menzen) || !TestFlag(h.Flag, Tenhou) {
		return 0
	}
	return 1
}
func (y tenhouYaku) Name() string { return "天和" }

type chiihouYaku struct{ baseYaku }

func (y chiihouYaku) Test(h *HandSet, _ *Rule) int {
	if !TestFlag(h.Flag, Menzen) || !TestFlag(h.Flag, Chiihou) {
		return 0
	}
	return 1
}
func (y chiihouYaku) Name() string { return "地和" }

var (
	yakuChanKan       = newFlagYaku(Chankan, "抢杠", false)
	yakuRinshanKaihou = newFlagYaku(RinshanKaihou, "岭上开花", false)
	yakuHaiteiRaoyue  = newFlagYaku(HaiteiRaoyue, "海底捞月", false)
	yakuHouteiRaoyui  = newFlagYaku(HouteiRaoyui, "河底摸鱼", false)
	yakuRiichi        = newFlagYaku(Riichi, "立直", true)
	yakuDoubleRiichi  = newFlagYaku(DoubleRiichi, "双立直", true)
	yakuIppatsu       = newFlagYaku(Ippatsu, "一发", true)
	yakuDora          = doraYaku{baseYaku{name: "宝牌", isDora: true}}
	yakuUra           = uraYaku{baseYaku{name: "里宝牌", isDora: true}}
	yakuAkaDora       = akaDoraYaku{baseYaku{name: "赤宝牌", isDora: true}}
)

// YAKUMAN_LIST is yakuman evaluators in order.
var YAKUMAN_LIST = []Yaku{
	daisangen{}, suuankou{}, suuankouTanki{}, shousuushi{},
	daisuushi{}, tsuuiisou{}, ryuuiisou{}, chinroutou{},
	chuurenPoutou{}, junseiChuurenPoutou{}, suukantsu{}, tenhouYaku{}, chiihouYaku{},
}

// YAKU_LIST is regular yaku evaluators in order.
var YAKU_LIST = []Yaku{
	menzenTsumo{}, tanYao{},
	newYakuhaiField(1, 1, "场风牌 - 东"),
	newYakuhaiField(1<<1, 2, "场风牌 - 南"),
	newYakuhaiField(1<<2, 3, "场风牌 - 西"),
	newYakuhaiField(1<<3, 4, "场风牌 - 北"),
	newYakuhaiField(1<<4, 1, "自风牌 - 东"),
	newYakuhaiField(1<<5, 2, "自风牌 - 南"),
	newYakuhaiField(1<<6, 3, "自风牌 - 西"),
	newYakuhaiField(1<<7, 4, "自风牌 - 北"),
	yakuhaiHako{}, yakuhaiHatsu{}, yakuhaiCyuu{},
	yakuChanKan, yakuRinshanKaihou, yakuHaiteiRaoyue, yakuHouteiRaoyui,
	yakuRiichi, iipeikou{}, pinfu{}, yakuIppatsu,
	yakuDora, yakuUra, yakuAkaDora,
	toitoi{}, sanankou{}, sanshokuDoukou{}, sankantsu{},
	shousangen{}, honroutou{}, yakuDoubleRiichi,
	sanshokuDoujun{}, ikkitsuukan{}, chantaiyao{},
	honiisou{}, junchantaiyao{}, ryanpeikou{}, chiniisou{},
}
