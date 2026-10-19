# Cosignr walkthrough

A plain-language guide to how Cosignr works and how it's being built. For status, see `PROGRESS.md`.

## The idea

Cosignr helps you find new music through artists you already like. When an artist **cosigns** another, they publicly vouch for them: they feature them on a track, remix them, bring them on tour, sign them to their label, or shout them out. Cosignr collects those cosigns so that on any artist's page you can see who vouches for them and who they vouch for.

The cosigns on the page are real: each one comes with evidence (a song, a tour, a touring-band spot) and a link to where it was found.

## Running it locally

The site is built with **Astro**, a tool that turns page templates plus our data files into plain HTML. You need Node 22 or newer:

```
cd cosignr
npm install        # once, downloads Astro and React into node_modules/
npm run dev        # open http://localhost:4321/Cosignr/
```

`npm run dev` updates the page as you edit. `npm run build` writes the finished site to `dist/`, which is exactly what GitHub Pages serves.

## How the page is put together

```
data/artists.json  ──┐
data/sources.json  ──┤
data/stats.json    ──┼──>  src/lib/data.js  ──>  src/pages/*.astro  ──>  dist/ (plain HTML)
data/cosigns.json  ──┤        (at build time)
data/tours.json    ──┤
data/upcoming.json ──┘
```

The data files are read **when the site is built**, not in your browser. Visitors download finished HTML, not the 600 KB of cosign data behind it. The nightly job refreshes the data and then rebuilds the site.

