# Trending from real current data: plan (draft, 2026-10-19)

Status: **plan only, not built.** Check in before starting (see CLAUDE.md / memory).

## Why

Trending today is hand-picked (the 6 in `trending`, plus 5 `genrePicks` per genre) and sorted by **career totals** (all-time Last.fm listeners/plays, Deezer followers). So it shows who is biggest overall, not what's happening now: Eminem ranks high in Hip-Hop with a score of 86 while he's #102 on the Last.fm US weekly chart and absent from Apple's top 100. Julian (2026-10-19): Trending should show **what's big right now, from real data**; anyone charting can be in it; climbing/momentum belongs to Rising (maybe merged later).

## Decided (Julian, 2026-10-19)

1. **Apple Music is the main source** (US most-played top 100 songs + top 100 albums, daily). It "seems way more real". Old songs still on the chart count (Trending = big now; they're noise only for climbing).
2. **Anyone charting is in the pool**, not just artists with a page. Charting artists get light pages built from real data; a few cosigns is fine for the demo.
3. **Last.fm fills thin genres.** Apple's chart has almost no Rock/Indie/Electronic (2026-10-18: Rock 1 artist, Indie 4, Electronic 0). For genres where Apple has fewer than ~5 artists, Trending adds artists from the Last.fm US weekly chart.
4. **Heat filter for Last.fm artists: ratio ≥ 10.** Ratio = US listeners this week (Last.fm `geo.getTopArtists`, 7-day window) ÷ all-time global listeners (Last.fm `chart.getTopArtists`, or artist.getInfo) × 1000. It keeps legacy catalog acts out: Radiohead 7.8, The Smiths 7.6, Coldplay/Queen/Eminem 2.8 are out; Deftones 11.4, Tame Impala 10.0, beabadoobee 15.4, Malcolm Todd 23.8 are in. (US-only site, so artists big abroad but not in the US look "cold": acceptable.)
5. **"All" caps each genre at 2** in the top 10, so Hip-Hop and Country don't fill it. 2026-10-18 example, max 2 per genre: Drake, Morgan Wallen, Zach Bryan, Future, Olivia Rodrigo, Taylor Swift, SZA, KAROL G, Jhené Aiko, Bad Bunny.
6. **Hot Right Now stays as it is.**
7. **Save the 12-artist demo first:** git tag on the current commit (`demo-12-artists`) and move the hand-picked `trending`, `genrePicks` and `curated` lists into a `demo` block, so a demo page can be rebuilt later. Featured and Top stay hand-picked for now (Top's label is a separate issue, see PROGRESS).

## How it would work

**New script `scripts/fetch-trending.mjs` → `data/trending.json`**, nightly right after fetch-charts. Run order becomes: charts → **trending** → **recent-cosigns** → cosigns → tours → extended → sources → upcoming → profiles → stats.

1. **Apple pool.** Every *lead* artist (first credited; the only one Apple gives an ID for) across the newest chart's songs + albums (~90 artists on 2026-10-18). Featured artists count only when they have a page and a known cosign with the lead (the Hot Right Now rule).
   - **Points:** each entry earns `101 − rank`, summed over the artist's songs and albums (rewards a big hit and depth: Drake 14 songs + 11 albums = 1437, Zach Bryan 772, Olivia Rodrigo 394).
   - **Genre:** the artist's most common Apple tag across their entries, folded with `genreGroup()`.
2. **Last.fm fill.** For each genre with fewer than ~5 Apple artists: Last.fm US chart artists (top 1000) with ratio ≥ 10, genre from Last.fm top tags (by MusicBrainz ID) → `genreGroup()`. Verify the MusicBrainz ID first like fetch-stats.mjs (page name must match; namesakes merge on Last.fm). Tags are noisy (The Weeknd came out Electronic, Travis Scott "Other"): an artist with a page keeps our genre.
3. **Comparable ranking.** Apple points and Last.fm listeners aren't on one scale, so each source is turned into 0–100 by **percentile within its own qualifying list**, and lists merge on that. Genre views rank by it; All takes the top 10 with max 2 per genre.
4. **Artist IDs (Apple → MusicBrainz).** profiles.json already maps page artists' Apple IDs. For new ones: MusicBrainz URL lookup (`url?resource=https://music.apple.com/us/artist/<id>&inc=artist-rels`, also the `itunes.apple.com` form), then Wikidata (`haswbstatement:P2850=<id>`). Cached in `data/cache/apple-mbid.json`. **Unresolved artists** still appear, name only, with their top entry's Apple cover art linking to Apple Music (an approved image use), no page link.
5. **Pages.** fetch-extended.mjs adds the Trending pool (like the top cosigners), so the other scripts give them photo, stats, hometown, upcoming shows.

## Recent cosigns (last 12 months) for the Trending pool

**New script `scripts/fetch-recent-cosigns.mjs` → `data/recent-cosigns.json`** (same shape as cosigns.json: `{from, to, types, songs, vouches, first, last, evidence}` + `artists`), run nightly after fetch-trending. `mergeCosigns()` (src/lib/cosigns.js) takes it as one more input, so chips, artist page lists and Hot Right Now markers all pick it up.

- **Who:** every Trending artist with a MusicBrainz ID (~90 Apple + up to 60 Last.fm ≈ 150). Roster artists are skipped (fetch-cosigns already has their full history).
- **Query:** MusicBrainz recording search `arid:<id> AND firstreleasedate:[<12 months ago> TO *] AND status:official`, paged at 100 (~1–3 requests per artist, ~5–8 min a night at 1 req/s). One query finds both directions: songs they lead (they cosign the featured artists) and songs they're featured on (the lead cosigns them).
- **Same rules as fetch-cosigns.mjs:** "A feat. B" → A cosigns B; "A & B" → both ways; only Official releases; no DJ-mix segments, mashups or medleys (titles joining songs with " / "); no band ↔ own member; nothing released after the cosigner died or split.
- **Reissues don't count:** skip a recording if the lead artist has an earlier recording with the same normalized title (Die With a Smile, SexyBack, Shallow, Timeless all showed up re-dated). Cached per (artist, title) in `data/cache/`.
- **Remixes left out in v1** (most "flips"/"edits" are fan uploads); tours/band come only from fetch-tours.mjs as today.
- Also gives RISING.md most of its input (big artists' recent cosigns).

## On the page

- Same section and row layout; rank within the current view; genre bar keeps working.
- **Row stats change from all-time to now:**
  - Apple: "14 songs · 11 albums in Apple's US top 100 · best #3"
  - Last.fm: "50k US listeners this week · Last.fm"
  - A small source tag on each row (Apple Music / Last.fm).
- The sort tabs (Score / Listeners / Plays / Fans) go; career numbers stay on artist pages and in Top, labelled all-time.
- Subtitle: "What the US is playing right now. Apple Music today, Last.fm this week."

## Answered (Julian, 2026-10-19)

1. **Sort tabs: yes, for now** ("All sources / Apple Music / Last.fm"); may be removed later.
2. **Pages for artists who drop off the chart: keep them** for now.
3. **Thin genre = fewer than 5 Apple artists; each thin genre gets up to 20 Last.fm artists** (ratio ≥ 10).
4. **Cosigns for every Trending artist from the last 12 months** (see "Recent cosigns" above), so rows don't say "No cosigns found yet". Today cosigns only exist for pairs involving the 12 roster artists, because only their catalogs are crawled.

No open questions left; waiting for Julian's go.

## Notes from the 2026-10-18/19 analysis

- Apple top 100 songs by genre: Hip-Hop 44, Country 29, R&B 12, Pop 10, Latin 3, Rock 1, Alternative 1. Albums: Hip-Hop 43, Pop 21, R&B 10, Latin 8, Country 7, Alternative 5, other 6.
- Last.fm US top 150 by tags is the mirror image: Pop 35, Hip-Hop 33, Indie 32, Rock 31, R&B 8, Electronic 6, Country 1, Latin 1. Much of it is catalog listening (The Beatles, Nirvana, Fleetwood Mac): hence the ratio filter.
- The Last.fm US chart looks **weekly** (identical 2026-10-16 and 17, changed 2026-10-18, a Sunday); Apple changes daily. Confirm with another week.
