package quemi

import (
	"fmt"
	"sort"
)

// Result is calculator output.
type Result struct {
	Han         int
	HanRealYaku int
	Fu          int
	FuMessages  []string
	Point1      int
	Point2      int
	PointType   PointType
	Yaku        []string
	IsYakuman   bool
	ManType     ManType
}

// Calculator decomposes a hand and scores yaku.
type Calculator struct {
	Rule         Rule
	Yakus        []Yaku
	YakumanYakus []Yaku
	pow2         []int
	nowP         []Pai
	nowHandSet   *HandSet
	result       *Result
}

// NewCalculator returns a calculator with default yaku lists.
func NewCalculator() *Calculator {
	c := &Calculator{
		Rule:         DefaultRule(),
		Yakus:        YAKU_LIST,
		YakumanYakus: YAKUMAN_LIST,
		pow2:         []int{1},
	}
	for i := 1; i <= 20; i++ {
		c.pow2 = append(c.pow2, c.pow2[i-1]<<1)
	}
	return c
}

func (c *Calculator) calculateYaku(hand *HandSet, res *Result) {
	res.Yaku = res.Yaku[:0]
	cnt := 0
	hanRealYaku := 0
	for _, yaku := range c.YakumanYakus {
		p := yaku.Test(hand, &c.Rule)
		cnt += p
		if p > 0 {
			res.Yaku = append(res.Yaku, yaku.Name())
			res.IsYakuman = true
		}
	}
	if res.IsYakuman {
		res.Han = cnt
		res.HanRealYaku = cnt
		return
	}
	for _, x := range c.Yakus {
		p := x.Test(hand, &c.Rule)
		cnt += p
		if p > 0 {
			res.Yaku = append(res.Yaku, fmt.Sprintf("%s: %d翻", x.Name(), p))
		}
		if p > 0 && !x.IsDora() {
			hanRealYaku += p
		}
	}
	res.Han = cnt
	res.HanRealYaku = hanRealYaku
}

func (c *Calculator) calculateFu(hand *HandSet, res *Result) {
	if new(pinfu).Test(hand, &c.Rule) == 1 && TestFlag(hand.Flag, Tsumo) {
		res.Fu = 20
		res.FuMessages = append(res.FuMessages, "平和自摸：20符")
		return
	}
	fu := 20
	res.FuMessages = append(res.FuMessages, "底符：20符")
	if TestFlag(hand.Flag, Tsumo) {
		fu += 2
		res.FuMessages = append(res.FuMessages, "自摸 +2符")
	}
	if TestFlag(hand.Flag, Ron|Menzen) {
		fu += 10
		res.FuMessages = append(res.FuMessages, "门前荣和 +10符")
	}
	switch hand.Type {
	case MachiDanQi:
		fu += 2
		res.FuMessages = append(res.FuMessages, "单骑听牌 +2符")
	case MachiKanZhang:
		fu += 2
		res.FuMessages = append(res.FuMessages, "坎张听牌 +2符")
	case MachiBianZhang:
		fu += 2
		res.FuMessages = append(res.FuMessages, "边张听牌 +2符")
	}
	for _, b := range hand.Blocks {
		if b.BType == BlockSeq {
			continue
		}
		bf := 2
		msg := ""
		if b.ConsistYao() {
			bf *= 2
			msg += "幺九"
		} else {
			msg += "中张"
		}
		if !b.IsOpen {
			bf *= 2
			msg += "暗"
		} else {
			msg += "明"
		}
		if b.BType == BlockQuad {
			bf *= 4
			msg += "杠"
		} else {
			msg += "刻"
		}
		fu += bf
		res.FuMessages = append(res.FuMessages, fmt.Sprintf("%s +%d符", msg, bf))
	}
	qf := 0
	if c.Rule.LianFeng4 > 0 {
		qf = hand.Pair.GetPai()[0].IsYakuhai(hand.Flag) * 2
	} else if hand.Pair.GetPai()[0].IsYakuhai(hand.Flag) > 0 {
		qf = 2
	}
	fu += qf
	if qf > 0 {
		res.FuMessages = append(res.FuMessages, fmt.Sprintf("役牌雀头 +%d符", qf))
	}
	if fu == 20 {
		res.Fu = 30
		res.FuMessages = append(res.FuMessages, "吃牌后，合计20符时：30符")
		return
	}
	res.FuMessages = append(res.FuMessages, fmt.Sprintf("共%d符", fu))
	if fu%10 != 0 {
		fu = (fu + 10) / 10 * 10
		res.FuMessages[len(res.FuMessages)-1] += fmt.Sprintf("，切上%d符", fu)
	}
	res.Fu = fu
}

