# Cosignr walkthrough

A plain-language guide to how Cosignr works and how it's being built. For status, see `PROGRESS.md`.

## The idea

Cosignr helps you find new music through artists you already like. When an artist **cosigns** another, they publicly vouch for them: they feature them on a track, remix them, bring them on tour, sign them to their label, or shout them out. Cosignr collects those cosigns so that on any artist's page you can see who vouches for them and who they vouch for.

Today the cosigns on the page are placeholders. Making them real (with a link to the evidence for each one) is part of Milestone 1.

## Running it locally

The page loads its data with `fetch()`, which browsers block when you double-click an HTML file. Run a tiny local server instead:

```
cd cosignr
python3 -m http.server 8000
```

Then open http://localhost:8000. On GitHub Pages it just works.

## How the page is put together

```
data/artists.json  ──┐
data/sources.json  ──┼──>  js/app.js  ──>  index.html (Featured, Trending, Top)
data/stats.json    ──┤
data/cosigns.json  ──┘
```

- **`data/artists.json`** is written by hand. It lists each artist, their IDs on other services, and which artists go in Featured, Trending and Top. Anything fake is kept under a `demo` key so it's easy to find and replace later.
- **`data/sources.json`** is generated, so don't edit it by hand. It holds image links and photo credits for each artist.
- **`data/stats.json`** is generated too. It holds each artist's real numbers (Deezer fans, Last.fm listeners and plays) and their Cosignr score. Each run also saves a copy of the day's numbers in `data/snapshots/`, so later we can show who is actually rising.
- **`data/cosigns.json`** is generated from MusicBrainz and lists who has vouched for whom, with the songs as evidence (see "Cosigns" below).
- **`js/app.js`** reads all of these and builds the page. `index.html` is just the frame.

Names and details are drawn on top of the photos as text. The 2019 images had text baked into them, which is why their numbers couldn't be fixed.

## Images: the three sources

Using the wrong photos is the fastest way to get a real site into trouble, so every image comes from a source we're allowed to use:

| Source | Coverage | Quality | Rules |
|---|---|---|---|
| **Wikimedia Commons** | 10 of 12 artists | Up to 1280px, real concert photos | Must credit the photographer and license (done automatically) |
| **Spotify** | 12 of 12 | 640px, official artist photos | Must link back to the artist on Spotify |
| **Press kit** | 0 of 12 so far | Best, chosen by the artist | Needs permission. Drop files in `images/press/` |
| *Original (2019)* | 12 of 12 | Low-res, text baked in | Kept only for comparison |

The site shows **Spotify** images by default (consistent, official, covers every artist). **Auto** mode instead uses the best available image for each artist, in the order press kit → Wikimedia → Spotify → original.

### Comparing them (developer panel)

- Press **Shift + D** on the page, or add `?dev` to the URL.
- Pick a source. Artists with no image from that source show their initials and a "No … image" tag, so you can see the gaps.
- Each option shows its coverage (e.g. "10/12"). Your choice is remembered in that browser.
- To share a specific view, use a link like `?dev&src=wikimedia` or `?src=spotify`.

## Stats and the Cosignr score

Spotify stopped giving popularity and follower counts to new apps in February 2026, so the numbers come from free sources instead:

- **Deezer fans** (no key needed). Deezer is strongest in Europe, so US and underground artists look smaller there than they really are.
- **Last.fm listeners and plays** (needs a free API key, see below). Skipped if there's no key.

The **Cosignr score (0–100)** blends these. Each number is put on a log scale (so 1k → 10k counts as much as 1M → 10M) against fixed ranges, then averaged. Because the ranges are fixed, an artist's score doesn't change just because we add someone bigger. With both sources, scores currently run from 32 (G Jones, Jaws) to 89 (Drake). Last.fm pulls up the US and underground artists that Deezer undercounts: G Jones was 5 on Deezer alone.

The Trending list ranks by score by default. The "Sort by" tabs switch between whichever numbers exist (Score, Fans, and later Listeners and Plays). The old Now / This Week / Month / Year tabs are gone because they showed made-up numbers. Real "rising this week" rankings come back once enough daily snapshots have built up.

If a number is known to be wrong for an artist, it's listed under `caveats` in `artists.json` and left out. Example: Deezer's "Jackal" page mixes several artists with that name, so his fan count isn't used and he shows "No reliable data yet".

## Cosigns

A cosign is one artist publicly vouching for another. They come from MusicBrainz, the free, open music database, which records who appears on each song:

- **Feature:** "Chance the Rapper feat. Saba" means Chance cosigned Saba, because he chose to put Saba on his song.
- **Remix:** if Jackal remixed a Diplo song, Diplo cosigned Jackal (official remixes are approved by the original artist).
- **Collab:** "Saba & No I.D." counts both ways.

All songs between the same two artists are grouped into one cosign. The "Cosigned by" chips show each artist's strongest four. Features and remixes rank above plain collabs, because collabs are often old duo partners or joint albums rather than vouching. Hover a chip to see the song behind it.

Some things are filtered out because MusicBrainz credits them in ways that aren't cosigns: DJ mixes and mashups (which list everyone sampled), and band members "cosigning" their own band. Run it with `node scripts/fetch-cosigns.mjs`. It takes about 3 minutes, because MusicBrainz only allows one request per second.

Not covered yet: shout-outs, tour support and label signings. These will come from a hand-curated file and Setlist.fm.

## Common tasks

**Add an artist**
1. Find their IDs. Search Wikidata (it lists Spotify, MusicBrainz and Last.fm IDs). If they aren't there, search MusicBrainz, which usually links to their Spotify page.
2. Add an entry to `artists` in `data/artists.json`, and add their `id` to `featured`, `trending` or `top`.
3. Run `node scripts/fetch-sources.mjs` to fetch their images, `node scripts/fetch-stats.mjs` to fetch their numbers and `node scripts/fetch-cosigns.mjs` to fetch their cosigns. Also add their Deezer ID: search `https://api.deezer.com/search/artist?q=<name>` and check the albums match. MusicBrainz sometimes links to an empty duplicate page.

**Add a press photo:** once you have permission, save it as `images/press/<artist-id>.jpg` (e.g. `images/press/g-jones.jpg`) and run the fetch script.

**Fix a bad crop:** add a `focus` override for that source, e.g. `"focus": { "wikimedia": "center 85%" }` (horizontal, vertical).

**Refresh images:** `node scripts/fetch-sources.mjs`. No API keys needed.

**Refresh stats:** `node scripts/fetch-stats.mjs`. Works without keys (Deezer only). For Last.fm, create a free API account at https://www.last.fm/api/account/create and put the key in a `.env` file in the project root: `LASTFM_API_KEY=...`. `.env` is git-ignored, so it is never committed.

**Nightly refresh:** `.github/workflows/refresh-data.yml` runs all three scripts every day at 06:17 UTC and commits any changes to `data/`. To include Last.fm, add the key as a repository secret called `LASTFM_API_KEY` (GitHub → Settings → Secrets and variables → Actions). You can also start it by hand from the Actions tab ("Run workflow").

## What's next

The rest of Milestone 1: hand-curated cosigns and tour support, real "rising" rankings from the daily snapshots, publishing the site, then accounts, artist pages and the "who cosigned who" graph. See `PROGRESS.md`.
