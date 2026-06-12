package quemi

import "strings"

const (
	NOMI             = 0
	FieldEast        = 1 << 0
	FieldSouth       = 1 << 1
	FieldWest        = 1 << 2
	FieldNorth       = 1 << 3
	SeatEast         = 1 << 4
	SeatSouth        = 1 << 5
	SeatWest         = 1 << 6
	SeatNorth        = 1 << 7
	HaiteiRaoyue     = 1 << 8
	HouteiRaoyui     = 1 << 9
	Tenhou           = 1 << 10
	Chiihou          = 1 << 11
	RinshanKaihou    = 1 << 12
	Chankan          = 1 << 13
	Riichi           = 1 << 14
	DoubleRiichi     = 1 << 15
	Ippatsu          = 1 << 16
	Tsumo            = 1 << 17
	Ron              = 1 << 18
	Menzen           = 1 << 19
)

// BlockType is sequence, triplet, or quad.
type BlockType int

const (
	BlockSeq BlockType = iota
	BlockTri
	BlockQuad
)

// PositionType is wind position.
type PositionType int

const (
	PositionEast PositionType = iota
	PositionSouth
	PositionWest
	PositionNorth
	PositionEmpty
)

// MachiType is wait shape.
type MachiType int

const (
	MachiLiangMian MachiType = iota
	MachiKanZhang
	MachiBianZhang
	MachiShuangPeng
	MachiDanQi
)

// PointType encodes dealer / tsumo-ron point category.
type PointType int

const (
	PointOyaTsumo PointType = 0
	PointOyaRon   PointType = 1
	PointKoTsumo  PointType = 2
	PointKoRon    PointType = 3
)

// ManType is mangan tier.
type ManType int

const (
	ManNomangan ManType = iota
	ManMangan
	ManHaneman
	ManBaiman
	ManSanbaiman
	ManKazoeYakuman
)

// PaiType is suit letter.
type PaiType string

const (
	PaiM PaiType = "m"
	PaiS PaiType = "s"
	PaiP PaiType = "p"
	PaiZ PaiType = "z"
)

// Pai is a single tile.
type Pai struct {
	Type    PaiType
	Num     int
	IsAgari bool
	RedCnt  int
}

func (p Pai) String() string {
	return string(p.Type) + string(rune('0'+p.Num))
}

func (p Pai) IsYao() bool {
	if p.Type == PaiZ {
		return true
	}
	return p.Num == 1 || p.Num == 9
}

func (p Pai) IsRyu() bool {
	if p.Type == PaiZ && p.Num == 6 {
		return true
	}
	if p.Type == PaiS {
		switch p.Num {
		case 2, 3, 4, 6, 8:
			return true
		}
	}
	return false
}

func (p Pai) IsYakuhai(flag int) int {
	if p.Type != PaiZ {
		return 0
	}
	cnt := 0
	switch p.Num {
	case 1:
		if TestFlag(flag, FieldEast) {
			cnt++
		}
		if TestFlag(flag, SeatEast) {
			cnt++
		}
	case 2:
		if TestFlag(flag, FieldSouth) {
			cnt++
		}
		if TestFlag(flag, SeatSouth) {
			cnt++
		}
	case 3:
		if TestFlag(flag, FieldWest) {
			cnt++
		}
		if TestFlag(flag, SeatWest) {
			cnt++
		}
	case 4:
		if TestFlag(flag, FieldNorth) {
			cnt++
		}
		if TestFlag(flag, SeatNorth) {
			cnt++
		}
	case 5, 6, 7:
		cnt++
	}
	return cnt
}

func (p Pai) Next() Pai {
	b := Pai{Type: p.Type, Num: p.Num + 1}
	if b.Type == PaiZ {
		if b.Num == 5 {
			b.Num = 1
		}
		if b.Num == 8 {
			b.Num = 5
		}
	} else if b.Num == 10 {
		b.Num = 1
	}
	return b
}

func (p Pai) EqualTo(other Pai) bool {
	return p.Type == other.Type && p.Num == other.Num
}

// ComparePai sorts by suit, number, then red count.
func ComparePai(a, b Pai) int {
	tc := strings.Compare(string(a.Type), string(b.Type))
	if tc != 0 {
		return tc
	}
	if a.Num != b.Num {
		return a.Num - b.Num
	}
	return a.RedCnt - b.RedCnt
}