- **`data/artists.json`** is written by hand. It lists each artist, their IDs on other services, and which artists go in Featured, Trending and Top. Anything fake is kept under a `demo` key so it's easy to find and replace later.
- **`data/sources.json`** is generated, so don't edit it by hand. It holds image links and photo credits for each artist.
- **`data/stats.json`** is generated too. It holds each artist's real numbers (Deezer fans, Last.fm listeners and plays) and their Cosignr score. Each run also saves a copy of the day's numbers in `data/snapshots/`, so later we can show who is actually rising. Besides the 61 page artists, the snapshot has a `watch` list: Last.fm listeners for every artist our roster cosigned in the last two years (about 90), refreshed every night, so "rising" can include the artists our roster is putting on.
- **`data/cosigns.json`** is generated from MusicBrainz and lists who has vouched for whom, with the songs as evidence (see "Cosigns" below).
- **`data/tours.json`** is generated from Wikipedia and MusicBrainz and lists who took whom on tour, or into their touring band (see "Tours" below).
- **`data/upcoming.json`** is generated from Ticketmaster and lists announced shows with an opener. It's rebuilt nightly.
- **`src/`** holds the site itself. `src/layouts/Base.astro` is the frame every page shares (top bar, nav, footer). `src/pages/index.astro` is the home page. The parts you can click (Trending's sort tabs and search, the login window, the developer panel) are small **React** components in `src/components/`, which Astro calls "islands": the rest of the page is plain HTML with no JavaScript.

Names and details are drawn on top of the photos as text. The 2019 images had text baked into them, which is why their numbers couldn't be fixed.

## Images: the three sources

Using the wrong photos is the fastest way to get a real site into trouble, so every image comes from a source we're allowed to use:

| Source | Coverage | Quality | Rules |
|---|---|---|---|
| **Wikimedia Commons** | 10 of 12 artists | Up to 1280px, real concert photos | Must credit the photographer and license (done automatically) |
| **Spotify** | 12 of 12 | 640px, official artist photos | Must link back to the artist on Spotify |
| **Press kit** | 0 of 12 so far | Best, chosen by the artist | Needs permission. Drop files in `images/press/` |
| *Original (2019)* | 12 of 12 | Low-res, text baked in | Kept only for comparison |

The site shows **Spotify** images by default (consistent, official, covers almost every artist). When an artist has no Spotify photo, the page uses the next best one instead. A few artists Wikidata doesn't know get a hand-checked Wikimedia Commons photo (`commonsPhotos` in `data/artists.json`): Geese, Loathe and Yena so far. **Auto** mode instead uses the best available image for each artist, in the order press kit → Wikimedia → Spotify → original.

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

All three numbers are **career totals**, so the score says how big an artist is overall, not how hot they are right now. Eminem scores 86, above Ye and Kendrick, mostly because of his huge Deezer following, even though he isn't on this week's charts. That's why Trending no longer uses it (see "Trending" below); the score stays on artist pages and in Top.

## Trending

Trending shows **who's big right now**, from real charts, not a hand-picked list (TRENDING.md). Every night `scripts/fetch-trending.mjs` reads the newest charts and writes `data/trending.json`:

- **Apple Music is the main source.** Every lead artist on Apple's US top 100 songs and top 100 albums is in the pool (about 85). Each chart entry earns points for its position (#1 = 100 points, #100 = 1), added up per artist, so one huge hit and a lot of chart entries both count. Old songs still on the chart count too.
- **Last.fm fills the genres Apple barely charts.** Apple's US chart is mostly Hip-Hop and Country, with almost no Rock or Electronic. For any genre with fewer than 5 Apple artists, up to 20 artists are added from Last.fm's US weekly chart. They must pass a **heat check**: this week's US listeners divided by their all-time listeners, times 1,000, must be at least 10. That keeps out bands with a huge steady fanbase (Radiohead scores 7.8) and lets in artists having a moment (Deftones 11.4).
- **One score.** Each source is turned into 0–100 by position within its own list; Last.fm scores count three quarters as much, so Apple leads.
- **"All" shows 20 artists: at most 2 per genre in the top 10, at most 3 per genre overall**, so Hip-Hop and Country don't fill it. Artists without a genre (sleep and white-noise albums chart on Apple because people play them all night) are left out of All but still appear under the Apple Music tab. Picking a genre shows everyone charting in it. The tabs switch between the combined score, Apple only and Last.fm only.

Each row says where its numbers come from ("13 songs · 11 albums in Apple's US top 100 · best #5", or "50k US listeners this week") with a small Apple Music / Last.fm tag. Every charting artist gets a light artist page. The few Apple artists we can't match to MusicBrainz (mostly kids' and sleep albums) show with their album cover, linking to Apple Music. Their cosigns come from all their songs on MusicBrainz (`scripts/fetch-trending-cosigns.mjs`), the same way as our 12 roster artists, except remixes and covers aren't counted for them yet.

The old hand-picked lists (the six Trending artists, five picks per genre, and the 19 "curated" artists) are kept under `demo` in `data/artists.json` and in the git tag `demo-12-artists`, in case we want to rebuild the original demo page.

The list shows the top 5; each "Show More" adds 10. On smaller screens, where the number column is hidden, the Trending score appears as a peach badge on the photo's top-left corner, and on phones the chart summary moves under the photo.

If a number is known to be wrong for an artist, it's listed under `caveats` in `artists.json` and left out. Example: Deezer's "Jackal" page mixes several artists with that name, so his fan count isn't used and he shows "No reliable data yet".

## Cosigns

A cosign is one artist publicly vouching for another. They come from MusicBrainz, the free, open music database, which records who appears on each song:

- **Feature:** "Chance the Rapper feat. Saba" means Chance cosigned Saba, because he chose to put Saba on his song.
- **Remix:** if Jackal remixed a Diplo song, Diplo cosigned Jackal (official remixes are approved by the original artist).
- **Collab:** "Saba & No I.D." counts both ways.

All songs between the same two artists are grouped into one cosign. The "Cosigned by" chips show each artist's top four, **most famous cosigner first**, using Last.fm listener counts. A feature from Ye counts for more than ten songs with an unknown local act. Ties go to whoever has more features and remixes together. Hover a chip to see the song behind it.

