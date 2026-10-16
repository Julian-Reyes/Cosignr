# Cosignr progress

Status key: ✅ done · 🟡 in progress · ⬜ not started · ✖ ruled out

## Next up (as of 2026-10-16)

Remaining items, grouped. Julian wants a check-in before each one starts (propose a plan, wait for OK). Details are in the sections below.

**Discussed 2026-10-16 (late), start here next session**

- **Trending numbers should be "what's happening now" (Julian).** Today they're career totals (Last.fm all-time listeners/plays, Deezer followers) and the Cosignr score blends them, so it measures size, not heat. Example: Eminem scores 86 (above Ye 85, Kendrick 83) mostly from 19.1M Deezer fans, but is #102 on the Last.fm US weekly chart (22k listeners) and absent from Apple's top 100; Ye is #2 (59.5k) and Kendrick #5 (56.2k) on Last.fm US, Drake has 16 Apple top-100 songs and 12 albums. "Now" signals we have: Last.fm US weekly listeners (top 1000, leans indie/alt), Apple US ranks (mainstream, top 100 only), snapshot growth (from ~Oct 22); YouTube can't be scored. Last.fm and Apple disagree a lot (Ye and Tyler, The Creator are top 3 on Last.fm, nearly absent on Apple), so combine them. Keep the career score for artist pages and Top. Open: keep hand-picked artists re-sorted by "now" numbers, or let charting artists fill Trending automatically.
- **Top Artists label is false:** "The most cosigned artists on Cosignr of all time" over a hand-picked list (The xx, Porter Robinson, Drake). Real order by cosigners: Drake 175, Travis Scott 124, Saba 72… (The xx 4). Options: rank by real count, relabel as picks, or roster-only.
- **Rising by genre:** see "By genre" in RISING.md (Julian worried Hip-Hop/Pop would crowd out Indie).

**Waiting on data (collecting nightly)**
1. **Rising (our artists):** *Option (Julian, 2026-10-16), **plan in `RISING.md`** (own "Rising" section under Trending; Julian still deciding scope for the demo): **recent cosigns from big artists to small ones**, e.g. Drake → Iconic Savvy (7k Last.fm listeners, May 2026), Travis Scott → skeler. (6.5k, remix, Oct 2026). Rank by cosigner fame vs newcomer fame and recency; combine with the snapshot growth below ("+40% since Drake's cosign") or offer it as a filter. Spot-check credits (remixes) before featuring anyone.*
    "rising this week" and rank changes (▲/▼) from `data/snapshots/`. Method agreed in principle: Last.fm listener growth as a %, with a minimum size, shown as e.g. "+4.2% listeners this week". The 61 page artists have 7 days ~2026-10-22; the `watch` list (88 artists the roster cosigned in the last 2 years) ~2026-10-23. Agree the formula and placement before building; it could replace the hand-picked Trending list.
2. **Real-world rising / trending:** from `data/charts/` (Last.fm top 1000 global + US, Apple Music US top 100 songs + albums, collected since 2026-10-16). Needs a few weeks of history. Idea: chart climbers and new entries week over week, confirmed across sources (Adéla was top 10 on Last.fm global, Apple US songs and both Wikipedia lists on 2026-10-16), linked to MusicBrainz for "who cosigned them". This is what replaces the hand-picked Trending/Top/Featured membership.

**Decided, needs a plan (propose before building)**

3. ✅ **"Hot Right Now" section (built 2026-10-16, plan in `HOT.md`):** under Trending; Songs / Albums (Apple Music US) and Videos (YouTube US, live only) tabs, top 5 + Show More (10 at a time) up to 25 each, cover art/thumbnails linking back (sized like the Trending photos, Julian 2026-10-16), genre chip, "New" tag, cosign markers ("Drake × Don Toliver: cosign").
4. ✅ **Artist page badges (built 2026-10-16):** "Trending video" (YouTube US chart) and "#N on Apple Music US today" (top 100 songs). On 2026-10-16: Drake #1 + video, Tame Impala video (Justice ft. Tame Impala), Future, J. Cole, Kendrick, The Weeknd, Travis Scott on Apple.
   - **Needs Julian:** add the `YOUTUBE_API_KEY` secret to the deploy job's environment if it isn't there yet (the deploy job now reads it; without it the Videos tab and badge are just hidden).
