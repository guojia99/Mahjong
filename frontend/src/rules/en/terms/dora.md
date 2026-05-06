# Dora (Bonus Tiles)

**Category**: Core Rules

Dora is a special mechanism in Japanese Mahjong that increases winning hand scores, acting as an "extra bonus."

## Types of Dora

### Omote Dora (Visible Dora)

- Each round, 1 dora indicator tile is revealed from the dead wall
- The tile following the indicator is the dora. Cycle rules:
  - Number tiles: 1→2→...→9→1 within the same suit
  - Wind tiles: East→South→West→North→East (winds cycle among themselves)
  - Dragon tiles: White→Green→Red→White (dragons cycle among themselves)
- Example: indicator {{[mahjong] hand:4m}} → dora is {{[mahjong] hand:5m}}
- Example: indicator {{[mahjong] hand:9p}} → dora is {{[mahjong] hand:1p}}
- Example: indicator {{[mahjong] hand:4z}} (North) → dora is {{[mahjong] hand:1z}} (East)
- Example: indicator {{[mahjong] hand:7z}} (Red) → dora is {{[mahjong] hand:5z}} (White)

### Ura Dora (Hidden Dora)

- The other tile in the same stack as the omote dora indicator
- **Only revealed when winning by Riichi**
- Follows the same rules as omote dora

### Kan Dora

- Each time a Kan is declared, 1 new kan dora indicator is revealed from the dead wall
- Can stack multiple times (up to 4, corresponding to Suukantsu)

### Kan Ura Dora

- The other tile in the same stack as the kan dora indicator
- **Only revealed when winning by Riichi + Kan**

### Akadora (Red Bonus Tiles)

- Red Five Man ({{[mahjong] hand:5mr}}), Red Five Pin ({{[mahjong] hand:5pr}}), Red Five Sou ({{[mahjong] hand:5sr}}) — 1 copy each
- Always count as dora, regardless of the indicator tiles

## Dora Calculation

- Each dora tile (including akadora) **adds 1 Han** to the score
- Dora han is **not added to yaku han** when determining the Mangan rank
- Dora han is **calculated separately**: Score = Yaku han score × 2^(number of dora)

> **Note**: Dora is **not a yaku** (han). It can only be counted when you already have at least one valid yaku. You cannot win with dora alone.