Some things are filtered out because they aren't real cosigns:
- **Bootlegs and fan-made songs.** Only songs on an official release count, so a 2010 fan mashup tape doesn't make Coldplay a Drake cosigner.
- **Posthumous releases.** A song released after the cosigner died (or after a band split up) doesn't count. A cosign means the artist vouched personally, not their estate.
- **DJ mixes and mashups**, which list everyone sampled.
- **Band members** "cosigning" their own band.

Run it with `node scripts/fetch-cosigns.mjs`. It takes about 7 minutes, because MusicBrainz only allows one request per second. Death and breakup dates are saved in `data/cache/`, so only the first run is slower.

Fame comes from Last.fm and is looked up by `fetch-stats.mjs`, so run that after the cosigns script. If Last.fm's page might belong to a different artist with the same name, that cosigner is treated as unknown and ranks lower, which is better than ranking them wrongly.

### Tours

Taking an artist on tour as your opener is a cosign too: the headliner chose them. `node scripts/fetch-tours.mjs` finds these in two places:

- **Wikipedia tour articles.** The info box on a tour's article lists its support acts (Travis Scott's Circus Maximus Tour: Teezo Touchdown, Don Toliver, Yung Lean…). Only names that link to their own article count, and each is matched to MusicBrainz through Wikidata, so a different artist with the same name can't sneak in. Every tour links back to its article, as Wikipedia's license asks.
- **Tours where our artists opened.** These live on the headliner's article (Kanye West's Yeezus Tour lists Travis Scott), so the script also reads every Wikipedia article with "tour" in its title that links to one of our artists.
- **MusicBrainz concerts.** Some shows list a "support act" (Porter Robinson's Smile! :D World Tour: ericdoa, underscores). Festivals are skipped, because there everyone on the bill gets labelled "support".

One tour counts as one cosign, however many nights the opener played. Co-headliners and band members don't count. Touring musicians of a solo project do: Tame Impala is really one person, Kevin Parker, so someone he picks to play in his live band, or to open, is someone he vouches for. Hover a chip to see the tour. Results are saved in `data/tours.json`, and the page merges them with the song cosigns, so a pair with both a tour and songs is one chip.

**Touring bands** count too: if an artist hires someone to play in their live band (Tame Impala → Jay Watson), that's a vouch. These come from MusicBrainz.

**Upcoming shows** come from Ticketmaster (`node scripts/fetch-upcoming.mjs`, needs `TICKETMASTER_API_KEY`). Hover text reads "Opening for Tame Impala: Deadbeat Tour, next show…". Ticketmaster only lets us keep its data for a short time, so the file is rebuilt every night and a show disappears once it has happened. Artists are matched by their MusicBrainz or Spotify ID, never by name, because a name search for "Saba" returns Sabaton. Festivals and tribute nights ("Drake vs Bad Bunny Dance Night") are skipped.

Not covered yet: shout-outs and label signings, which will come from a hand-curated file.

## Hometowns

"Hometown" means where an artist was born, or where a band formed. Hometowns typed into `artists.json` are used first. For anyone left blank, `node scripts/fetch-profiles.mjs` fills it from MusicBrainz: birthplace or formation place first, then where they're based. A country on its own is fine. On the page, both kinds look the same.

The script also prints any artist whose typed hometown differs from MusicBrainz, so you can decide which is right.

## Artist pages

Every artist with a page lives at `/Cosignr/artist/<id>/`, for example `/Cosignr/artist/travis-scott/`. A page shows:
- **Photo and numbers:** genre, hometown, Cosignr score, Last.fm listeners and plays, Deezer fans. A faded number is left out of the score; hover it to see why. Plus a Spotify button.
- **Upcoming shows** from Ticketmaster, when there are any. Shows disappear once they've happened.
- **Cosigns:** everyone this artist vouched for, sorted by **Strongest** (most vouches), **Recent** or **Famous**.
- **Cosigned by:** everyone who vouched for this artist, most famous first by default, with the same Strongest / Recent / Famous tabs. Each row says what happened ("Took Travis Scott on tour: Anti World Tour (2016)") and links to where we found it.

On desktop the two lists sit side by side (Cosigns on the left). On screens narrower than 900px they stack, Cosigns first.

Each list shows 10 at first. "Show more" adds 10 at a time. The full list is a separate small file that only downloads when you ask for more, so pages stay quick even for Drake (about 200 cosigns each way).

Names link to that artist's Cosignr page if they have one. Otherwise they link to MusicBrainz (dotted underline). On the home page, clicking a Featured tile, an artist's name or a cosigner chip opens that artist's page.

## Who gets an artist page

That's our 12 hand-picked artists, the **top 5 cosigners of each** (like Rihanna, Ye, Gorillaz, Skrillex and Florence + the Machine), **everyone in Trending** (about 120 artists charting now), and **everyone in Rising plus the big artists who cosigned them** (so a "Cosigned by Gunna" chip leads to a real page). Pages are kept when an artist drops off the charts.

`node scripts/fetch-extended.mjs` picks them every night. It uses the same ranking as the "Cosigned by" chips, so the list can change as new cosigns appear, and it saves the list to `data/extended.json`. It also finds each artist's Wikidata, Spotify and Deezer pages through MusicBrainz, so the other scripts can fetch their photo, numbers, hometown and genre like they do for our 12.

These are **light pages**. They show what we know about the artist plus the cosigns they share with our 12 (Rihanna → Travis Scott, Drake), and for Trending artists, everyone they featured or were featured by across their whole career. We don't download whole catalogues, because superstar catalogues would make the nightly job hours long.

Some safety checks:
- **Duplicate pages.** Spotify and Deezer have empty leftover pages for some artists (Beyoncé, Daft Punk), so the script tries each link and keeps the one with a photo or albums.
- **Suspicious Deezer counts.** If a Deezer page has fewer than 1 fan per 100 Last.fm listeners (Skrillex shows 0), it's probably a leftover page, so it's left out of the score.
- **Last.fm names.** Last.fm pages are matched the careful way: "Ye" must land on Kanye West's page, not a smaller artist called Ye.
- **Genre.** For these artists, genre is MusicBrainz's most-voted genre tag, so it can be quirky (Skrillex: "Brostep"). Our 12 keep their hand-written genres.

## Genres

A thin white bar under the nav (it stays on screen with the nav as you scroll) lets visitors pick a genre: All, Hip-Hop, Pop, R&B, Indie, Electronic, Rock, Country or Latin. Picking one filters Trending, Rising, Hot Right Now and Most Cosigned (Featured stays as it is), scrolls down to Trending ("All" goes back up to Featured), and adds `?genre=hip-hop` to the address so the view can be shared.

Artists' genres are detailed ("Brostep", "Emo Rap", "Indie Pop"), so each one is folded into one of the eight groups by a short list of rules in `src/lib/shared.js`. The first rule that matches wins, which is why "Indie Pop" counts as Indie and "Emo Rap" as Hip-Hop. Chart songs use Apple's genre tag. YouTube doesn't give genres, so a video only has one when it's by an artist with a Cosignr page; most videos disappear when a genre is picked.

**Trending by genre.** Picking a genre shows every Trending artist in it, ranked within the genre. Genres Apple barely charts (Rock, Electronic) are filled from Last.fm, so every genre has something to show.

## Rising

Under Trending, **Rising** shows artists on the way up. Like other "rising" charts it's driven by what's climbing right now; Cosignr adds artists the big names have vouched for. `scripts/fetch-rising.mjs` builds it every night from data we already collect.

**Who can be in it** (anyone with at least 5,000 Last.fm listeners who fits one of these):
- **New:** their first release was in the last five years, however big they've got (ADÉLA, Sienna Spiro).
- **Little-known:** fewer than 150,000 listeners, however long they've been around (Belly Gang Kushington).
- **Breaking out:** on the charts right now with high **heat**, under two million listeners, and a first release in the last 12 years (Ella Langley, underscores).

**Heat Score** is this week's US listeners per 1,000 all-time listeners on Last.fm. A band with a big, steady fanbase scores low (Morgan Wallen about 8); an artist having a moment scores high (ADÉLA about 50). It's shown on each row.

**How they're ranked:** anyone on **Apple's US top 100** comes first, then anyone on **Last.fm's US top tracks**, then everyone else. Within each group, chart position counts most, then cosigns from big artists in the last year (any artist with over a million listeners counts as big, and Apple's own song credits count as proof of a collab), then heat or listener growth.

