# Japanese Mahjong Fu Table

## Fu Basics

Fu (ふ) is the base point unit used when winning a hand in Japanese Mahjong, combined with han to determine the final score.

## Fu Calculation Rules

### Base Fu

The base fu when winning is **20 fu**.

### Jantou (Pair) Fu

| Pair Type | Fu |
|-----------|-----|
| Non-yaku pair | +0 fu |
| Seat Wind pair | +2 fu |
| Prevailing Wind pair | +2 fu |
| Dragon pair (Haku/Hatsu/Chun) | +2 fu |
| **Double Wind pair** (Seat Wind = Prevailing Wind) | +4 fu (some rulesets: +2 fu) |

### Mentsu (Meld) Fu

| Meld Type | Open Triplet (Melded) | Concealed Triplet | Open Kan | Concealed Kan |
|-----------|----------------------|-------------------|----------|---------------|
| Terminal/Honor tiles | +4 fu | +8 fu | +16 fu | +32 fu |
| Simple tiles (2-8) | +2 fu | +4 fu | +8 fu | +16 fu |

### Sequence

Sequences add **zero fu** (+0 fu), whether open or concealed.

### Winning Method Fu

| Winning Method | Fu |
|----------------|-----|
| Ron | +10 fu |
| Tsumo | +2 fu |
| Pinfu Tsumo | +0 fu (no +2 fu for Tsumo when the hand is Pinfu) |
| Penchan wait (waiting on 1-2 or 8-9 edges) | +2 fu |
| Kanchan wait (waiting on a middle tile) | +2 fu |
| Tanki wait (waiting for the pair) | +2 fu |

> **Note**: A Pinfu hand winning by Ron on a ryanmen wait is always fixed at 30 fu (base 20 + Ron 10).

### Chiitoitsu (Seven Pairs)

Chiitoitsu has a **fixed fu of 25**, not calculated by the above rules.

## Fu Calculation Examples

### Example 1: Basic Hand (30 fu)

{{[mahjong] hand:2m3m4m5p6p7p8s9s1s2s3s4s}}

- Base fu: 20
- Sequence ×4: 0
- Pair (non-yaku): 0
- Ryanmen wait: 0
- Ron: +10
- **Total: 30 fu**

### Example 2: With Concealed Triplets (50 fu)

{{[mahjong] hand:3m3m3m5p6p7p8s8s9s9s1z1z2z}}

- Base fu: 20
- Simple concealed triplet 3m: +4
- Sequence 5p6p7p: 0
- Simple concealed triplet 8s: +4
- Terminal concealed triplet 9s: +8
- Sequence 1s2s3s: 0
- Pair 1z: +2 (seat wind or prevailing wind)
- Kanchan wait on 2z: +2
- Tsumo: +2
- **Total: 42 → rounded up to 50 fu**

### Example 3: With Honor Tile Concealed Triplet (70 fu)

{{[mahjong] hand:7z7z7z3m4m5m1p1p1p2s3s4s5z5z6z}}

- Base fu: 20
- Dragon concealed triplet 7z: +8
- Sequence 3m4m5m: 0
- Simple concealed triplet 1p: +4
- Sequence 2s3s4s: 0
- Pair 5z: +0
- Ryanmen wait on 6z: 0
- Ron: +10
- **Total: 42 → rounded up to 50 fu**

## Fu Rounding (Kiriage)

When the fu total is not a multiple of 10, it is **rounded up to the nearest 10**:

- 20 → 20
- 21-30 → 30
- 31-40 → 40
- 41-50 → 50
- 51-60 → 60
- 61-70 → 70
- 71-80 → 80
- 81-90 → 90
- 91-100 → 100
- 101-110 → 110

## Fu Summary Table

| Fu | Description |
|----|-------------|
| 20 | Base value (Chiitoitsu is 25) |
| 25 | Chiitoitsu exclusive |
| 30 | Most common fu value (base Ron) |
| 40 | With simple open/concealed triplets |
| 50 | With concealed triplets + special waits |
| 60 | With multiple concealed triplets |
| 70 | With honor tile triplets + other fu additions |
| 80 | With concealed Kans |
| 90+ | Extreme cases (multiple concealed Kans + honor tiles) |
| 100-110 | Theoretical maximum |

## Fu and Base Points

Base Points = Fu × 2^(Han+2)

Example: 30 fu, 3 Han = 30 × 2^5 = 960

When base points exceed 2000, the Mangan system applies (see Scoring Table).
