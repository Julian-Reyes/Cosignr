# "What's hot right now" section: plan (draft, 2026-10-16)

Status: **built 2026-10-16** with Julian's answers below (`src/components/HotList.jsx`, `hotLists()`/`hotFor()` in `src/lib/data.js`, `scripts/fetch-youtube.mjs`). Differences from the draft: top 5 then 10 more at a time, 25 per tab (not 10 of 50/50/30); name "Hot Right Now"; the nav link is "Hot".

## Where it goes

**Right under Trending Artists, above the light-blue Top Artists band** (Julian's suggestion). Home page order becomes: Featured → Trending Artists → **What's hot right now** → Top Artists. Add a nav link for it like the other sections.

## How it's laid out

**One section with three tabs: Songs | Albums | Videos**, styled like the Trending "Sort by" tabs.

- Why tabs: three lists side by side would be cramped on desktop and very long on phones. Tabs keep the section about as tall as Trending and work the same on both.
- Subtitle: "Most played in the US today. Updated daily."

**Each row:**
- Rank
- Cover art or thumbnail (if approved, see decision 1)
- Song, album or video title
- Artists. Anyone with a Cosignr page links to it; others are plain text
- A small genre chip from Apple's tags (Hip-Hop/Rap, Country…)
- A **"New"** tag if released in the last 7 days
- A link out: "Apple Music" or "YouTube"

**Cosign marker:** when a song has several credited artists and we already track that pair as a cosign, the row says so, e.g. "Drake × Don Toliver: cosign", linking to the evidence. That keeps it on-brand rather than just another chart.

## How many

| Tab | Shown first | Show more | Max |
|---|---|---|---|
| Songs | 10 | +10 | 50 |
| Albums | 10 | +10 | 50 |
| Videos | 10 | +10 | 30 (all YouTube gives) |

Apple goes up to 100, but stopping at 50 keeps the page light. Ten at a time, then "Show more", matches the artist pages.

## Artist page badges

- **"Trending video"** (decided by Julian, 2026-10-16): the video title and a link, when the artist has a video in today's YouTube US top 30.
- **Optional, also free from data we have:** "#4 on Apple Music US today" when they have a song in the top 100.

## Technical notes

- **Updates:** once a day with the nightly build. Apple's chart also updates daily, so nothing is lost.
- **Apple data** (songs, albums) comes from `data/charts/<date>.json`, which `scripts/fetch-charts.mjs` already collects nightly (US top 100 songs + albums, with genre tags). Add the artwork URL and Apple Music link to the collector; they aren't saved yet.
- **YouTube data must never be committed to the repo.** Git keeps every old version forever, which would break YouTube's 30-day storage limit (Developer Policies III.E.4), and YouTube data may not feed scores or derived metrics (III.E.4.h). So the deploy job fetches the YouTube US Music chart (`videos?chart=mostPopular&regionCode=US&videoCategoryId=10&maxResults=50`, ~30 videos, 1 quota unit) right before `npm run build`, and it only ever exists in the published page. Key: `YOUTUBE_API_KEY` (in `.env` locally, repo secret for Actions; the deploy job will need it passed in).
- **Artist names from YouTube** come from video titles/channels: strip "VEVO" and " - Topic", handle "Artist - Song" vs "SONG - Artists" (Brazilian funk) and lyric re-uploads. Match to Cosignr artists by ID where possible, never by plain name alone (see the Ticketmaster rule in CLAUDE.md).
- **Apple credits** put several artists in one string ("Drake & Don Toliver", "KAROL G, Judeline & rusowsky"); Brazilian duos are one act ("Jorge & Mateus"). Apple gives an artist ID for the first artist only.
- **Scope:** USA only for now (Julian, 2026-10-16); later versions can load by country.

## Added 2026-10-19

- **Climbing (Julian):** ▲/▼/New entry badges on Apple rows and a fourth tab, Climbing (songs released in the last year, ranked by rank ratio since the chart a week earlier). Last.fm US top tracks (listener counts) are collected from 2026-10-19 for real % growth later.

## Decisions (answered by Julian, 2026-10-16)

1. Images: **Apple cover art and YouTube thumbnails approved**, each linking back.
2. Counts: **10 + Show more, up to 25 / 25 / 25.** Changed later the same night: **top 5, then Show More adds 10**, still up to 25.
3. Name: **"Hot Right Now"** (title case, Julian 2026-10-16).
4. Apple chart rank badge on artist pages: **yes.**

## Original questions

1. **Images.** The image rule in CLAUDE.md only allows Wikimedia, Spotify and press kits. Showing Apple cover art and YouTube thumbnails means adding both as approved sources. Both allow showing them as long as each links back (ours would). Alternatives: text-only rows, or the artist's existing Spotify photo where they have a Cosignr page.
2. **Counts:** 10 + Show more up to 50 / 50 / 30, or fewer?
3. **Name:** "What's hot right now", "Hot right now", or something else? Avoid another "Trending", since the section above already uses it.
4. **Apple chart rank badge on artist pages** ("#4 on Apple Music US today"): yes or no? The Trending video badge is already decided.

## Useful references from this session

- Three-source comparison page (USA / Mexico / Brazil, one-off): https://claude.ai/artifact/Hg1M8Z58N3bK6TepbNP7vA
- On 2026-10-16 the US Apple #1 song was Drake & Don Toliver "Solar Eclipse"; YouTube US #1 was Olivia Rodrigo ft. Chappell Roan "expectations"; Justice "Flower In A Hurricane" (ft. Tame Impala…) was in the YouTube top 30 (a roster artist, so a "Trending video" badge example).
