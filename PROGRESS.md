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

## Milestone 1: real data and infrastructure ⬜

### 3. Real stats and more free data
- ⬜ Register a Spotify app; confirm which endpoints are still available (popularity 0–100, followers, genres)
- ⬜ Last.fm API key; pull listeners + playcount + tags per artist
- ⬜ Replace "streams" UI with popularity score + Last.fm listeners/plays; decide what the Now/Week/Month/Year tabs mean with real data (Last.fm charts? our own snapshots over time?)
- ⬜ Evaluate extra free sources: Deezer (fans, 1000px images, previews), MusicBrainz (relationships, area), Wikidata (hometown, socials), Wikipedia (bio), ListenBrainz, TheAudioDB
- ⬜ Define the cosign evidence model (from, to, type, date, source URL) and seed it from MusicBrainz + Setlist.fm

### 4. Infrastructure
- ⬜ GitHub Action: nightly fetch with API keys from repo secrets, commit updated `data/*.json`
- ⬜ Store daily snapshots so we can compute real "trending" and rank changes
- ⬜ Accounts + user cosigns (Supabase or Firebase)
- ⬜ Artist detail page
- ⬜ "Who cosigned who" graph view

## Log

- **2026-10-14:** UI polish pass on the original mockup (layout kept, interactions added). Started Milestone 0: moved data to `artists.json`, added fetch script, Wikimedia + Spotify + press sources, dev panel, credits. Found Commons rejects 400px thumbnails (now 500px) and Spotify oEmbed returns only 320px (upgraded to 640px via URL size code). Created CLAUDE.md, PROGRESS.md, WALKTHROUGH.md. Julian picked Spotify as the default image source. Moved the project out of the portfolio repo (`Julian-Reyes.github.io/CoSign`) into its own folder, `cosignr/`.