Each row's number is the **Rising Score**. The top artist in "All" always shows 9.9 and everyone else is shifted by the same amount, so the gaps between artists stay the same. It only orders artists within their group (Apple chart, Last.fm chart, everyone else). The facts behind it (chart positions, Heat Score, cosigns) are in the row itself.

Rising artists and the big artists who cosigned them get light artist pages. Listener growth will matter more once a week or two of daily numbers have built up.

## Most Cosigned

The light-blue band at the bottom shows the **three most cosigned artists**: the ones the most different artists have vouched for (features, collabs, tours, touring band, announced support slots). It follows the genre bar, so Pop shows the three most cosigned pop artists, and a toggle switches between **All time** (default) and **This year** (the last 12 months). Only artists whose whole catalogue we've read can rank (our 12 plus everyone currently charting), since the others would be undercounted. Cast albums and soundtracks don't count: every cast member gets credited with the composer, which once made Lin-Manuel Miranda the fourth most cosigned artist. (This replaced a hand-picked list from the 2019 mockup that claimed to be "the most cosigned of all time".)

## Hot Right Now

The home section under Trending shows what the US is playing today, in three tabs: **Songs** and **Albums** (Apple Music's most played, from the newest `data/charts/` file) and **Videos** (YouTube's US music chart). The top 5 show first; "Show More" adds 10 at a time, up to 25. Each row has the cover art or thumbnail, a genre tag (Apple), a "New" tag for anything released in the last week, and a link back to Apple Music or YouTube. Their terms allow showing the images only with that link. Rows and cover art are the same size as the Trending rows above; video thumbnails keep their wide shape.

