# Japanese Mahjong Rules Overview

## Basic Information

Japanese Mahjong (Riichi Mahjong) is a four-player variant characterized by the "Riichi" declaration system. This page covers the fundamental rules framework; see sub-pages for detailed information.

- **Objective**: The player with the most points at the end of the match wins
- **Starting Points (Kaikyuu genten)**: Each player starts with 25000 or 30000 points (agreed upon by players), 25000 is most common

> **Pro league**: **Key points** plus the full official text **in Japanese** (converted from the repo’s `MLeague_rule.html`) are on [Rules → M.League](/rules?tab=m-league). Score tables and updates: [M.League official site](https://m-league.jp/about/).

## Tile Set

Uses 136 tiles (no flower/season tiles), divided into:

- **Number Tiles (Suupai)**: Man (1m–9m), Pin (1p–9p), Sou (1s–9s), 4 copies each = 108 tiles
- **Honor Tiles (Jihai)**: Wind Tiles (East/South/West/North) + Dragon Tiles (Haku/Hatsu/Chun), 4 copies each = 28 tiles
- **Red Bonus Tiles (Akadora)**: Red Five Man, Red Five Pin, Red Five Sou — 1 copy each, replacing the corresponding regular five

## Match Length

Japanese Mahjong uses "Hanchan" (half-game) as the standard match unit, with the following variants:

| Type | Description |
|------|-------------|
| **Tonpuusen (East-only)** | Only the East round (minimum 4 deals), shorter, quite common |
| **Hanchan (Half-game)** | East round + South round (minimum 8 deals), the most mainstream ruleset |
| **Iichan (Full-game)** | East + South + West + North rounds, common in tournaments |
| **Tohokusen (East-North)** | East round + North round, common in Tohoku and Hokkaido regions |
| **Touousen (Double East)** | Two East rounds, from East 1 to East 8 |

## Players & Seats

- Each deal has one **Dealer (Oya/Parent)** and three **Non-dealers (Ko/Children)**
- Counting from the East seat counter-clockwise: South, West, North
- The player to your left is **Kami-cha** (Upper seat), to your right is **Shimo-cha** (Lower seat), across is **Toimen**
- All other players are collectively called **Tacha**

### Determining the Starting Dealer

1. Place the four wind tiles face-down and shuffle; each player draws one
2. The player who draws East chooses their seat; South, West, North sit counter-clockwise in order
3. The East-seat player rolls two dice, counting counter-clockwise from East to determine the provisional dealer
4. The provisional dealer rolls two dice again, counting counter-clockwise to determine the starting dealer (official dealer)

## Game Flow

### Haipai (Initial Deal)

- After shuffling and building the walls, the dealer draws 14 tiles, non-dealers draw 13 tiles
- Remaining tiles form the **Wall (Yama)**: 17 stacks (34 tiles) per side, with the final 7 stacks as the **Dead Wall (Wanpai)**

### Tsumo & Dahai (Draw & Discard)

- The dealer starts by discarding 1 of their 14 tiles, then play proceeds counter-clockwise
- Each action: **Draw** from the end of the wall → **Discard** one tile to your own discard pond
- After drawing, a player may declare a meld (Furo) or discard

### Ryuukyoku (Draw) & Continuation

- If the wall is exhausted with no winner, the round is a **draw (Ryuukyoku/Exhaustive draw)**
- In a draw, when tenpai and non-tenpai players coexist, **noten penalty** is settled
- The round advances under certain conditions (see dealer rotation rules)

### Dealer Rotation (Renchan & Rotation)

- **Renchan**: When the dealer wins, they retain dealership; honba +1 (e.g., East 1 Deal 1 Honba)
- **Rotation**: When a non-dealer wins, the next player in order becomes the dealer; the deal advances
- **Draw Renchan**: If the dealer is tenpai in a draw, the dealer retains (tenpai renchan rule); some rulesets require only a dealer win for renchan (agari renchan)
- Deal order: East 1 → East 2 → East 3 → East 4 → South 1 → ... → South 4 end

## Winning Conditions

A winning hand must satisfy all of the following:

1. **Valid Hand Shape**: The hand (including melds) forms a valid winning pattern
2. **At least 1 Han**: Possessing at least one valid yaku (han ≥ 1)
3. **Special Restriction**: No yaku means no win (ichihan shibari)

> Winning is **not mandatory** — even when you can win, you may choose not to (by not declaring Tsumo/Ron), and play continues. This is especially important when an opponent has declared Riichi that does not concern you.

## Winning Hand Patterns

### Standard Pattern (4 Mentsu + 1 Jantou)

{{[mahjong] hand:1m2m3m4p5p6p7s8s9s1z1z1z}}

Composed of 4 melds (sequences or triplets) and 1 pair (jantou), totaling 14 tiles.

### Chiitoitsu (Seven Pairs)

{{[mahjong] hand:1m1m2m2m3m3m4p4p5s5s6s6s7z7z}}

7 distinct pairs, totaling 14 tiles. Fixed at 25 fu.

### Kokushi Musou (Thirteen Orphans — Special Pattern)

{{[mahjong] hand:1m9m1p9p1s9s1z2z3z4z5z6z7z}}

One of each of the 13 terminal/honor tiles + any 1 duplicate, totaling 14 tiles.

## Melds (Furo)

### Chi

- Can only take the previous player's (left) discarded tile
- Must form a **sequence** (three consecutive tiles of the same suit)
- After calling Chi, must discard one tile from hand

### Pon

- Can take any player's discarded tile
- Forms a **triplet** (three identical tiles)
- After calling Pon, must discard one tile from hand

### Kan

- **Minkan (Open Kan)**: When you already have a triplet and someone discards the 4th, declare open Kan
- **Ankan (Closed Kan)**: When you have 4 identical tiles in hand, declare closed Kan (retains menzen status)
- **Shouminkan (Added Kan)**: When you already Poned a triplet and draw the 4th tile, you may declare added Kan
- After Kan, draw a replacement tile from the dead wall (rinshan); one additional kan dora indicator is revealed

## Riichi

### Riichi Declaration

- In menzen (closed hand) state with a tenpai hand, you may declare "Riichi"
- Declaring Riichi costs **1000 points** (the riichi stick)
- After Riichi, you cannot change your hand (only discard what you draw, or win by Tsumo)

### Riichi-Related Yaku

| Yaku | Han | Condition |
|------|-----|-----------|
| Riichi | 1 Han | Win after declaring Riichi |
| Double Riichi | 2 Han | Declare Riichi on the very first discard |
| Ippatsu | 1 Han | Win by Tsumo before any meld is called after your Riichi |

## Special Winning Methods

| Yaku | Han | Condition |
|------|-----|-----------|
| Tenhou | Yakuman | Dealer wins on the initial deal |
| Chiihou | Yakuman | Non-dealer wins on the first draw (no melds in first turn) |
| Haitei Raoyue | 1 Han | Win by drawing the very last tile from the wall |
| Houtei Raoyui | 1 Han | Win by Ron on the very last discard |
| Rinshan Kaihou | 1 Han | Win with the replacement tile drawn after Kan |
| Chankan | 1 Han | Ron another player's Shouminkan (Added Kan) tile |
| Renhou | Yakuman | Non-dealer wins by Ron in the first turn after the initial deal (ancient yaku, must be agreed upon beforehand) |

## Scoring System

Japanese Mahjong scoring is determined by both **Han** and **Fu**:

- **Han**: Sum of all valid yaku
- **Fu**: Base points determined by hand composition and winning method
- Scoring formula: Base Points = Fu × 2^(Han+2)

### Mangan System

| Condition | Name | Non-dealer Ron | Dealer Ron | Non-dealer Tsumo (Non-dealer/Dealer) | Dealer Tsumo |
|-----------|------|----------------|------------|---------------------------------------|--------------|
| 3 Han 70 Fu / 4 Han 40 Fu / 5 Han | Mangan | 8000 | 12000 | 2000/4000 | 4000all |
| 6–7 Han | Haneman | 12000 | 18000 | 3000/6000 | 6000all |
| 8–10 Han | Baiman | 16000 | 24000 | 4000/8000 | 8000all |
| 11–12 Han | Sanbaiman | 24000 | 36000 | 6000/12000 | 12000all |
| 13+ Han | Kazoe Yakuman | 32000 | 48000 | 8000/16000 | 16000all |
| Specific patterns | Yakuman | 32000 | 48000 | 8000/16000 | 16000all |
| Specific patterns | Double Yakuman | 64000 | 96000 | 16000/32000 | 32000all |

> Dealer Tsumo: each player pays the same amount (親のツモは各家同額)。

### Score Calculation Formulas

- Base Points = Fu × 2^(Han+2)
- Non-dealer Ron = Base × 4
- Dealer Ron = Base × 6
- Non-dealer Tsumo = Each non-dealer pays Base, dealer pays Base × 2
- Dealer Tsumo = Each player pays Base × 2

## Honba Sticks & Riichi Sticks

- **Honba**: On renchan, honba +1; each honba adds Base × 300 (Ron) or Base × 100 per non-dealer / Base × 200 from dealer (Tsumo)
- **Riichi Sticks**: 1000-point chips placed on the table when declaring Riichi, collected entirely by the round's winner

## Pao (Responsibility Payment)

When a player's meld directly causes another player to inevitably complete a specific yakuman, the melding player bears full responsibility (Pao):

- **Daisangen Pao**: The player who Pons the third dragon type is responsible for Daisangen
- **Daisuushii Pao**: The player who Pons the fourth wind type is responsible for Daisuushii
- **Suukantsu Pao**: The player who Kans the fourth Kan is responsible for Suukantsu
- When Daisangen is completed, the player who Poned the third dragon tile pays the full amount

## Multiple Ron (Atamahane / Double / Triple Ron)

When multiple players Ron the same discard in the same turn:

| Rule | Description |
|------|-------------|
| **Atamahane** (most common) | Only the player closest counter-clockwise to the discarder wins |
| **Double Ron** | Both players win; the discarder pays each separately |
| **Triple Ron** | All three players win, or it is treated as a draw |

## Draw Rules

### Exhaustive Draw (Kouhai)

- The wall is exhausted with no winner
- When tenpai and non-tenpai players coexist, noten penalty is settled

### Noten Penalty

| Tenpai | Noten | Each noten player pays |
|--------|-------|------------------------|
| 1 player | 3 players | 1000 |
| 2 players | 2 players | 1500 |
| 3 players | 1 player | 3000 |
| 4 players | 0 players | No payment |

> Each noten player pays the same amount to each tenpai player, regardless of dealer status.

### Special Draws (中途流局)

| Type | Condition |
|------|-----------|
| **Kyuushu Kyuuhai** | Initial hand contains 9 or more different terminal/honor tiles; may declare a draw; dealer retains dealership |
| **Suu Fuu Renda** | In the first turn, all 4 players discard their own seat wind tile (East discards East, South discards South, etc.); may declare a draw |
| **Suukantsu** | When 4 Kans have been completed in a round (some rulesets do not trigger a draw) |
| **Triple Ron Draw** | When three players win simultaneously in the same turn, the round is treated as a draw |

### Ryuukyoku Mangan

- When a player has declared Riichi and is tenpai at the time of an exhaustive draw, they may collect Mangan points from non-tenpai players
- Whether to use this rule and how to handle it must be agreed upon beforehand

## Game End & Final Settlement

### Hanchan End Conditions

- After South 4, if the dealership rotates (non-dealer wins or dealer is noten in a draw), the Hanchan ends
- **Agari Yame rule**: After South 4, if the dealer wins and is in first place, they may choose whether to continue as dealer

### Hakoten (Fall Below Zero)

- When the Hakoten rule is in effect, if any player's score drops below 0 during the Hanchan, the game ends immediately
- When not in effect, players with negative scores borrow point sticks from other players to continue

### Extensions

| Type | Condition |
|------|-----------|
| **Shaanyuu (West entry)** | At the end of the South round, if no player has reached 30000 (or 33300) points, play enters the West round |
| **Peehuu (North entry)** | After West 4, if the condition is still not met, play enters the North round |
| **Shaanyuu Soku Shuuryou** | The game ends immediately when someone reaches the condition after entering the West round (common in online mahjong) |

### Final Settlement Rules

After the game ends, point adjustments are made based on final standings (must be agreed upon beforehand):

| Rule | Description |
|------|-------------|
| **Uma** | 4th place pays 1st, 3rd pays 2nd (common: +15/-5/+5/-15 or +20/-10/+10/-20) |
| **Oka** | The player in 1st place receives a bonus; the difference is deducted from the sum of starting points and return points |

## Rules to Be Agreed Upon Beforehand

The following rules vary by region and group, and should be clarified before the game begins:

### Ariari / Nashinashi

| Rule | Description |
|------|-------------|
| **Ariari** | Allows Ato-zuke (yaku not yet determined at tenpai) and Kuitan (Tanyao with open melds); mainstream in Kanto |
| **Nashinashi** | Does not allow Ato-zuke or Kuitan (fully determined yaku); traditional in Kansai |

### Other Detail Options

| Item | Options |
|------|---------|
| Double wind pair (Kazoe-jantou) | 2 fu or 4 fu |
| Chiitoitsu | 25 fu 2 han or 50 fu 1 han |
| Rinshan Kaihou / Haitei Raoyue | Whether to add Tsumo +2 fu |
| Tsumo Pinfu | Allowed or not allowed |
| Kazoe Yakuman | Whether to adopt |
| Double Yakuman | Whether to adopt, and which yakuman are double |
| Kuikae (Tile replacement after Chi) | Not allowed / Same-suit swap not allowed / Allowed |
| Nihan shibari (2-han minimum) | Not adopted / Adopted after 4+ Honba (dealer must have 2 confirmed han) |
