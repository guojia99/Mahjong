# Japanese Mahjong Scoring Table

## Quick Scoring Reference

This table shows the scores corresponding to different Han and Fu values. Use the tabs below to switch between Dealer (Oya) and Sub-dealer (Ko) views.

<scoring-quick-table />

## Scoring Formula

### Base Points

```
Base Points = Fu × 2^(Han+2)
```

Example: 40 fu, 3 Han = 40 × 2^5 = 1280

### Payment Methods

| Method | Dealer (Oya) wins | Sub-dealer (Ko) wins |
|--------|-------------------|----------------------|
| **Tsumo** | Each pays Base × 2 | Sub-dealers pay Base each; Dealer pays Base × 2 |
| **Ron** | Discarder pays Base × 6 | Discarder pays Base × 4 |

### Honba Addition

Per honba increment:
- **Dealer Tsumo**: +100 per player
- **Dealer Ron**: +300
- **Sub-dealer Tsumo**: +100 per sub-dealer, +200 for Dealer
- **Sub-dealer Ron**: +300

## Mangan System

When calculated base points reach the following thresholds, fixed values are used:

| Rank | Han Condition | Base Points | Dealer Ron | Dealer Tsumo | Sub-dealer Ron | Sub-dealer Tsumo |
|------|---------------|-------------|------------|--------------|----------------|-------------------|
| **Mangan** | 3 Han 70+ Fu / 4 Han 40+ Fu / 5 Han | 2000 | 12000 | 4000all | 8000 | 2000/4000 |
| **Haneman** | 6-7 Han | 3000 | 18000 | 6000all | 12000 | 3000/6000 |
| **Baiman** | 8-10 Han | 4000 | 24000 | 8000all | 16000 | 4000/8000 |
| **Sanbaiman** | 11-12 Han | 6000 | 36000 | 12000all | 24000 | 6000/12000 |
| **Kazoe Yakuman** | 13+ Han | 8000 | 48000 | 16000all | 32000 | 8000/16000 |

## Yakuman Scores

| Yakuman Type | Base Points | Dealer Ron | Dealer Tsumo | Sub-dealer Ron | Sub-dealer Tsumo |
|--------------|-------------|------------|--------------|----------------|-------------------|
| Yakuman | 8000 | 48000 | 16000all | 32000 | 8000/16000 |
| Double Yakuman | 16000 | 96000 | 32000all | 64000 | 16000/32000 |
| Triple Yakuman | 24000 | 144000 | 48000all | 96000 | 24000/48000 |

## Dora Addition

Each dora tile (including akadora) adds **1 Han**. Dora han is not added to yaku han for determining the Mangan rank; instead, it is calculated separately:

- First calculate the score based on yaku han
- Then multiply by 2^(number of dora)

Example: 30 fu, 2 Han + 2 dora = 30 × 2^4 × 2^2 = 1920

## Riichi Sticks & Honba Sticks

- **Riichi Sticks**: 1000 points each; the winner collects all riichi sticks on the table
- **Honba Sticks**: 300 points per honba (100 per player for dealer Tsumo); retained on the table if the round ends in a draw

### Complete Payment Example

**Scenario**: East Round 1, 1 Honba. There is 1 riichi stick on the table. A sub-dealer wins by Ron with 30 fu, 3 Han.

- Base Points: 30 × 2^5 = 960 → Below Mangan, use actual calculation
- Ron payment: 960 × 4 = 3840
- Honba addition: 3840 + 300 = 4140
- Riichi stick: +1000
- **Final payment by discarder: 5140 points**