// Block is a meld group.
type Block struct {
	BType  BlockType
	PType  PaiType
	Num    int
	IsOpen bool
	RedCnt int
}

func NewBlock(bType BlockType, pType PaiType, num int, isOpen bool) Block {
	return Block{BType: bType, PType: pType, Num: num, IsOpen: isOpen}
}

func (b Block) ConsistYao() bool {
	if b.PType == PaiZ {
		return true
	}
	if b.BType == BlockSeq {
		return b.Num == 1 || b.Num == 7
	}
	return b.Num == 1 || b.Num == 9
}

func (b Block) ConsistYakuhai(flag int) int {
	if b.PType != PaiZ {
		return 0
	}
	cnt := 0
	switch b.Num {
	case 1:
		if TestFlag(flag, FieldEast) {
			cnt++
		}
		if TestFlag(flag, SeatEast) {
			cnt++
		}
	case 2:
		if TestFlag(flag, FieldSouth) {
			cnt++
		}
		if TestFlag(flag, SeatSouth) {
			cnt++
		}
	case 3:
		if TestFlag(flag, FieldWest) {
			cnt++
		}
		if TestFlag(flag, SeatWest) {
			cnt++
		}
	case 4:
		if TestFlag(flag, FieldNorth) {
			cnt++
		}
		if TestFlag(flag, SeatNorth) {
			cnt++
		}
	case 5, 6, 7:
		cnt++
	}
	return cnt
}

func (b Block) GetPai() []Pai {
	var rt []Pai
	switch b.BType {
	case BlockSeq:
		for i := b.Num; i < b.Num+3; i++ {
			rt = append(rt, Pai{Type: b.PType, Num: i})
		}
	case BlockTri:
		for i := 0; i < 3; i++ {
			rt = append(rt, Pai{Type: b.PType, Num: b.Num})
		}
	case BlockQuad:
		for i := 0; i < 4; i++ {
			rt = append(rt, Pai{Type: b.PType, Num: b.Num})
		}
	}
	return rt
}

func (b Block) EqualTo(other Block) bool {
	return b.BType == other.BType && b.PType == other.PType && b.Num == other.Num
}

// Pair is the pair in a winning hand.
type Pair struct {
	Type PaiType
	Num  int
}

func (p Pair) GetPai() []Pai {
	return []Pai{{Type: p.Type, Num: p.Num}, {Type: p.Type, Num: p.Num}}
}

func (p Pair) ConsistYao() bool {
	return p.GetPai()[0].IsYao()
}

// HandSet is a decomposed winning shape.
type HandSet struct {
	Blocks   []Block
	Pair     Pair
	Dora     []Pai
	Ura      []Pai
	Type     MachiType
	Flag     int
	AgariPai Pai
	RedCnt   int
}

// State is calculator input.
type State struct {
	Flag     int
	Furu     []Block
	Pais     []Pai
	Dora     []Pai
	Ura      []Pai
	AgariPai Pai
	RedCnt   int
}

// NewState builds State from winds, hand, melds, and dora.
func NewState(field, seat PositionType, yakus []int, agariWay int,
	pais []Pai, furu []Block, d, u []Pai, agariPai Pai, redCnt int) State {
	flag := 0
	if field != PositionEmpty {
		flag |= 1 << field
	}
	if seat != PositionEmpty {
		flag |= 1 << (seat + 4)
	}
	for _, y := range yakus {
		flag |= y
	}
	flag |= agariWay

	menzen := true
	for _, b := range furu {
		if b.IsOpen {
			menzen = false
			break
		}
	}
	if menzen {
		flag |= Menzen
	} else {
		flag &^= Riichi | DoubleRiichi | Ippatsu
	}

	agariPai.IsAgari = true
	return State{
		Flag:     flag,
		Furu:     furu,
		Pais:     pais,
		Dora:     d,
		Ura:      u,
		AgariPai: agariPai,
		RedCnt:   redCnt,
	}
}

// TestFlag returns true if all bits in value are set in flag.
func TestFlag(flag, value int) bool {
	return flag&value == value
}

// PType2Int maps suit to 0=s, 1=p, 2=m, 3=z.
func PType2Int(pType PaiType) int {
	switch pType {
	case PaiS:
		return 0
	case PaiP:
		return 1
	case PaiM:
		return 2
	case PaiZ:
		return 3
	default:
		return -1
	}
}