5. *(merged into 3)*

**Designed, on hold (Julian: wait for now)**

6. **"Who cosigned who" graph (step 10):** 🟡 mockup **C** picked: one artist + top N cosigners/cosigned by fame, force layout, names inside circles, thin lines, small filled arrowheads (A, B, D rejected). Open: artist page section or own page, N (8 desktop / 5 phone?), photos in circles.
7. **Countries (Julian, 2026-10-16):** global is tricky (Apple and YouTube only chart by country), so Cosignr is **USA only for now** (the Last.fm global chart keeps being collected in case global is added someday); future versions can load by region/country (Mexico and Brazil were compared and are good candidates).

**Decided, needs a plan (propose before building)**

- ✅ **Genre bar (built 2026-10-16):** thin white strip under the nav (All, Hip-Hop, Pop, R&B, Indie, Electronic, Rock, Country, Latin) filtering Trending, Hot Right Now and Top. Trending has 5 hand-picked artists per genre (`genrePicks`, 19 new `curated` light pages: SZA, Morgan Wallen, Bad Bunny, Deftones…); All keeps the hand-picked 6. Later: genre filters on artist page lists and Rising; video genres for artists without a page; real cosigns for the curated artists (their catalogs aren't crawled).

**Ready to start (small)**

- **fetch-sources.mjs drops a photo on a temporary error** (seen 2026-10-16: a Spotify oEmbed 504 removed Bassnectar's image until a re-run). Keep the previous image when a fetch fails.

8. Press photos for G Jones and Jackal (draft requests for Julian to send).
9. Review Wikimedia crops and add `focus` overrides (only matters when the dev panel picks Wikimedia).
10. Second fame source (Deezer or Wikidata) for cosigners whose Last.fm page is shared with a namesake (NERO, JENNIE, EDDIE…).
11. More artist page facts: Wikipedia bio, Wikidata socials.
12. Tour gaps: openers only listed in a tour's date table.

**Undecided**

13. **Maybe: hand-curated cosigns (step 5):** shout-outs and label signings with a source URL. Julian said "possibly"; don't build until decided.

**Next phase**

14. **Accounts and real user cosigns (step 11):** Supabase. The login modal and Cosign button are demo-only for now.
15. **Scaling** to hundreds of artists (see Milestone 1 §3), and full catalogs for the extended artists (light pages today).

### Chart sources (reference, 2026-10-16)
- **Why several sources:** Last.fm alone skews to indie/alt listeners (Radiohead, Deftones top it), so add:
  1. ✖ **Wikipedia pageviews (tested and dropped, Julian 2026-10-16):** top musicians were mostly news-driven (McCartney, Michael Jackson, Eagles, actors who sing). Was: general-public attention. Free, no key, daily history back to 2015 (no collecting needed), plus a top-articles-per-country list (US). Filter to musicians via Wikidata (band / musical group, or a person whose first occupations are musical). Spikes can be news, not music.
  2. ⬜ **YouTube Data API:** most-popular chart per country, Music category: the mainstream view. Free key (10,000 units/day, ~1 per chart call). Ranks videos, not artists (artist from channel/title). Terms limit storing data to ~30 days without refreshing. Key added by Julian 2026-10-16 (`YOUTUBE_API_KEY` in .env + repo secret) and works: US Music chart = 30 videos, mostly uploaded in the last 2 weeks. **But the YouTube API Developer Policies block a history:** API data (statistics included) can't be stored more than 30 days (III.E.4), can't be used to create new or derived metrics (III.E.4.h), and can't be used to gain insights into YouTube usage (III.E.2). So YouTube can't feed a historical rising score. **Decided (Julian, 2026-10-16): YouTube is live-only**: a "Trending now" display and a "Trending video" badge on artist pages, refreshed nightly, nothing kept past 30 days, never fed into rising or any score.
  3. ✅ **Apple Music RSS (collecting from 2026-10-16, US songs + albums):** `rss.marketingtools.apple.com/api/v2/<country>/music/most-played/<10|100>/songs.json` (moved from rss.applemarketingtools.com, which 301s). Free, no key, very mainstream, per country (no global), max 100, updated daily. Flaky: some sizes time out or 502, so retry. Songs credit several artists in one string ("Drake & Don Toliver"). For promotion: link back to Apple Music.
  - **Apple global: on hold (Julian, 2026-10-16).** Apple has no global chart. Later maybe combine big markets (UK, Canada, Australia, Germany, Brazil, Mexico, some Asian countries); 2 requests per country.
- Weaker sources (ListenBrainz, Deezer per-country charts) ignored for now (Julian).
- **Genre (checked 2026-10-16):** each Apple song carries genre tags (US top 100 today: Hip-Hop/Rap 43, Country 22, Pop 16, R&B/Soul 15, Alternative 4, Latin 2, Rock 1), so charts can be grouped by genre, but small genres get only a few songs. The legacy iTunes Store feed (`itunes.apple.com/us/rss/topsongs/limit=100/genre=<id>/json`) filters by genre but ranks purchases, not streams. Apple's genre tags are saved with each song/album from 2026-10-16 (Julian: genres come to the site later).
- **Three-way comparison (2026-10-16, US top 15):** only Drake and Olivia Rodrigo are top 15 on Apple, YouTube and Last.fm. YouTube adds regional Mexican, Latin trap and viral one-offs that neither other source shows.
- **USA / Mexico / Brazil comparison (2026-10-16, one-off, not collected):** top 15 in all three sources: USA Drake + Olivia Rodrigo, Mexico Fuerza Regida, Brazil Olivia Rodrigo. Apple and YouTube are very local (no artist in all three countries' top 15; Mexico and Brazil share none), Last.fm is the most global (Olivia Rodrigo and Ariana Grande top 15 in all three). Adéla is #1 on Last.fm Brazil. If we add countries to the collector later, Mexico and Brazil are good candidates (Julian's picks). Name splitting gotchas: Brazilian duos are one act ("Jorge & Mateus", "Felipe e Rodrigo"); Brazilian funk videos are titled "SONG - MCs".

## Milestone 0: data-driven page and image sources 🟡

Goal: every section renders from one data file, no text is baked into images, and the three image sources can be compared side by side.

### 1. One data source
- ✅ `data/artists.json` holds all 12 artists with Wikidata / Spotify / MusicBrainz / Last.fm IDs
- ✅ Featured, Trending and Top all render from it (`js/app.js`); markup is just containers
- ✅ Names, genre and hometown drawn as HTML over the photo (no more wrong "25.6mil Streams" baked into images)
- ✅ Unknown facts left as `null` instead of guessed (G Jones, Jackal hometowns)
- ✅ Placeholder values (cosigns, trending numbers) isolated under each artist's `demo` key
- ✅ Show a visible "demo data" marker on the trending numbers until Milestone 1 replaces them

### 2. Image sources + developer toggle
- ✅ `scripts/fetch-sources.mjs` builds `data/sources.json` (no API keys)
- ✅ Wikimedia Commons: 10/12 artists, 1280px + 500px thumbs, author/license/source captured
- ✅ Spotify (via oEmbed): 12/12 artists, 640px + 320px
- ✅ Press kit: wired up (`images/press/<id>.jpg`), 0/12 so far, needs permission per artist
- ✅ "Original" (2019 mockup images) kept as a fourth option for comparison
- ✅ Dev panel: `Shift+D` or `?dev`, choose Auto / Press / Wikimedia / Spotify / Original, shows coverage per source, remembers choice
- ✅ Auto mode falls back press → Wikimedia → Spotify → original
- ✅ Credits: hover caption on large photos plus a "Photo credits" list in the footer; Spotify images link to Spotify
- ✅ Placeholder with initials when a source has no image for an artist
- ✅ Default image source: **Spotify** (decided 2026-10-14). Others stay available in the dev panel
- ⬜ Request press photos for G Jones and Jackal (no Wikimedia photo exists)
- ⬜ Review Wikimedia crops per artist and add `focus` overrides where faces get cut off

## Milestone 1: real data and infrastructure 🟡

### Research findings (2026-10-14)
- **Spotify popularity is not available to new apps.** Since Feb 11, 2026, new Development Mode apps no longer get artist `popularity` or `followers`, the app owner needs Spotify Premium, and apps are capped at 5 users. Extended quota (which keeps them) is for established businesses. Sources: [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [TechCrunch](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/), [July 2026 changelog](https://developer.spotify.com/documentation/web-api/references/changes/july-2026) (no restoration).
- **Replacement (approved):** a computed **Cosignr score (0–100)** from Last.fm listeners/plays + Deezer fans.
- **Deezer works with no key** (`api.deezer.com/artist/{id}`): `nb_fan`, 1000px `picture_xl`, top tracks with 30s previews.
- **Deezer IDs:** MusicBrainz URL relations give 10/12, but two point at near-empty duplicates. Verified IDs to use:
  - travis-scott 4495513 (3.1M fans), tame-impala 134790, rezz 5879522, g-jones 4520160, the-drums 308867, ski-mask 11347866, the-xx 261212, drake 246791 (24.1M)
  - saba **253278** (29k fans). MusicBrainz says 130363052, which has 6 fans
  - porter-robinson **864274** (170k). MusicBrainz says 332244311, which has 96 fans
  - jaws **5566102** "JAWS" (2.4k): has the band's albums Be Slowly / Simplicity / The Ceiling. 610520 is a different "Jaws"
  - jackal **310086** (MusicBrainz agrees, has Empathy / Netflix N Kill / Animal Style) but the page is shared with other "Jackal"s, so fans are excluded via `caveats`
- **Deezer skews European.** G Jones has 1.8k Deezer fans and Jaws 2.4k, so Deezer-only scores understate US/underground artists. Last.fm should balance it.
- **MusicBrainz extras** (no key): area (e.g. G Jones = Santa Cruz), begin dates, type Person/Group. Could fill the `null` hometowns.

### 3. Real stats and more free data
- ✅ **Decided 2026-10-14:** show Last.fm **listeners and plays** as raw numbers (replacing the fake "streams") **and** a computed **Cosignr score (0–100)** from Last.fm + Deezer as the headline/ranking number. Spotify popularity dropped.
- ✅ Last.fm API key in `.env` (git-ignored). Still to do: add it as the `LASTFM_API_KEY` repo secret for the nightly job
- ✅ Add `ids.deezer` to artists.json (12/12), Jaws + Jackal resolved; per-artist `caveats` exclude known-bad metrics
- ✅ `scripts/fetch-stats.mjs` → `data/stats.json` + daily `data/snapshots/<date>.json`. Deezer now; Last.fm when key exists; keeps previous values for skipped sources
- ✅ Cosignr score: log10 of each metric scaled between fixed bounds (`SCALE` in the script) to 0–100, averaged
- ✅ Last.fm: listeners + playcount + tags for 12/12. Checked each page is the right artist: 8 match our MusicBrainz ID; Rezz and Saba use a different ID but tags fit; Jaws top tracks are the Birmingham band's; Jackal's page is shared with a metal band (metal tags) but his tracks dominate, so his numbers are kept and are slightly high
- ✅ Score bounds checked with Last.fm included: range is 32 (G Jones, Jaws) to 89 (Drake), no tuning needed
- ✅ Replaced fake "streams" UI: Trending ranks by Cosignr score; Now/Week/Month/Year tabs replaced by "Sort by" Score / Listeners / Plays / Fans (only metrics with data show). Removed demo `trending`/`prevRank` numbers. Badge now says "Demo cosigns"
- ⬜ Bring back rank changes (▲/▼) and "rising this week" from snapshots once there are ~7 days of them
- ✅ Stats on narrow screens (Julian picked from 4 test placements, 2026-10-16): Cosignr score as a peach badge on the photo's top-left wherever the stat column is hidden (≤1100px); on phones (≤760px) Last.fm listeners under the photo; wider than that, listeners after the hometown ("Chicago, IL · 833k listeners")
- ✅ Hometowns: `scripts/fetch-profiles.mjs` → `data/profiles.json` (MusicBrainz born/formed, else based). Filled G Jones (Santa Cruz, CA) and Jackal (United Kingdom). Hand-written values win
- ✅ Reviewed differences (Julian, 2026-10-15): keep Rezz = Niagara Falls (MusicBrainz: born in Ukraine), Tame Impala = Perth (formed there; MusicBrainz says Sydney), The xx = London (MusicBrainz: Wandsworth). The script will keep listing these; that's expected
- ⬜ Evaluate extra free sources: Deezer (fans, 1000px images, previews), MusicBrainz (relationships, area), Wikidata (hometown, socials), Wikipedia (bio), ListenBrainz, TheAudioDB
- ✅ Cosign evidence model (see CLAUDE.md "Cosigns"): per (from, to) pair, types, song counts, first/last date, evidence songs linked to MusicBrainz
- ✅ `scripts/fetch-cosigns.mjs` seeds it from MusicBrainz credits + remixer relations: 1,616 cosigns, 11/12 roster artists have at least one (Jaws has none in MusicBrainz)
- ✅ Filters: DJ mixes/mashups/medleys, band ↔ member, non-roster pairs. Ranking puts features/remixes above collab-only pairs (fixed Travis Scott's top cosigner being his early duo partner Jason Eric)
- ✅ "Cosigned by" chips are real (top 4, hover shows the song and year); search matches every cosigner; demo `cosignedBy` removed
- ⬜ Curated cosigns (`data/cosigns-curated.json`) for things MusicBrainz misses: shout-outs, label signings. Each needs a source URL
- ✅ Tour support, past (step 6): `scripts/fetch-tours.mjs` → `data/tours.json`, 80 tour cosigns. Headliner cosigns the opener; one tour = one cosign however many shows (Julian). Sources: Wikipedia tour infobox "support_acts" (tours found via Wikidata + "<Artist> concert tours" category; only linked names, matched to MusicBrainz via Wikidata P434) and MusicBrainz concert "support act" relations (festivals, award shows and bills with >3 headliners skipped; shows grouped by MusicBrainz series). Page merges tours into the same chips; a tour counts as a vouch
- ✅ Tour support, upcoming: `scripts/fetch-upcoming.mjs` → `data/upcoming.json` from Ticketmaster, rebuilt nightly, shows dropped once past ("reasonable periods" caching; no revenue from the API). Artists matched by MusicBrainz or Spotify ID only; festivals, tribute/party nights and non-artist listings skipped. Today: Tame Impala → Wet Leg (Deadbeat Tour 2027). Ticketmaster has no IDs for The xx, The Drums, Jaws, Jackal, so they're skipped (The xx's 7 listings are all Corona Capital festival passes, which would be skipped anyway). Ticketmaster lists each ticket type of a festival as its own event
- ✅ Openings by roster artists: Wikipedia articles with "tour" in the title that link to a roster artist (Ye, Kendrick, Rihanna, The Weeknd → Travis; Florence + the Machine → The xx, The Drums)
- ✅ New cosign type "band" (Julian): hiring someone for your touring band is a cosign (MusicBrainz supporting-musician relations, e.g. Tame Impala → Jay Watson, Cam Avery). 100 live cosigns in tours.json
- ✖ Setlist.fm ruled out: terms forbid storing data, non-commercial only, no competing products. Only with written permission
- ⬜ Tour gaps: most tour cosigns are outbound (roster artist → opener), which only show once artist pages list "Cosigns". Openers only listed in a tour's date table (not its infobox) are missed
- ✅ Rank cosigners by fame (Julian: fame counts most): Last.fm listeners for ~620 cosigners in `stats.json` → `cosigners`, cached 7 days. Lookup by MusicBrainz ID, then name, then MusicBrainz aliases (Ye → Kanye West); name matches carrying a different ID are rejected
- ✅ Official releases only (drops bootlegs, fan mashup tapes, DJ edits; found via Coldplay → Drake, Oasis → Porter Robinson), plus "bootleg" in the title. Uses both `artist=` and `track_artist=` release lists (track_artist alone missed releases credited to the artist)
- ✅ No posthumous cosigns (song released after the cosigner died or split up), dates cached in `data/cache/mb-lifespans.json`
- ⬜ Known gap: 7 cosigners share a Last.fm page with a namesake (NERO, EPROM, JENNIE, EDDIE…) so have unknown fame. Possible fix later: Wikidata or Deezer as a second fame source
- ⬜ **Before scaling the roster:** a full MusicBrainz run is ~450 requests (~8 min at 1 req/s), and Drake is half of it. Time grows with each artist's catalog, so hundreds of artists means hours. Plan, in order: (1) incremental runs that only fetch what changed since last time, plus a weekly full refresh; (2) refresh a slice of the roster each night; (3) at hundreds+ artists, download the free MusicBrainz database dumps and query our own copy (no rate limit). Cosigns and stats then live in a real database (Supabase) instead of JSON files
- ✅ Split cosigns per artist: pages carry 10 rows per list, the rest is in `/artist/<id>.json` (data files themselves aren't published)

### 4. Infrastructure
- ✅ Nightly data refresh: first scheduled run 2026-10-15 worked (Last.fm secret used, data committed by github-actions[bot])
- ✅ Pages deploy: `.github/workflows/site.yml` (replaces refresh-data.yml) refreshes nightly then deploys; pushes to main deploy only. Live at https://julianreyes.dev/Cosignr/ (julian-reyes.github.io/Cosignr redirects there)
- ✅ Demo notes: login/sign-up modal and Cosign button say accounts aren't live yet
- ✅ **Decided 2026-10-15:** move to **Astro with React** for interactive parts, starting with artist pages. Static build, deployed to Pages by the same workflow. Lighter than Next.js because only interactive components ship JS. Plan: `ASTRO.md`
- ✅ Phase A (2026-10-15): home page ported to Astro 7.3.5 + React 19.2.8 with an identical look (before/after screenshots matched; tabs, search, chips, Show More, modal, dev panel and image switching click-tested). Data is read at build time, so the browser no longer downloads cosigns.json (624 KB). Deploy job builds with `npm ci && npm run build` on Node 22
- ✅ Phase B (2026-10-15): `scripts/fetch-extended.mjs` → `data/extended.json` (49 artists: top 5 cosigners of each roster artist). Sources, profiles (now also genre), stats and upcoming cover all 61. Fame now also covers artists our roster cosigned (917 linked artists). Fixes found on the way: Spotify/Deezer duplicate pages (Beyoncé, Daft Punk, Kygo, FERG), implausible Deezer counts get an automatic caveat (Skrillex, Metric, TEED, JID), Last.fm pages for extended artists verified like cosigner fame (Ye → Kanye West). Shared `src/lib/cosigns.js` merge used by site and scripts. Upcoming now finds 8 runs (Gorillaz → Little Simz, Knocked Loose → Denzel Curry…)
- ✅ Reviewed (Julian): Gorillaz = Essex is fine; quirky MusicBrainz genres (Skrillex: "Brostep") left as they are for now
- ✅ Phase C (2026-10-15): 61 artist pages (`src/pages/artist/[id].astro`) + per-artist JSON for "Show more". Cosigned by (fame), Cosigns (Strongest / Recent / Famous), upcoming shows, stats with caveats, evidence linked to sources. Home names and chips link to pages; whole Featured tiles open the artist page (Julian), which also fixed the Featured chips being unclickable. Footer data credits. Click-tested desktop + phone
- ✅ Store daily snapshots (`data/snapshots/`)
- ⬜ Accounts + user cosigns (Supabase or Firebase)
- ✅ Artist detail page (phase C)
- 🟡 "Who cosigned who" graph view (mockup C picked, on hold)

## Log

- **2026-10-16 (late night, conversation):** No code. Score vs "now": the Cosignr score is career size; Trending should use current numbers (see "Discussed" above). Only one day of `data/charts/` so far (collection started 2026-10-16). Kendrick's all-time Last.fm listeners were identical on Oct 15 and 16: Last.fm totals can be stale day to day, so measure growth over 7+ days. Rising-by-genre ideas added to RISING.md.
- **2026-10-16 (late night, genre picks):** Trending genre filter shows 5 hand-picked artists per genre (Julian approved the picks). 19 new curated light pages (R&B, Rock, Country, Latin, Olivia Rodrigo for Pop), IDs resolved by fetch-extended. Trending ranks now count within the current view. Linkin Park and Morgan Wallen had empty duplicate Deezer pages (3,987 / 876 fans); fetch-extended now checks curated artists' fans against their own Last.fm listeners and adds the caveat. "Cosigned by" lists are built for every page artist.
- **2026-10-16 (late night, genres):** Genre bar under the nav (Julian picked 8 genres, filter the home page, under the nav). `genreGroup()` folds detailed genres into groups. Hot Right Now now ships each genre's top 25 from the full chart (island props ~47 → ~124 KB). Fixed Show More showing "(-2)" when it should be hidden (`display` overrode `[hidden]`).
- **2026-10-16 (late night, Rising plan):** Wrote RISING.md: Rising = newcomers (<150k Last.fm listeners, first release within ~5 years) cosigned in the last 12 months by big artists (page artists with 1M+ listeners plus the Last.fm/Apple US chart tops). Reissues, mashups and medleys excluded. Not built; Julian to decide scope.
- **2026-10-16 (late night, nav fix):** Section links (Featured, Top, Trending, Hot) stopped with the title hidden under the sticky nav; fixed with `scroll-padding-top` on `html`. Logged two ideas: rising from big-to-small recent cosigns, and genre tabs.
- **2026-10-16 (late night, Hot Right Now, title):** Heading in title case: "Hot Right Now" (Julian).
- **2026-10-16 (late night, Hot Right Now, shorter):** Hot Right Now shows the top 5, then Show More adds 10 (up to 25), like Trending (Julian).
- **2026-10-16 (late night, Hot Right Now, cont.):** Cover art enlarged to match the Trending photos (120 / 100 / 72px; videos 16:9 at the same height), Apple artwork fetched at 240px. Docs: fetch-youtube added to the refresh order and the nightly-deploy notes.
- **2026-10-16 (late night, Hot Right Now):** Built HOT.md with Julian's answers (Apple + YouTube images approved, 10 + more up to 25, name "Hot Right Now", Apple rank badge yes). Collector saves Apple artwork + link; fetch-profiles saves Apple artist IDs and YouTube channel IDs (MusicBrainz links + Wikidata P2850/P2397); new `fetch-youtube.mjs` writes gitignored `data/live/youtube.json` in the deploy job only. Chart entries match artists by ID; a second name counts only if it's a known cosign partner of the ID-matched artist.

- **2026-10-16 (late night, YouTube):** YouTube key works (US Music chart = 30 videos), but its developer policies forbid storing data over 30 days and building derived metrics, so it can't feed rising. Julian: use it live only, as "Trending now" and a "Trending video" badge on artist pages. New idea: a top songs/albums section. Next up regrouped.
- **2026-10-16 (late night, cont.):** Apple Music RSS works (moved host) and is now in the collector (US top 100 songs + albums). Wikipedia pageviews tested and dropped. Each chart is fetched independently so one failure doesn't lose the rest.
- **2026-10-16 (late night):** Started collecting real-world charts: `fetch-charts.mjs` → `data/charts/<date>.json` (Last.fm top 1000 global + US, ~93% with MusicBrainz IDs, ~137 KB/day), nightly in site.yml. Deezer chart left out (varies by caller location). Apple Music RSS didn't respond.
- **2026-10-16 (night):** Tidied PROGRESS: regrouped Next up, Pages deploy ticked (live at julianreyes.dev), Setlist.fm marked ruled out.
- **2026-10-16 (evening):** Trending stats on phones: score badge top-left of the photo, listeners under it; listeners after the hometown on desktop.
- **2026-10-16 (late afternoon):** Cosigned by gets the Strongest / Recent / Famous tabs (opens on Famous). Logo checkmark box removed (header + footer). Tried the logo in Roboto (nav font); Julian kept the original Nunito. Login/Sign up text set to dark grey (Safari showed its default blue because no color was set).
- **2026-10-16 (afternoon):** Artist pages: Cosigns now comes before Cosigned by, side by side on desktop (stacked below 900px). fetch-stats saves a nightly `watch` list in snapshots (98 artists cosigned since 2024-10-16, 88 with a verified Last.fm page) for rising. Graph arrowheads: small filled.
- **2026-10-16 (later):** Graph: Julian picked mockup C. Real-world trending ideas: snapshot outside charts daily (Last.fm global/country charts, Deezer charts, Wikipedia most-viewed filtered to musicians) and rank climbers/new entries; resolve each to MusicBrainz. Spotify/Billboard charts have no usable API.
- **2026-10-16:** `site` set to julianreyes.dev. Cosign graph mockups (4 variants, real data) shared with Julian for a decision. Snapshots so far cover only the 61 page artists.
- **2026-10-14:** UI polish pass on the original mockup (layout kept, interactions added). Started Milestone 0: moved data to `artists.json`, added fetch script, Wikimedia + Spotify + press sources, dev panel, credits. Found Commons rejects 400px thumbnails (now 500px) and Spotify oEmbed returns only 320px (upgraded to 640px via URL size code). Created CLAUDE.md, PROGRESS.md, WALKTHROUGH.md. Julian picked Spotify as the default image source. Moved the project out of the portfolio repo (`Julian-Reyes.github.io/CoSign`) into its own folder, `cosignr/`.
- **2026-10-14 (later):** Pushed to GitHub (needed `http.postBuffer` raised for the first push). Started Milestone 1 research: Spotify no longer gives popularity/followers to new apps; Deezer works keyless; verified Deezer IDs for 10 artists (see Research findings).
- **2026-10-14 (evening):** Resolved Deezer IDs for Jaws (5566102) and Jackal (310086, shared page, excluded via new `caveats` field). Added `scripts/fetch-stats.mjs` (Deezer + Last.fm-when-keyed, Cosignr score, daily snapshots), switched Trending to real scores with metric tabs, removed fake trending numbers, added nightly refresh workflow. Waiting on Last.fm key.
- **2026-10-14 (night):** Last.fm key added and first full run done. Scores now 32–89 with Last.fm + Deezer. Verified Last.fm pages per artist (see Milestone 1 §3).
- **2026-10-15:** Real cosigns from MusicBrainz (`fetch-cosigns.mjs`, 1,616 cosigns). Chips and search now use them; demo cosigns removed. Added mashup, band-member and ranking fixes after reviewing each artist's top cosigners. Nightly job runs it too.
- **2026-10-15 (later):** Pages deploy workflow + demo notes. Decided Astro + React for the next phase. Hometowns from MusicBrainz (`fetch-profiles.mjs`); shared MusicBrainz client in `scripts/lib/`.
- **2026-10-15 (phase C):** Artist pages for the roster + 49 extended artists (ASTRO.md phase C). Tour cosigns are finally visible (Travis → Teezo Touchdown, Tame Impala → Wet Leg).
- **2026-10-15 (phase B):** Data for 49 extended artists (ASTRO.md phase B). Nothing new on the site yet.
- **2026-10-15 (Astro):** Phase A of ASTRO.md: home page moved to Astro + React islands, same look. Old `index.html`/`js/app.js` removed; images and mockups moved to `public/`, styles to `src/styles/`.
- **2026-10-15 (late night):** Step 6 continued: Ticketmaster upcoming shows, openings found via Wikipedia backlinks, touring-band cosign type. Touring musicians of a solo project count as cosigns (Julian).
- **2026-10-15 (night):** Step 6, past tour support from Wikipedia + MusicBrainz (80 tour cosigns, e.g. Travis → Teezo Touchdown, Tame Impala → Clairo, Drake → Central Cee, The Weeknd → Travis, Future → Saba). Ticketmaster for upcoming shows waits on the key.
- **2026-10-15 (evening):** Step 7: cosigners ranked by Last.fm fame; official-release and posthumous filters; fixed Last.fm "+" encoding (Florence + the Machine). 1,279 cosigns. Reviewed every roster artist's top 4. Added scaling plan for hundreds of artists.