func (c *Calculator) takeBetterResult(nr *Result) {
	if c.result == nil ||
		nr.Point1 > c.result.Point1 ||
		(nr.Point1 == c.result.Point1 && nr.Point2 > c.result.Point2) ||
		(nr.Point1 == c.result.Point1 && nr.Point2 == c.result.Point2 && nr.Han > c.result.Han) {
		cp := *nr
		c.result = &cp
	}
}

func (c *Calculator) calculatePoint(hand *HandSet, res *Result) {
	if !res.IsYakuman && res.HanRealYaku == 0 {
		res.Point1 = 0
		res.Point2 = 0
		res.ManType = ManNomangan
		return
	}
	seatEast := 0
	if !TestFlag(hand.Flag, SeatEast) {
		seatEast = 1
	}
	ron := 0
	if TestFlag(hand.Flag, Ron) {
		ron = 1
	}
	res.PointType = PointType(seatEast<<1 | ron)

	basePoint := 0
	switch {
	case res.IsYakuman:
		basePoint = 8000 * res.Han
	case (res.Han == 3 && res.Fu >= 70) || (res.Han == 4 && res.Fu >= 40) || res.Han == 5:
		res.ManType = ManMangan
		basePoint = 2000
	case res.Han == 6 || res.Han == 7:
		res.ManType = ManHaneman
		basePoint = 3000
	case res.Han >= 8 && res.Han <= 10:
		res.ManType = ManBaiman
		basePoint = 4000
	case (res.Han >= 11 && res.Han <= 12) || (res.Han >= 13 && c.Rule.AllowLeiMan == 0):
		res.ManType = ManSanbaiman
		basePoint = 6000
	case res.Han >= 13 && c.Rule.AllowLeiMan > 0:
		res.ManType = ManKazoeYakuman
		basePoint = 8000
	default:
		res.ManType = ManNomangan
		if res.Han == 0 {
			basePoint = 0
		} else {
			basePoint = res.Fu * c.pow2[res.Han+2]
		}
	}
	switch res.PointType {
	case PointOyaTsumo:
		res.Point1 = 2 * basePoint
	case PointOyaRon:
		res.Point1 = 6 * basePoint
	case PointKoTsumo:
		res.Point1 = basePoint
		res.Point2 = 2 * basePoint
	case PointKoRon:
		res.Point1 = 4 * basePoint
	}
	if res.Point1%100 != 0 {
		res.Point1 = (res.Point1 + 100) / 100 * 100
	}
	if res.Point2%100 != 0 {
		res.Point2 = (res.Point2 + 100) / 100 * 100
	}
}

func (c *Calculator) calculateNormal(dep int) {
	if len(c.nowP) == 0 {
		nr := &Result{}
		c.calculateFu(c.nowHandSet, nr)
		c.calculateYaku(c.nowHandSet, nr)
		c.calculatePoint(c.nowHandSet, nr)
		c.takeBetterResult(nr)
		return
	}
	if dep == 0 {
		for i := 0; i < len(c.nowP)-1; i++ {
			if c.nowP[i].EqualTo(c.nowP[i+1]) {
				a, b := c.nowP[i], c.nowP[i+1]
				savedMachi := c.nowHandSet.Type
				savedP := append([]Pai(nil), c.nowP...)
				if a.IsAgari || b.IsAgari {
					c.nowHandSet.Type = MachiDanQi
				}
				c.nowHandSet.Pair = Pair{Type: a.Type, Num: a.Num}
				c.nowP = append(c.nowP[:i], c.nowP[i+2:]...)
				c.calculateNormal(dep + 1)
				c.nowP = savedP
				c.nowHandSet.Type = savedMachi
			}
		}
		return
	}

	a, b, tileC := c.nowP[0], c.nowP[1], c.nowP[2]
	if a.EqualTo(b) && b.EqualTo(tileC) {
		savedMachi := c.nowHandSet.Type
		savedP := append([]Pai(nil), c.nowP...)
		open := false
		if a.IsAgari || b.IsAgari || tileC.IsAgari {
			c.nowHandSet.Type = MachiShuangPeng
			if TestFlag(c.nowHandSet.Flag, Ron) {
				open = true
			}
		}
		c.nowHandSet.Blocks = append(c.nowHandSet.Blocks, NewBlock(BlockTri, a.Type, a.Num, open))
		c.nowP = c.nowP[3:]
		c.calculateNormal(dep + 1)
		c.nowP = savedP
		c.nowHandSet.Blocks = c.nowHandSet.Blocks[:len(c.nowHandSet.Blocks)-1]
		c.nowHandSet.Type = savedMachi
	}
	if c.nowP[0].Num > 7 || c.nowP[0].Type == PaiZ {
		return
	}
	a2, a3 := a.Next(), a.Next().Next()
	for i := 1; i < len(c.nowP); i++ {
		for j := i + 1; j < len(c.nowP); j++ {
			if c.nowP[i].EqualTo(a2) && c.nowP[j].EqualTo(a3) {
				b2, b3 := c.nowP[i], c.nowP[j]
				savedMachi := c.nowHandSet.Type
				savedP := append([]Pai(nil), c.nowP...)
				c.nowHandSet.Blocks = append(c.nowHandSet.Blocks, NewBlock(BlockSeq, a.Type, a.Num, false))
				if a.IsAgari {
					if a.Num == 7 {
						c.nowHandSet.Type = MachiBianZhang
					} else {
						c.nowHandSet.Type = MachiLiangMian
					}
				} else if b3.IsAgari {
					if b3.Num == 3 {
						c.nowHandSet.Type = MachiBianZhang
					} else {
						c.nowHandSet.Type = MachiLiangMian
					}
				} else if b2.IsAgari {
					c.nowHandSet.Type = MachiKanZhang
				}
				c.nowP = append(append(c.nowP[1:i], c.nowP[i+1:j]...), c.nowP[j+1:]...)
				c.calculateNormal(dep + 1)
				c.nowP = savedP
				c.nowHandSet.Blocks = c.nowHandSet.Blocks[:len(c.nowHandSet.Blocks)-1]
				c.nowHandSet.Type = savedMachi
			}
		}
	}
}

