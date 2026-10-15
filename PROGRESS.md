# Cosignr progress

Status key: ✅ done · 🟡 in progress · ⬜ not started

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
- ⬜ Evaluate extra free sources: Deezer (fans, 1000px images, previews), MusicBrainz (relationships, area), Wikidata (hometown, socials), Wikipedia (bio), ListenBrainz, TheAudioDB
- ✅ Cosign evidence model (see CLAUDE.md "Cosigns"): per (from, to) pair, types, song counts, first/last date, evidence songs linked to MusicBrainz
- ✅ `scripts/fetch-cosigns.mjs` seeds it from MusicBrainz credits + remixer relations: 1,616 cosigns, 11/12 roster artists have at least one (Jaws has none in MusicBrainz)
- ✅ Filters: DJ mixes/mashups/medleys, band ↔ member, non-roster pairs. Ranking puts features/remixes above collab-only pairs (fixed Travis Scott's top cosigner being his early duo partner Jason Eric)
- ✅ "Cosigned by" chips are real (top 4, hover shows the song and year); search matches every cosigner; demo `cosignedBy` removed
- ⬜ Curated cosigns (`data/cosigns-curated.json`) for things MusicBrainz misses: shout-outs, tour support, label signings. Each needs a source URL
- ⬜ Setlist.fm tour support (needs a free API key)
- ⬜ Rank cosigners by their own prominence too (needs Last.fm listeners for non-roster artists)
- ⬜ `data/cosigns.json` is 790KB (160KB gzipped). Split per artist once artist pages exist

### 4. Infrastructure
- 🟡 GitHub Action `.github/workflows/refresh-data.yml`: nightly 06:17 UTC + manual run, runs all three fetch scripts, commits `data/`. `LASTFM_API_KEY` secret added; not yet run on GitHub
- ⬜ Pages deploy: currently not live. Plan: Pages source "GitHub Actions" with the nightly job deploying, so data commits always publish (deferred by Julian 2026-10-14)
- ✅ Store daily snapshots (`data/snapshots/`)
- ⬜ Accounts + user cosigns (Supabase or Firebase)
- ⬜ Artist detail page
- ⬜ "Who cosigned who" graph view

## Log

- **2026-10-14:** UI polish pass on the original mockup (layout kept, interactions added). Started Milestone 0: moved data to `artists.json`, added fetch script, Wikimedia + Spotify + press sources, dev panel, credits. Found Commons rejects 400px thumbnails (now 500px) and Spotify oEmbed returns only 320px (upgraded to 640px via URL size code). Created CLAUDE.md, PROGRESS.md, WALKTHROUGH.md. Julian picked Spotify as the default image source. Moved the project out of the portfolio repo (`Julian-Reyes.github.io/CoSign`) into its own folder, `cosignr/`.
- **2026-10-14 (later):** Pushed to GitHub (needed `http.postBuffer` raised for the first push). Started Milestone 1 research: Spotify no longer gives popularity/followers to new apps; Deezer works keyless; verified Deezer IDs for 10 artists (see Research findings).
- **2026-10-14 (evening):** Resolved Deezer IDs for Jaws (5566102) and Jackal (310086, shared page, excluded via new `caveats` field). Added `scripts/fetch-stats.mjs` (Deezer + Last.fm-when-keyed, Cosignr score, daily snapshots), switched Trending to real scores with metric tabs, removed fake trending numbers, added nightly refresh workflow. Waiting on Last.fm key.
- **2026-10-14 (night):** Last.fm key added and first full run done. Scores now 32–89 with Last.fm + Deezer. Verified Last.fm pages per artist (see Milestone 1 §3).
- **2026-10-15:** Real cosigns from MusicBrainz (`fetch-cosigns.mjs`, 1,616 cosigns). Chips and search now use them; demo cosigns removed. Added mashup, band-member and ranking fixes after reviewing each artist's top cosigners. Nightly job runs it too.
