# "Rising" section: plan (v2, 2026-10-19)

Status: **built 2026-10-19** (`scripts/fetch-rising.mjs` → `data/rising.json`, `risingRows()` in src/lib/data.js, `src/components/RisingList.jsx`). v1 of this plan (2026-10-16) assumed a separate crawl; v2 reuses Trending's data.

Rules added while building (2026-10-19): **at least 5,000 Last.fm listeners** (below it were kids credited on a parent's song, labels, an actress, mismatched Last.fm pages; proposed, for Julian to confirm); **100+ release groups = established** (MusicBrainz's artist lookup caps release groups at 25 in no order, which let Kylie Minogue through; the paged list is used instead); **no releases of their own counts only with a song cosign** (a show-only cosign with 0 releases was a stale Ticketmaster ID); **same-name duplicates merged** (Buddah Bless has two MusicBrainz entries). No per-cosigner cap: the genre caps already spread cosigners out.

## The idea

Rising = **relatively unknown artists who were recently cosigned by big ones** (Julian, 2026-10-16). It's the Cosignr pitch in one list: a star put a newcomer on their song, so the newcomer is worth hearing. Real examples: Drake → Iconic Savvy (7k Last.fm listeners, "True Bestie", May 2026), Kendrick Lamar → Amanda Reifer (20k, "Die Hard"), Calvin Harris → Clementine Douglas (9k, "Blessings"). Strongest case seen so far: Drake → Loe Shimmy (May 2026), whose own album then climbed Apple's album chart (+18 to #75 by 2026-10-18).

Trending (big right now) and Hot Right Now stay as they are.

## Where it goes

**Under Trending Artists, above Hot Right Now.** Home order: Featured → Trending → **Rising** → Hot Right Now → Top. Nav link "Rising". Same row style and genre bar behaviour as Trending.

## Decided (Julian, 2026-10-16 and 2026-10-19)

1. **Cosigners are big artists, not the roster** (the roster is a mockup pick).
2. **Window: cosigns from the last 12 months.**
3. **A newcomer is:** under **150k Last.fm listeners** and **first release within the last ~5 years** (MusicBrainz). Just these two checks. Unknown listeners → excluded (unknown fame is safer than wrong fame).
4. **Old songs with new dates don't count; mashups and medleys don't count.** Already true in the cosign data: each song keeps its earliest date, and the shared rules skip mashups, medleys, remixes/edits/flips, covers and live versions for chart artists.
5. **Genre balance matters** (Julian worried Hip-Hop/Pop would crowd out Indie): see "By genre".

## What's already collected (no new crawl needed)

| Need | Source, already nightly |
|---|---|
| Big cosigners | `data/trending.json` (~120 charting artists, Apple + Last.fm fill per thin genre) + page artists with 1M+ Last.fm listeners (`stats.json`) |
| Their cosigns, with dates and songs | `data/trending-cosigns.json` (chart artists, full history) + `data/cosigns.json` (roster) + `tours.json` / `upcoming.json`, merged by `mergeCosigns()` |
| Newcomer fame (verified by MusicBrainz ID + name) | `stats.json` → `cosigners` (fetch-stats looks up everyone a page artist cosigned) |
| Heat for artists on the Last.fm US chart | `data/charts/` (weekly ÷ all-time × 1000) |

## How it would work

**New script `scripts/fetch-rising.mjs` → `data/rising.json`**, nightly after fetch-stats.

1. **Pool of cosigners:** Trending artists + page artists with ≥ 1M Last.fm listeners.
2. **Candidate cosigns:** merged cosigns where the cosigner is in the pool, the newest song/tour is within 12 months, and the type is a feature, collab or tour (see open question 1).
3. **Newcomer check:** Last.fm listeners < 150k (from `stats.cosigners`; unknown → out). First release ≤ ~5 years ago: earliest release-group date from MusicBrainz (`release-group?artist=<id>`), cached in `data/cache/` (it rarely changes). ~1 request per new candidate.
4. **Genre** (first that exists): Last.fm top tags (fetch-stats already calls artist.getinfo for the fame lookup; it would also save the tags) → MusicBrainz genre → the cosigner's genre. Folded into the 8 groups with `genreGroup()`.
5. **Rank:** for each newcomer, sum over their recent cosigns of `log10(cosigner listeners ÷ newcomer listeners) × recency` (recency 1.0 today → ~0.3 at 12 months). Several big cosigners push a newcomer up; ties: newest cosign first.
6. **Momentum (later):** add the newcomers to the snapshot `watch` list now, so a week from now rows can say "+12% listeners this week" and growth can join the rank.
7. **Save** the top ~60 to `data/rising.json`.

**Pages:** newcomers get light pages through fetch-extended (like Trending artists): photo (Spotify, when MusicBrainz links it), stats, hometown, and their own cosigns.

**Cost:** mostly reuse; ~1 MusicBrainz request per new candidate (first-release date, cached) and ~40–60 new light pages on the first run.

## By genre

Same mechanics as Trending: the genre bar filters Rising; **All** uses a per-genre cap so no genre fills it; **a genre** shows its own Rising list, ranked within the genre. Some genres will have only a few newcomers at first (Country/Latin credits are thin on MusicBrainz): shown honestly, e.g. "Only 2 rising Country artists this year so far."

## On the page

`src/components/RisingList.jsx` (same row layout as Trending), props from `risingRows()` in `src/lib/data.js`. Each row: rank · photo · **newcomer** · genre · "7.2k listeners · first release 2023" · "Cosigned by **Drake** on “True Bestie” (May 2026)" (cosigner chips link to their pages) · Cosign button.

## Answered (Julian, 2026-10-19)

1. **A cosign = feature, collab or tour** by a big artist.
2. **List size like Trending:** All = 20 (max 2 per genre in the top 10, max 3 overall, no ungenred rows); 5 shown, Show More adds 10.
3. **Momentum: start tracking now:** newcomers join the snapshot `watch` list, so "+X% this week" and growth in the rank can follow after a week.
4. **Label: "Rising".**

## Open (for Julian)

1. **Light pages for newcomers:** yes (recommended, consistent with Trending), or link out to MusicBrainz/Spotify?
2. **The 5-year rule** uses MusicBrainz's earliest release, which can be wrong for artists with an old side project under another name. Fine for v1?

## Heat ratio (found 2026-10-19)

Ratio = Last.fm US listeners this week ÷ all-time global listeners × 1000 (both from `data/charts/`). Small artists whose listeners are concentrated in *this week* score high. Top of the US top 200 on 2026-10-18: ADÉLA 50.4, Lucy Bedroque 50.1, underscores 41.0 (Porter Robinson cosign), Cameron Winter 37.6, OsamaSon 36.6, Jane Remover 36.2, Che, Ninajirachi (Porter Robinson cosign), Tiffany Day, nettspend, 2hollis, Bladee. Julian: "really good information, good for the rising section". Limit: only artists in the Last.fm US top 1000, which most newcomers under 150k aren't, so it's a bonus signal, not the main one. Trending already uses it (ratio ≥ 10) to pick its Last.fm fill.

## Useful references

- 2026-10-16 scratch queries: superstars mostly cosign other stars (~45 recent cosigns from the 11 biggest extended artists, only a handful under 150k). The chart pool and roster add more.
- Known traps: Last.fm namesake pages (JENNIE 25 listeners, No I.D. 5k), sample credits ("Out of Time" credits Tomoko Aran), arrangements credited to the original artist (Toby Fox), DJ-set "medley" recordings.
