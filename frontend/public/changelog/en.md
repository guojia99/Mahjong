# Changelog

## v2.3.3 — 2026-05-27

- Fix league player/stage counts and show registered players on the league page
- Optimize stats APIs with batch queries; fix batch avatar loading and cache
- Add 500 server error panel and global error boundary to prevent blank screens

## v2.3.2 — 2026-05-27

- Fix yakuman list nil-pointer crash; restore online paipu statistics; restore starting hands scoring; fix login token generation

## v2.3.1 — 2026-05-25

- Avatar data removed from list/detail API responses; frontend now loads avatars asynchronously via a dedicated endpoint with 2-hour local cache

## v2.3.0 — 2026-05-25

- Backend rewritten from Python/Django to Go (Gin + GORM); fully API-compatible, no frontend changes required

## v2.2.2 — 2026-05-14

- Starting hands scoring: edge vs middle sequence melds; ryanmen / kanchan taatsu no longer double-count tiles that belong to a full sequence; dora-equivalent count (red fives merged) with milestone bonuses and +8 when any one dora tile appears ≥3 times; yaku-potential tweaks (tanyao ladder, ittsuu by distinct ranks, sanshoku doukou, chinitsu / honitsu caps) plus iipeikou and daisangen potential; rules modal copy updated

## v2.2.1 — 2026-05-14

- Starting Hands: fix pagination always showing the first page of results; server caches the full sorted list for ~20 minutes, then paginates

## v2.2.0 — 2026-05-14

- New "Starting Hands" page under Stats: each seat's initial 13 tiles per round extracted from online paipu, scored by melds / partials / pairs / yakuhai (round, seat, dragons) / red dora / round dora / shanten
- Overall tab: all hands across all players sorted by score with pagination
- Personal tab: per-player hand list (sorted by score), average / max / min score, plus an average-score leaderboard

## v2.1.3 — 2026-05-11

- M.League rules: full official Japanese text matches repo `MLeague_rule.html`; riichi overview keeps key points + link; zh-Hans / zh-Hant / en tabs add localized summaries above the Japanese body

## v2.1.2 — 2026-05-11

- M.League rules tab aligned with the [official page](https://m-league.jp/about/): key points plus Ch.1–9 outline (placement points, baazoro, penalty names, etc.)

## v2.1.1 — 2026-05-11

- League season description: Markdown editor with image upload in admin; public and admin use the same Markdown renderer
- Home page shows ongoing leagues; game list “View details” button uses responsive font size and wrapping

## v2.1.0 — 2026-05-10

- Game list: filter by league vs non-league matches, pagination, and page size
- Fix game list total count not showing the number

## v2.0.0 — 2026-05-09

- League System: complete rewrite with multi-stage competitive tournaments
- League admin split into dedicated pages: Series / Seasons / Season Detail / Players / Stages / Single Stage
- One-click standard template: Swiss → 3-round Double Elimination → Revival → Semifinal → Final
- Strict double-elimination promotion algorithm (winners / losers / revival mechanics)
- All league content (stage configs, order, players) is freely editable while in registration; auto-locked after start
- Reworked registration flow with batch-register and seed labels (A, B, C…)
- Semifinals auto-generate 3 rounds × 2 tables based on seed order
- Fixed cumulative PT recalculation bugs and promotion sync issues
- Public stage page now reflects the new model (promotion badges, live game scores)
- League match entry: admin supports both online and offline match creation
- Online: paste a Mahjong Soul paipu URL — players are auto-matched by UID against the stage roster, no manual selection needed
- Offline: pick 4 stage players to create a match; final scores can be entered inline

## v1.6.2 — 2026-05-09

- Sidebar reorganized into Matches / Rankings / Stats / Tools / Admin groups; groups with sub-items collapse by default
- Desktop sidebar is now pinned to full viewport height and no longer stretches with the main content
- Refined mobile drawer and desktop layout responsiveness

## v1.6.1 — 2026-05-09

- New "Changelog" page presenting each version as its own card
- Available in Simplified Chinese / Traditional Chinese / English / Japanese

## v1.6.0 — 2026-05-06

- New "Riichi Mahjong Rules" page with five tabs: Overview / Glossary / Yaku List / Fu Table / Scoring Table
- Rules page features a collapsible table of contents with inline tile rendering inside the text

## v1.5.3 — 2026-05-05

- Scored games can now switch mode (Hanchan / East-only); PT is recalculated on save
- Hanchan is the default mode in the UI
- Selecting "East-only" for offline games requires a second confirmation; if no East starter is set, the first player defaults to it

## v1.5.2 — 2026-04-29

- Fun ranking now includes per-game riichi rate, deal-in rate, tsumo rate, and win rate

## v1.5.1 — 2026-04-29

- New paipu detail modal for online games: per-hand point flow plus summary stats (riichi, deal-in, tsumo, highest hand, etc.)
- Available only for online games

## v1.5.0 — 2026-04-28

- Full site i18n with Simplified Chinese / Traditional Chinese / English / Japanese (default: Simplified Chinese)
- Added a GitHub link icon in the top bar

## v1.4.4 — 2026-04-27

- Online games now display start / end times
- New admin "Re-fetch all online paipu" action with selection and progress bar

## v1.4.3 — 2026-04-27

- Closed rooms still allow editing / deleting games but block new entries
- Games support individual start / end times; sort priority: game time > room time > created time
- Closed rooms with no games can be deleted

## v1.4.2 — 2026-04-27

- New ladder ranking system with tiers and uma (counts only 4-player Hanchan)
- Tiers / uma are configurable in the admin and trigger a global recompute on change
- Home page shows the tier table and uma configuration

## v1.4.1 — 2026-04-27

- Player detail rank rates now include 4th-place rate, defaulting to 4-player Hanchan
- Rank trend converted to a line chart; new cumulative PT curve
- Recent 10 / 20 / 50 / 100 game windows; stats can be filtered by offline / online

## v1.4.0 — 2026-04-27

- Online games re-introduced: import via Mahjong Soul paipu URL
- Auto-resolve UIDs and prompt one-by-one player binding for unmapped UIDs
- Imported games live in dedicated online rooms

## v1.3.0 — 2026-04-27

- Corrected PT formula: (final score − return point) / 10 + rank uma
- Yakuman list supports type filtering with color-coded backgrounds (Yakuman / Yakuman Confirmed / Yakuman Chance)

## v1.2.0 — 2026-04-27

- Public access to home, player list, rooms, and games
- Only admins can sign in; registration removed; management entries visible only after login
- Room list shows earliest / latest game times

## v1.1.1 — 2026-04-27

- Player detail page now shows personal yakuman list
- Home page adds a "Recent Yakuman" panel and a yakuman tab
- Yakuman supports tsumo / ron flags; a hand may record multiple yaku

## v1.1.0 — 2026-04-27

- Game list adds 3-player / 4-player filters; defaults to 4-player Hanchan
- Introduced PT uma (4-player +30/+10/-10/-30; 3-player +30/0/-30)
- Player statistics charts (rank rates / trend / total PT)
- New PT ranking page and yakuman record entry
- Player avatar uploads supported

## v1.0.0 — 2026-04-10

- Admin login
- Player management (nickname / real name / avatar / Mahjong Soul UID)
- Offline rooms and games with score validation (4-player 1000 / 3-player 1050)
