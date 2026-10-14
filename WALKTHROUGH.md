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
                     ├──>  js/app.js  ──>  index.html (Featured, Trending, Top)
data/sources.json  ──┘
```

- **`data/artists.json`** is written by hand. It lists each artist, their IDs on other services, and which artists go in Featured, Trending and Top. Anything fake is kept under a `demo` key so it's easy to find and replace later.
- **`data/sources.json`** is generated, so don't edit it by hand. It holds image links and photo credits for each artist.
- **`js/app.js`** reads both files and builds the page. `index.html` is just the frame.

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

## Common tasks

**Add an artist**
1. Find their IDs. Search Wikidata (it lists Spotify, MusicBrainz and Last.fm IDs). If they aren't there, search MusicBrainz, which usually links to their Spotify page.
2. Add an entry to `artists` in `data/artists.json`, and add their `id` to `featured`, `trending` or `top`.
3. Run `node scripts/fetch-sources.mjs` to fetch their images.

**Add a press photo:** once you have permission, save it as `images/press/<artist-id>.jpg` (e.g. `images/press/g-jones.jpg`) and run the fetch script.

**Fix a bad crop:** add a `focus` override for that source, e.g. `"focus": { "wikimedia": "center 85%" }` (horizontal, vertical).

**Refresh images:** `node scripts/fetch-sources.mjs`. No API keys needed.

## What's next

Milestone 1 replaces the placeholder numbers with real ones: Spotify's 0–100 popularity score and Last.fm listener and play counts. It also starts collecting real cosigns with evidence, and adds a nightly job that refreshes the data automatically. See `PROGRESS.md`.
