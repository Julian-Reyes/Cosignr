# "Rising" section: plan (draft, 2026-10-16)

Status: **plan only, not built.** Julian is still deciding how far to take this (Cosignr is a demo, and this is the first feature that reaches beyond the 12 hand-picked roster artists). Check in before starting (see CLAUDE.md / memory).

## The idea

Rising = **relatively unknown artists who were recently cosigned by big ones** (Julian, 2026-10-16). It's the Cosignr pitch in one list: a superstar put a newcomer on their song, so the newcomer is worth hearing. Example rows from real data on 2026-10-16: Drake → Iconic Savvy (7k Last.fm listeners, "True Bestie", May 2026), Kendrick Lamar → Amanda Reifer (20k, "Die Hard", Jul 2026), Calvin Harris → Clementine Douglas (9k, "Blessings", Dec 2025).

Trending stays as it is. The listener-growth "rising" from `data/snapshots/` (PROGRESS item 1) can be combined later ("+40% since Drake's cosign") or offered as a filter.

## Where it goes

**Under Trending Artists, above Hot Right Now.** Home order: Featured → Trending → **Rising** → Hot Right Now → Top. Nav link "Rising". **Top 5 shown, Show More adds 10** (max 15), same component pattern as HotList.

## Decided (Julian, 2026-10-16)

1. **Cosigners are big artists, not the roster.** The roster is a mockup pick, so roster membership doesn't matter. Pool:
   - every page artist (roster + extended) with **1M+ Last.fm listeners**, plus
   - the **top of the Last.fm US chart and the Apple Music US song chart** (`data/charts/`), so stars without a page (Olivia Rodrigo, SZA…) count. Grows over time.
2. **Window: cosigns from the last 12 months.**
3. **A newcomer is:** under **150k Last.fm listeners** and **first release within the last ~5 years** (MusicBrainz). Julian chose just these two checks (a Wikipedia-article count was considered and not taken). Unknown listeners → excluded (unknown fame is safer than wrong fame).
4. **Old songs with new dates don't count:** reissues, live versions, re-recordings, compilations (Die With a Smile, SexyBack, Shallow, Timeless all showed up as 2025–26 recordings).
5. **Mashups and medleys don't count** (titles joining songs with " / ", DJ-mix segments, the existing fetch-cosigns rules).
6. Superstar-to-superstar cosigns are filtered out by the 150k rule.

## How it would work

**New script `scripts/fetch-rising.mjs` → `data/rising.json`**, nightly in site.yml (after fetch-charts and fetch-stats).

1. **Build the cosigner pool.**
   - Page artists: from stats.json (Last.fm listeners ≥ 1M, respecting `excluded`).
   - Last.fm US chart: MusicBrainz IDs are unverified, so verify each one like fetch-stats.mjs does (page name and ID must match), and skip anything that fails.
   - Apple chart: Apple artist ID → MusicBrainz via a URL lookup (`url?resource=https://music.apple.com/us/artist/<id>&inc=artist-rels`). Match by ID only; Apple gives the first credited artist only.
2. **Recent songs per cosigner:** MusicBrainz recording search `arid:<id> AND firstreleasedate:[<12 months ago> TO *] AND status:official`, paged at 100. The cosigner must be the **first credited artist** (their own song); everyone else in the credit becomes a candidate (`feat.`/`with` → feature, `&`/`,`/`x` → collab).
3. **Drop non-cosigns:** titles with " / " and remix/mix/edit/flip/live/sped up/slowed/instrumental/visualizer/version/demo; DJ-mix and mashup releases.
4. **Reissue check:** if the cosigner has an earlier recording with the same normalized title (search `arid:<id> AND recording:"<title>" AND firstreleasedate:[* TO <window start>]`), skip it. Cached per (cosigner, title) in `data/cache/`.
5. **Newcomer check per candidate:**
   - Last.fm listeners by MusicBrainz ID, trusted only if the page name matches (the JENNIE / "Ye" lessons). < 150k, else drop.
   - First release: earliest release-group date from MusicBrainz. Older than ~5 years → drop. Cached in `data/cache/` (it rarely changes).
6. **Rank:** for each newcomer, sum over their cosigns of `log10(cosigner listeners / newcomer listeners) × recency` (recency falls from 1 today to ~0.3 at 12 months). Several big cosigners push a newcomer up. Ties: newest cosign first.
7. **Save** the top ~50 to `data/rising.json`: newcomer (name, MusicBrainz ID, listeners, first release year, Spotify ID if MusicBrainz links one), and their cosigns (cosigner name/ID/listeners, song title, date, type, MusicBrainz recording URL).