func (c *Calculator) calculateKokushi() {
	cnt := make([]int, 20)
	isAgari := make([]bool, 20)
	for _, p := range c.nowP {
		if !p.IsYao() {
			return
		}
		var x int
		switch p.Type {
		case PaiM:
			x = p.Num
			if x == 9 {
				x = 2
			}
			if p.IsAgari {
				isAgari[7+x] = true
			}
			cnt[7+x]++
		case PaiS:
			x = p.Num
			if x == 9 {
				x = 2
			}
			if p.IsAgari {
				isAgari[9+x] = true
			}
			cnt[9+x]++
		case PaiP:
			x = p.Num
			if x == 9 {
				x = 2
			}
			if p.IsAgari {
				isAgari[11+x] = true
			}
			cnt[11+x]++
		case PaiZ:
			x = p.Num
			if x == 9 {
				x = 2
			}
			if p.IsAgari {
				isAgari[x] = true
			}
			cnt[x]++
		}
	}
	yc := 1
	for i := 1; i <= 13; i++ {
		if cnt[i] == 0 {
			return
		}
		if cnt[i] == 2 && isAgari[i] {
			yc++
		}
	}
	res := &Result{}
	res.Han = yc
	res.HanRealYaku = yc
	res.IsYakuman = true
	if yc == 1 {
		res.Yaku = []string{"国士无双"}
	} else {
		res.Yaku = []string{"国士无双十三面"}
	}
	if TestFlag(c.nowHandSet.Flag, Tenhou) {
		res.Yaku = append(res.Yaku, "天和")
		res.Han++
		res.HanRealYaku++
	}
	if TestFlag(c.nowHandSet.Flag, Chiihou) {
		res.Yaku = append(res.Yaku, "地和")
		res.Han++
		res.HanRealYaku++
	}
	c.calculatePoint(c.nowHandSet, res)
	c.result = res
}

func (c *Calculator) finishChiitoiYakuman(baseHan int, names []string) {
	h := c.nowHandSet
	yk := baseHan
	yn := append([]string(nil), names...)
	if new(tenhouYaku).Test(h, &c.Rule) > 0 {
		yk++
		yn = append(yn, "天和")
	}
	if new(chiihouYaku).Test(h, &c.Rule) > 0 {
		yk++
		yn = append(yn, "地和")
	}
	res := &Result{
		IsYakuman:   true,
		Han:         yk,
		HanRealYaku: yk,
		Yaku:        yn,
	}
	c.calculatePoint(h, res)
	c.takeBetterResult(res)
}

