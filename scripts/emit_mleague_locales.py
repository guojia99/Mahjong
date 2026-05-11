#!/usr/bin/env python3
"""Append Japanese rule body (from ja/m-league.md) to en/m-league.md after English key points.

`zh-Hans/m-league.md` and `zh-Hant/m-league.md` are hand-maintained Chinese full translations — this script does not overwrite them.
"""
from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    ja_path = root / "frontend" / "src" / "rules" / "ja" / "m-league.md"
    ja = ja_path.read_text(encoding="utf-8")
    if "## 第1章" not in ja:
        print("missing ## 第1章 in ja", file=sys.stderr)
        sys.exit(1)
    _, rest = ja.split("## 第1章", 1)
    body = "## 第1章" + rest

    en = """# M.League Rules

The **Key points** below are an English summary. The **rules text** that follows is in **Japanese** (same source text as `docs/MLeague_rule.html`). Always defer to the latest publication on the [M.League official site](https://m-league.jp/about/), official score tables, and chief referee rulings.

## Key points

| Topic | Summary |
|------|---------|
| Match unit | Four players; one **East–South hanchan** per round; first round East, second South. |
| Minimum yaku | At least **1 han** yaku required (“always 1-han minimum”). |
| League-wide +han (*ba-zoro*) | **Always add 2 han** when counting winning hand han. |
| Red dora | **Two** full 136-tile sets; each set has **one red 5m / 5p / 5s**. |
| Mid-hand abortive draws | **None** (no abortive draws such as nine terminals, four riichi, four-wind discards, four open kan). |
| Bankruptcy | Even if a player runs out of points, play continues **until the last scheduled hand** of the hanchan. |
| Exhaustive draw & tenpai | Tenpai declared by **revealing the hand**; order **East → South → West → North**; **3000** tenpai pool; **+300** per honba added to winning points. |
| Riichi | **Furiten riichi** and riichi without a self-draw chance allowed (**cannot riichi after drawing the haitei tile**); after saying “Riichi”, may cancel **before placing the discard sideways** → **empty act** / **no-win rights** for that hand; cannot cancel after discard. |
| Winning | **Only one winner per hand**; simultaneous claims use **atamahane** order from discarder: **next seat → across → previous**. |
| Kan | **At most four kans total** per hand; new dora indicator after kan is confirmed; **no chankan on ankan**; if chankan voids the kan, **no** new dora flip. |
| Starting points & rate | **25,000** each at start; **1000 points = 1 league point**. |
| Placement points | 1st **+50,000**; 2nd **+10,000**; 3rd **−10,000**; 4th **−30,000**; if the hanchan ends in an exhaustive draw, **riichi sticks go to the table leader**; tie splits per Ch.6 Art.2(6). |
| Kiriage mangan | **30 fu, 6 han** is kiriage mangan; see tables for mangan / haneman / baiman / sanbaiman / yakuman. |
| Yakuman stacking | **Stacking different yakuman** is allowed; non-yakuman stacked wins are **capped at sanbaiman**. |
| Penalties | **Chombo / no-win rights / yellow card / red card**; **referee ruling takes precedence**. |
| Pao | **Daisangen / Daisūshii / Sūkantsu**; liability payments per Ch.8. |

---

""" + body

    (root / "frontend" / "src" / "rules" / "en" / "m-league.md").write_text(en, encoding="utf-8")
    print("Updated en/m-league.md (zh-Hans/zh-Hant unchanged)", file=sys.stderr)


if __name__ == "__main__":
    main()
