# Cosignr progress

Status key: ✅ done · 🟡 in progress · ⬜ not started

## Next up (as of 2026-10-15)

Remaining items, in rough order. Julian wants a check-in before each one starts (propose a plan, wait for OK). Details are in the sections below.

1. **Rising rankings (step 4):** rank changes (▲/▼) and "rising this week" from `data/snapshots/`. Wait until ~2026-10-21 (a week of snapshots), then agree the formula with Julian before building.
2. **Stats on phones (step 3):** the Trending stat column is hidden below 1100px. Waiting for Julian to check on his phone and say what he wants.
3. **"Who cosigned who" graph (step 10):** a visual graph of cosigns. Not designed yet.
4. **Accounts and real user cosigns (step 11):** Supabase. The login modal and Cosign button are demo-only for now.
5. **Maybe: hand-curated cosigns (step 5):** shout-outs and label signings with a source URL. Julian said "possibly"; don't build until decided.
6. **Small:** set `site` in `astro.config.mjs` to `https://julianreyes.dev` (the Pages URL redirects there; only affects full URLs like share previews).
7. **Later:** scaling plan for hundreds of artists (see Milestone 1 §3), and full catalogs for the extended artists (they're light pages today).

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
- ⬜ Show the stat on narrow screens (the stat column is still hidden below 1100px, as before)
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
- ⬜ Setlist.fm ruled out: terms forbid storing data, non-commercial only, no competing products. Only with written permission
- ⬜ Tour gaps: most tour cosigns are outbound (roster artist → opener), which only show once artist pages list "Cosigns". Openers only listed in a tour's date table (not its infobox) are missed
- ✅ Rank cosigners by fame (Julian: fame counts most): Last.fm listeners for ~620 cosigners in `stats.json` → `cosigners`, cached 7 days. Lookup by MusicBrainz ID, then name, then MusicBrainz aliases (Ye → Kanye West); name matches carrying a different ID are rejected
- ✅ Official releases only (drops bootlegs, fan mashup tapes, DJ edits; found via Coldplay → Drake, Oasis → Porter Robinson), plus "bootleg" in the title. Uses both `artist=` and `track_artist=` release lists (track_artist alone missed releases credited to the artist)
- ✅ No posthumous cosigns (song released after the cosigner died or split up), dates cached in `data/cache/mb-lifespans.json`
- ⬜ Known gap: 7 cosigners share a Last.fm page with a namesake (NERO, EPROM, JENNIE, EDDIE…) so have unknown fame. Possible fix later: Wikidata or Deezer as a second fame source
- ⬜ **Before scaling the roster:** a full MusicBrainz run is ~450 requests (~8 min at 1 req/s), and Drake is half of it. Time grows with each artist's catalog, so hundreds of artists means hours. Plan, in order: (1) incremental runs that only fetch what changed since last time, plus a weekly full refresh; (2) refresh a slice of the roster each night; (3) at hundreds+ artists, download the free MusicBrainz database dumps and query our own copy (no rate limit). Cosigns and stats then live in a real database (Supabase) instead of JSON files
- ✅ Split cosigns per artist: pages carry 10 rows per list, the rest is in `/artist/<id>.json` (data files themselves aren't published)

### 4. Infrastructure
- ✅ Nightly data refresh: first scheduled run 2026-10-15 worked (Last.fm secret used, data committed by github-actions[bot])
- 🟡 Pages deploy: `.github/workflows/site.yml` (replaces refresh-data.yml) refreshes nightly then deploys; pushes to main deploy only. Julian sets Settings → Pages → Source: GitHub Actions. URL: https://julian-reyes.github.io/Cosignr/
- ✅ Demo notes: login/sign-up modal and Cosign button say accounts aren't live yet
- ✅ **Decided 2026-10-15:** move to **Astro with React** for interactive parts, starting with artist pages. Static build, deployed to Pages by the same workflow. Lighter than Next.js because only interactive components ship JS. Plan: `ASTRO.md`
- ✅ Phase A (2026-10-15): home page ported to Astro 7.3.5 + React 19.2.8 with an identical look (before/after screenshots matched; tabs, search, chips, Show More, modal, dev panel and image switching click-tested). Data is read at build time, so the browser no longer downloads cosigns.json (624 KB). Deploy job builds with `npm ci && npm run build` on Node 22
- ✅ Phase B (2026-10-15): `scripts/fetch-extended.mjs` → `data/extended.json` (49 artists: top 5 cosigners of each roster artist). Sources, profiles (now also genre), stats and upcoming cover all 61. Fame now also covers artists our roster cosigned (917 linked artists). Fixes found on the way: Spotify/Deezer duplicate pages (Beyoncé, Daft Punk, Kygo, FERG), implausible Deezer counts get an automatic caveat (Skrillex, Metric, TEED, JID), Last.fm pages for extended artists verified like cosigner fame (Ye → Kanye West). Shared `src/lib/cosigns.js` merge used by site and scripts. Upcoming now finds 8 runs (Gorillaz → Little Simz, Knocked Loose → Denzel Curry…)
- ✅ Reviewed (Julian): Gorillaz = Essex is fine; quirky MusicBrainz genres (Skrillex: "Brostep") left as they are for now
- ✅ Phase C (2026-10-15): 61 artist pages (`src/pages/artist/[id].astro`) + per-artist JSON for "Show more". Cosigned by (fame), Cosigns (Strongest / Recent / Famous), upcoming shows, stats with caveats, evidence linked to sources. Home names and chips link to pages; whole Featured tiles open the artist page (Julian), which also fixed the Featured chips being unclickable. Footer data credits. Click-tested desktop + phone
- ✅ Store daily snapshots (`data/snapshots/`)
- ⬜ Accounts + user cosigns (Supabase or Firebase)
- ✅ Artist detail page (phase C)
- ⬜ "Who cosigned who" graph view

## Log

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