**Matching chart entries to our artists.** Names alone aren't safe, because many artists share a name. So `fetch-profiles.mjs` saves each page artist's Apple Music artist ID and YouTube channel IDs (from MusicBrainz links and Wikidata), and a chart entry links to an artist page only when the ID matches. Apple gives an ID only for the first credited artist, and YouTube only for the channel. Anyone else in the credit or title counts only if they're someone that artist already has a cosign with. That's also when the row gets a cosign marker, like "Drake × Don Toliver: cosign".

**Why YouTube is different.** YouTube's rules forbid keeping its data longer than 30 days, and git keeps everything forever. So `scripts/fetch-youtube.mjs` runs inside the deploy job just before the build, writes `data/live/youtube.json` (git-ignored), and the data only ever exists in the published page. Without the `YOUTUBE_API_KEY` secret, the Videos tab is simply hidden.

**Climbing.** Songs and albums from Apple show how far they've moved: "▲ 83" (green) or "▼ 21" (red) under the rank, or "New entry", compared with Apple's chart a week earlier (or the oldest one we have, since collecting only started on October 16). The **Climbing** tab ranks songs from the last year by how far they rose, measured as a ratio so a jump from #89 to #6 (15×) beats one from #7 to #2 (3.5×). Old favourites re-entering the chart (Thriller in October, Mr. Brightside) are left out.