func (c *Calculator) calculateChiitui() {
	if !TestFlag(c.nowHandSet.Flag, Menzen) || len(c.nowP) != 14 {
		return
	}
	for i := 0; i < 7; i++ {
		if !c.nowP[i*2].EqualTo(c.nowP[i*2+1]) {
			return
		}
		if i > 0 && c.nowP[i*2].EqualTo(c.nowP[i*2-1]) {
			return
		}
	}

	allZi := true
	for _, p := range c.nowP {
		if p.Type != PaiZ {
			allZi = false
			break
		}
	}
	if allZi {
		c.finishChiitoiYakuman(1, []string{"字一色"})
		return
	}
	allRyu := true
	for _, p := range c.nowP {
		if !p.IsRyu() {
			allRyu = false
			break
		}
	}
	if allRyu {
		c.finishChiitoiYakuman(1, []string{"绿一色"})
		return
	}

	cnt := 2
	yakuName := []string{"七对子: 2翻"}
	yakuman := 0
	var yakumanName []string

	dora, ura := 0, 0
	akadora := c.nowHandSet.RedCnt
	for _, p := range c.nowP {
		for _, d := range c.nowHandSet.Dora {
			if p.EqualTo(d.Next()) {
				dora++
			}
		}
		for _, d := range c.nowHandSet.Ura {
			if p.EqualTo(d.Next()) {
				ura++
			}
		}
	}
	if dora > 0 {
		yakuName = append(yakuName, fmt.Sprintf("宝牌: %d翻", dora))
	}
	if ura > 0 {
		yakuName = append(yakuName, fmt.Sprintf("里宝牌: %d翻", ura))
	}
	if akadora > 0 {
		yakuName = append(yakuName, fmt.Sprintf("赤宝牌: %d翻", akadora))
	}
	cnt += dora + ura + akadora

	calcFlagYaku := func(yaku Yaku, asYakuman bool) {
		x := yaku.Test(c.nowHandSet, &c.Rule)
		if x <= 0 {
			return
		}
		if !asYakuman {
			cnt += x
			yakuName = append(yakuName, fmt.Sprintf("%s: %d翻", yaku.Name(), x))
		} else {
			yakuman += x
			yakumanName = append(yakumanName, yaku.Name())
		}
	}
	calcFlagYaku(yakuRiichi, false)
	calcFlagYaku(yakuDoubleRiichi, false)
	calcFlagYaku(menzenTsumo{}, false)
	calcFlagYaku(yakuIppatsu, false)
	calcFlagYaku(yakuChanKan, false)
	calcFlagYaku(yakuRinshanKaihou, false)
	calcFlagYaku(yakuHouteiRaoyui, false)
	calcFlagYaku(yakuHaiteiRaoyue, false)
	calcFlagYaku(tenhouYaku{}, true)
	calcFlagYaku(chiihouYaku{}, true)

	allNonYao := true
	for _, p := range c.nowP {
		if p.IsYao() {
			allNonYao = false
			break
		}
	}
	if allNonYao {
		cnt++
		yakuName = append(yakuName, "断幺九: 1翻")
	}
	typeCnt := [4]int{}
	for _, p := range c.nowP {
		typeCnt[PType2Int(p.Type)] = 1
	}
	if typeCnt[0]+typeCnt[1]+typeCnt[2] == 1 && typeCnt[3] == 1 {
		cnt += 3
		yakuName = append(yakuName, "混一色: 3翻")
	}
	if typeCnt[0]+typeCnt[1]+typeCnt[2] == 1 && typeCnt[3] == 0 {
		cnt += 6
		yakuName = append(yakuName, "清一色: 6翻")
	}
	allYao := true
	for _, p := range c.nowP {
		if !p.IsYao() {
			allYao = false
			break
		}
	}
	if allYao {
		cnt++
		yakuName = append(yakuName, "混老头: 2翻")
	}

	res := &Result{}
	if yakuman > 0 {
		res.Han = yakuman
		res.HanRealYaku = yakuman
		res.Yaku = yakumanName
		res.IsYakuman = true
	} else {
		res.Han = cnt
		res.HanRealYaku = cnt - dora - ura - akadora
		res.Fu = 25
		res.Yaku = yakuName
	}
	c.calculatePoint(c.nowHandSet, res)
	if !res.IsYakuman {
		res.FuMessages = append(res.FuMessages, "七对子：25符")
	}
	c.takeBetterResult(res)
}

// Calculate scores the given state and returns the best decomposition.
func (c *Calculator) Calculate(state State) Result {
	c.Rule = DefaultRule()
	c.nowHandSet = &HandSet{
		Blocks:   nil,
		Pair:     Pair{Type: PaiM, Num: 1},
		Dora:     state.Dora,
		Ura:      state.Ura,
		Type:     MachiBianZhang,
		Flag:     state.Flag,
		AgariPai: state.AgariPai,
		RedCnt:   state.RedCnt,
	}
	c.result = &Result{}
	c.nowP = append(append([]Pai(nil), state.Pais...), state.AgariPai)
	sort.Slice(c.nowP, func(i, j int) bool {
		return ComparePai(c.nowP[i], c.nowP[j]) < 0
	})
	for _, b := range state.Furu {
		c.nowHandSet.Blocks = append(c.nowHandSet.Blocks, b)
	}
	c.calculateKokushi()
	c.calculateChiitui()
	c.calculateNormal(0)
	return *c.result
}
