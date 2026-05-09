# Changelog

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
