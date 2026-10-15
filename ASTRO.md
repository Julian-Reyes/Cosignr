# Plan: move to Astro, then artist pages (step 9)

Approved by Julian on 2026-10-15. Status of each phase is tracked in PROGRESS.md.

## Context
Cosignr is one static page (`index.html` + `js/app.js` + `home.css`) that downloads all data JSON in the browser (cosigns.json alone is 624 KB). Artist pages need real URLs, per-artist data and shared layout, so we agreed (2026-10-15) to move to **Astro with React islands** first, still static on GitHub Pages. Step 9 then adds artist pages, where most tour cosigns finally show (Travis → Teezo Touchdown).

Julian's decisions for step 9:
- Pages for our 12 + the **top 5 cosigners of each** (by fame, as the chips rank them) = **61 pages** (49 extra: Rihanna, Ye, The Weeknd, Kendrick, Gorillaz, Daft Punk, Skrillex, J. Cole, Lady Gaga, Eminem, Beyoncé…). "Still a demo; hundreds/thousands later."
- Extra 49 are **light pages**: photo, stats, hometown, upcoming shows, and the cosigns we already have (links with our 12). No new MusicBrainz catalog crawl.
- Page shows: **Cosigned by** (full list), **Cosigns** (outbound), **stats + score**, **upcoming shows**.
- Outbound sort tabs **Strongest (default) / Recent / Famous**.
- Lists show **10, then "Show more" adds 10**, so pages don't load everything at once.

Work in three phases, checking in with Julian (screenshots) after each before committing.

---

## Phase A: Astro port with the same look (no new features)

**Setup** (Astro 7 needs Node 22.12+, so CI moves from Node 20 to 22; local is Node 24. Plain JS/JSX, no TypeScript, to match the repo):
- `package.json` with exact pinned versions at least two weeks old: `astro` 7.3.5, `@astrojs/react` 7.0.0, `react` and `react-dom` 19.2.8. Scripts: `dev`, `build`, `preview`. Commit `package-lock.json`; add `node_modules/`, `dist/`, `.astro/` to `.gitignore`.
- `astro.config.mjs`: `site: "https://julian-reyes.github.io"`, `base: "/Cosignr"`, `output: "static"`, React integration. All internal links use `import.meta.env.BASE_URL`.

**Layout**
```
src/
  layouts/Base.astro        <head>, fonts, SVG icon sprite, topbar, nav, footer, auth modal, toast, dev panel
  pages/index.astro         Featured, Trending, Top (same markup/classes as index.html)
  lib/data.js               Build-time loading of data/*.json + merge logic (ported from app.js)
  components/*.astro        Static pieces: FeaturedGallery, TopGrid, ArtistImage, Credit, Chips
  components/*.jsx          Islands: TrendingList (tabs, search, show more, chip click, demo Cosign button),
                            AuthModal, DevPanel; Toast as a tiny shared helper
  styles/home.css           moved from root, unchanged
public/                     images/, root *.png mockup images, favicon
data/, scripts/             stay where they are; scripts unchanged
```
- **Reuse, don't rewrite:** move `buildCosignedBy`, `cosignTitle`, `metricValue`, `hometown`, `pickImage`/`sourceFor`, `fmt`, `initials` from `js/app.js` into `src/lib/data.js` (build time) and a small `src/lib/shared.js` for the few needed in islands. Astro escapes `{}` output by default, which replaces `esc()` in templates; keep `esc()` only where HTML strings are built by hand.
- **Data moves to build time.** Pages import JSON at build; the browser no longer downloads `cosigns.json`/`stats.json`. Islands get only small props (trending rows with their 4 chips + hover text).
- **Header search ↔ Trending island:** the search box dispatches a `cosignr:search` window event; the Trending island listens. On artist pages, submitting search goes to the home page with `?q=`.
- **Dev panel image toggle:** images render the default source (Spotify) at build; each `<img>` carries its alternative source URLs in a `data-sources` attribute, and the DevPanel island swaps them client-side (`?src=` and Shift+D still work).
- Delete `index.html` and `js/app.js` once the Astro page matches. `indexOld.html` stays untouched (not deployed).