**Cost:** MusicBrainz is 1 request/second. Roughly 100–200 cosigners × 1–2 requests, plus ~3 requests per candidate (reissue, first release; Last.fm separately) ≈ 10–15 min on the first run, a few minutes after caching. Acceptable inside the nightly job (cosigns already takes ~7 min).

## Heat ratio: a day-one rising signal (found 2026-10-19)

Ratio = Last.fm US listeners this week ÷ all-time global listeners × 1000 (both from `data/charts/`). Small artists whose listeners are concentrated in *this week* score high, so it works without weeks of history. Top of the US top 200 on 2026-10-18: ADÉLA 50.4, Lucy Bedroque 50.1, underscores 41.0 (Porter Robinson cosign), Cameron Winter 37.6, OsamaSon 36.6, Jane Remover 36.2, Che, Ninajirachi (Porter Robinson cosign), Tiffany Day, nettspend, 2hollis, Bladee. Legacy acts sit at the bottom (Coldplay, Queen, Eminem 2.8). Julian: "really good information, good for the rising section". Candidate ingredient next to "cosigned by a big artist". Limits: only artists in both Last.fm top-1000 charts (others need artist.getInfo); refreshes weekly; US ÷ global undercounts artists big abroad.

## By genre (discussed 2026-10-16, not decided)

Julian's worry: Hip-Hop and Pop crowding out Indie and others. Plugs into the existing genre bar like Trending does: **All** = mixed list with a genre quota (e.g. at most 2 per genre in the top 5, or round-robin); **a genre** = that genre's own Rising list, ranked within the genre.

- **Newcomer genre**, first that exists: Last.fm top tags by MusicBrainz ID (best coverage for small artists) → MusicBrainz genre → Apple tag if charting → the cosigner's genre (most cosigns stay within a genre). Folded into the 8 groups with `genreGroup()`.
- **Pool bias:** the Apple chart is mostly Hip-Hop/Country, the Last.fm chart leans indie/alt. Build the cosigner pool per genre (genre picks + both charts) so each genre has big cosigners.
- **Fame scales differ by genre** (big indie ≈ 1–2M Last.fm listeners, big rap ≈ 5–8M): the cosigner/newcomer ratio already adjusts somewhat; ranking within genre adjusts fully.
- Some genres will have only 2–3 newcomers at first (Country/Latin credits are thin on MusicBrainz): show that honestly.

## On the page

`src/components/RisingList.jsx`, props from a `risingList()` in `src/lib/data.js` (build time only, small props).

Each row: rank · photo · **newcomer name** · listeners · first release year · "Cosigned by **Drake** on “True Bestie” (May 2026)" (each cosigner a chip; links to their page if they have one) · evidence link to MusicBrainz.

## Open (for Julian)

1. **Remixes and tours:** count only features + collabs (v1), or also official remixes (risky: many "flips"/"edits" are fan uploads) and tour openers (we only have tours for the roster)?
2. **Newcomer links/photos:** newcomers have no Cosignr page. Link to MusicBrainz, or to Spotify (MusicBrainz often links their Spotify; Spotify oEmbed photos are an approved image source)? Or give each Rising artist a light page later?
3. **Pool size:** how deep into the charts (top 50 of each? 100?). Deeper = more cosigners, longer nightly run.
4. **The 5-year rule** uses MusicBrainz's earliest release, which can be wrong for artists with old side projects under another name. Fine for v1?
5. **Label:** "Rising" or something more specific ("Cosigned by the big names", "Ones to watch")?
6. **Demo scope:** build it fully (nightly, real pool), or a lighter demo version (page artists only, no chart pool) first?

## Useful references

- Scratch queries from 2026-10-16 (not in the repo) showed superstars mostly cosign other stars: ~45 recent cosigns from the 11 biggest extended artists, only a handful under 150k. Expect a short list from superstars; the chart pool adds more.
- Known traps: Last.fm namesake pages (JENNIE 25 listeners, No I.D. 5k), sample credits ("Out of Time" credits Tomoko Aran), recordings re-dated by reissues, DJ-set "medley" recordings (Daft Punk "Technologic / Victory Lap / …").