Apple only publishes ranks, not play counts, so these are moves, not percentages. Since October 19 we also save Last.fm's US top tracks, which do include listener counts, so real "+38% listeners this week" numbers per song become possible once a couple of weekly updates have built up.

**Artist page badges.** When an artist has a song in Apple Music's US top 100, their page says "#4 on Apple Music US today: <song>". When they're in YouTube's chart, it shows "Trending video" with the video's title.

## Common tasks

**Add an artist**
1. Find their IDs. Search Wikidata (it lists Spotify, MusicBrainz and Last.fm IDs). If they aren't there, search MusicBrainz, which usually links to their Spotify page.
2. Add an entry to `artists` in `data/artists.json`, and add their `id` to `featured`, `trending` or `top`.
3. Run `node scripts/fetch-sources.mjs` to fetch their images, `node scripts/fetch-stats.mjs` to fetch their numbers, `node scripts/fetch-cosigns.mjs` to fetch their cosigns, `node scripts/fetch-tours.mjs` and `node scripts/fetch-upcoming.mjs` to fetch their tours and `node scripts/fetch-profiles.mjs` to fill their hometown. Also add their Deezer ID: search `https://api.deezer.com/search/artist?q=<name>` and check the albums match. MusicBrainz sometimes links to an empty duplicate page.

**Add a press photo:** once you have permission, save it as `images/press/<artist-id>.jpg` (e.g. `images/press/g-jones.jpg`) and run the fetch script.

**Fix a bad crop:** add a `focus` override for that source, e.g. `"focus": { "wikimedia": "center 85%" }` (horizontal, vertical).

**Refresh images:** `node scripts/fetch-sources.mjs`. No API keys needed.

**Refresh stats:** `node scripts/fetch-stats.mjs`. Works without keys (Deezer only). For Last.fm, create a free API account at https://www.last.fm/api/account/create and put the key in a `.env` file in the project root: `LASTFM_API_KEY=...`. `.env` is git-ignored, so it is never committed.

**Real-world charts:** `node scripts/fetch-charts.mjs` saves the day's Last.fm top 1,000 artists and top 1,000 tracks (worldwide and in the US; tracks since October 19) and Apple Music's top 100 songs and albums in the US to `data/charts/<date>.json`. Last.fm leans toward indie and alternative listeners; Apple Music shows what the mainstream is playing. The "Hot Right Now" section reads the newest file's Apple charts. The rest is there so that later we can spot artists climbing the charts in the real world, not just among the artists we already track. Neither source keeps old charts, so the only way to have history is to save it every day. Two limits worth knowing: Apple's chart is one overall US top 100 (songs and albums), with no per-genre charts, which is why Rock and Electronic are thin there. An older iTunes feed does have per-genre charts, but it ranks downloads rather than streams, so we left it out (2026-10-19) and let Last.fm fill those genres instead. Last.fm's track charts have listener counts but no genres, so a song takes its artist's Last.fm tags. If one chart fails on a given night, the others are still saved.

**Nightly refresh and deploy:** `.github/workflows/site.yml` runs all the fetch scripts every day around 06:17 UTC (except YouTube: the publish step fetches its chart just before building, and needs the `YOUTUBE_API_KEY` repository secret; see "Hot Right Now") (GitHub often starts it late), commits any changes to `data/`, then publishes the site to https://julianreyes.dev/Cosignr/ (the github.io address redirects there). Every push to `main` also republishes (without refreshing data). Because the bot commits to GitHub every night, run `git pull` before you start editing. To include Last.fm, add the key as a repository secret called `LASTFM_API_KEY` (GitHub → Settings → Secrets and variables → Actions). You can also start it by hand from the Actions tab ("Run workflow").

## What's next

Next: let listener growth count properly in Rising once a week or two of daily numbers exist (around October 26), fix the Top Artists label (it's still a hand-picked list described as "most cosigned"), then accounts and real user cosigns, and the "who cosigned who" graph. See `PROGRESS.md`.