**Workflow** (`.github/workflows/site.yml`): refresh job unchanged. Deploy job: `actions/setup-node` → `npm ci` → `npm run build` → upload `dist/` (replaces the "Collect site files" copy step). Nightly data commits still trigger a rebuild because deploy runs after refresh.

**Verify A:** `npm run build` passes; `npm run preview` → `http://localhost:4321/Cosignr/`. Headless Chrome screenshots before (current site) and after, desktop 1280px and phone 390px; compare side by side. Click-test: sort tabs, search, chip click, show more, modal, toast, Shift+D image switch. Check `dist/` has no `data/*.json`. Then show Julian, commit, push, confirm Pages deploy.

---

## Phase B: data for the 49 extra artists

**Status:** Phase A done and live (582b3cc, 2026-10-15). Phase B built 2026-10-15 (results in PROGRESS.md).

**What happened when it ran** (problems found and fixed):
- Spotify and Deezer both have empty duplicate pages. Beyoncé's first Spotify link had no photo; Daft Punk, Kygo and FERG's Deezer links had no albums. The script now tries every link from MusicBrainz and Wikidata and keeps the first real one.
- Some Deezer pages still had implausible counts (Skrillex 0 fans, Metric 623, TEED 6, JID 3,670), probably leftover pages. Rule: under 1 Deezer fan per 100 Last.fm listeners → automatic caveat, Deezer left out of the score (Last.fm only).
- Last.fm by plain name can hit the wrong artist ("Ye" is a smaller artist; Kanye West's page has 8.2M listeners). Extended artists now use the same verified lookup as cosigner fame (MusicBrainz ID, name, aliases), cached a week.
- Genre comes from MusicBrainz's most-voted tag, so it can be quirky (Skrillex: "Brostep"); Rihanna: Pop, Gorillaz: Electronic.
- Julian reviewed: Gorillaz = Essex, UK is fine; quirky genres stay for now.


**In plain words:** artist pages will cover our 12 plus the top 5 cosigners of each (Rihanna, Ye, The Weeknd, Kendrick, Gorillaz, Daft Punk, Skrillex, J. Cole, Lady Gaga, Eminem, Beyoncé…). Today we only have photos, stats and hometowns for our 12. Phase B fetches those for the 49 too, so their pages aren't empty. Nothing new shows on the site yet; that's Phase C.

1. **A new script makes the list.** `fetch-extended.mjs` works out each roster artist's top 5 cosigners nightly (same ranking as the chips) and saves them to `data/extended.json`. Generated, not hand-edited, because the list can change as data changes.
2. **It finds their IDs on other services** (Wikidata, Spotify, Deezer) from MusicBrainz, the same way we found IDs for our 12. About 50 requests, ~1 minute.
3. **The existing scripts include them:** photos (Spotify + Wikimedia, same licensing rules), hometown (MusicBrainz), genre (MusicBrainz genre tags; blank if none, never guessed), stats and score (Last.fm; Deezer fans only if the Deezer page checks out by having albums, otherwise the score uses Last.fm alone), upcoming shows (Ticketmaster, ID matching only).
4. **Fame for the "Famous" sort:** Last.fm numbers for ~380 more artists (everyone our 12 cosigned), one-time few minutes, then cached a week.
5. **Not done:** no crawl of their own song/tour history. Light pages only show cosigns we already have (links with our 12), as Julian chose.

Spot-check before showing Julian: Rihanna, Ye, Gorillaz, Skrillex, Florence + the Machine (photo, hometown, numbers).

**Technical details:**

- **New `scripts/fetch-extended.mjs` → `data/extended.json`** (generated, rebuilt nightly): take each roster artist's top 5 cosigners (same ranking as the chips: fame, vouches, songs, last; from cosigns.json + tours.json + stats.json fame), dedupe, give each a slug id (collision with roster → suffix). Resolve IDs from MusicBrainz `url-rels` (Wikidata, Spotify, Deezer links) via `scripts/lib/musicbrainz.mjs`; Last.fm name from the existing fame lookup. ~50 MusicBrainz requests (~1 min).
- **Existing scripts read roster + extended** (one helper, e.g. `scripts/lib/artists.mjs` → `loadArtists({ extended: true })`):
  - `fetch-sources.mjs`: Spotify + Wikimedia images (licensing rules unchanged).
  - `fetch-profiles.mjs`: hometown, plus **genre from MusicBrainz genres** (top-voted), since extras have no hand-written genre. Never guessed; null if none.
  - `fetch-stats.mjs`: Deezer only if the ID came from MusicBrainz/Wikidata **and** the page has albums (CLAUDE.md rule); otherwise score uses Last.fm only. Also fetch **fame for outbound cosignees** (~380 not yet cached; one-time few minutes, then cached 7 days) for the "Famous" sort. Keep the `cosigners` key but document it as "fame of any linked artist".
  - `fetch-upcoming.mjs`: also look up the extras (same ID-only matching).
  - `fetch-cosigns.mjs` / `fetch-tours.mjs`: **unchanged** (light pages).
- Workflow order: sources → cosigns → tours → **extended** → upcoming → profiles → stats.

**Verify B:** run each script; spot-check 5 extras (Rihanna, Ye, Gorillaz, Skrillex, Florence) for correct Spotify/Wikidata IDs, image credit, hometown, Last.fm numbers; nightly runtime still ~15 min.

---

## Phase C: artist pages

- **Route `src/pages/artist/[id].astro`** with `getStaticPaths()` over roster + extended → `/Cosignr/artist/travis-scott/`. Also **`src/pages/artist/[id].json.js`** emitting that artist's full Cosigned-by and Cosigns lists, fetched only on "Show more" or a non-default sort (this also does the PROGRESS item "split cosigns.json per artist").
- **Page sections** (existing look: blue top bar, dark nav, peach/blue chips, Nunito):
  1. **Header:** photo + credit, name, genre · hometown, Cosignr score + Last.fm listeners/plays + Deezer fans (same caveat handling as Trending), "Listen on Spotify".
  2. **Upcoming shows** (if any): "Opening for X" / "X opens", tour, next date + city, link to Ticketmaster; hidden once past (build-time filter + client check).
  3. **Cosigned by:** ranked as today (fame, vouches, songs, recent). Each row: name (link to their page if they have one, else MusicBrainz), type badges (feature, remix, collab, tour, band, upcoming), and visible evidence lines with links (song → MusicBrainz, tour → Wikipedia/MusicBrainz).
  4. **Cosigns (who they vouch for):** same row design. Tabs **Strongest** (default: vouches, then most recent) / **Recent** / **Famous**.
  - Both lists: first **10** in the HTML; **Show more** loads the per-artist JSON once and adds 10 at a time (React island `CosignList.jsx`).
  - Extras show a note: "Only cosigns involving artists Cosignr tracks so far."
- **Links in:** Featured tiles, Trending names, Top cards and chips link to artist pages when one exists.
- **Footer "Data sources":** MusicBrainz (CC0), Wikipedia (CC BY-SA, linked per tour), Last.fm, Deezer, Ticketmaster, plus photo credits as today.
- Build-time merge for both directions reuses `buildCosignedBy` from Phase A, generalised to `buildCosigns(direction)`.

**Verify C:** build; open Travis (Cosigns shows Teezo Touchdown with tour + songs; Cosigned by shows Ye/Rihanna/Kendrick tours), Tame Impala (Wet Leg upcoming; Jay Watson band), Saba (Future tour), an extra (Rihanna light page + note), Jaws (empty states). Show more adds 10; tabs re-sort; phone width has no horizontal scroll; page weight checked (HTML + first JSON). Screenshots to Julian, then commit and push.

---

## Docs (each phase)
- **CLAUDE.md:** layout (src/, public/, package.json), "Running it" (`npm install`, `npm run dev`, `npm run build`), remove "no build step", note `base: /Cosignr` and BASE_URL links, extended.json, artist pages, the 10-at-a-time rule.
- **WALKTHROUGH.md:** how the site is built now (Astro, data read at build time), artist pages, who gets a page and why.
- **PROGRESS.md:** tick Astro move, artist detail page, split cosigns per artist; log entries.
