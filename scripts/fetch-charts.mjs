#!/usr/bin/env node
// Saves today's charts to data/charts/<date>.json, for real-world "rising" and "trending" lists later
// (Julian, 2026-10-16). Collection only: nothing on the site reads it yet. None of these sources keep
// chart history, so a day that isn't saved is lost for good.
//   lastfmGlobal  Last.fm chart.getTopArtists, top 1000. Numbers: all-time listeners and plays.
//   lastfmUs      Last.fm geo.getTopArtists (United States), top 1000. Number: US listeners this week.
//   appleUsSongs  Apple Music most-played songs, US, top 100 (no key). Mainstream listening. With genre tags.
//   appleUsAlbums Apple Music most-played albums, US, top 100. With genre tags.
// Rank is the position in the list (1 = first). Each chart's row layout is in `fields`.
// Each chart is fetched on its own: one that fails is saved as null (with the reason in `errors`)
// and the rest are still written.
// Caveats:
//   - Last.fm's MusicBrainz IDs aren't checked here: they can point at a namesake or a duplicate page,
//     so verify them (as fetch-stats.mjs does) before showing anyone on the site.
//   - Apple credits several artists in one string ("Drake & Don Toliver"); artistId is the first one.
//     Apple has no global chart, only per country. The feed often times out or returns 502: retry.
//   - Deezer's chart is left out: it depends on where the request comes from. Wikipedia pageviews
//     were tried and dropped (Julian): they measure news attention, not listening.
//
// Usage (from the project root):  node scripts/fetch-charts.mjs   (Last.fm charts need LASTFM_API_KEY)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes)" };
const LASTFM_LIMIT = 1000;
const APPLE_LIMIT = 100; // Apple's maximum

async function loadEnv() {
  try {
    for (const line of (await readFile(path.join(ROOT, ".env"), "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(40_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
}

async function lastfm(params, key) {
  const q = new URLSearchParams({ format: "json", limit: String(LASTFM_LIMIT), api_key: key, ...params });
  const d = await getJson(`https://ws.audioscrobbler.com/2.0/?${q}`);
  if (d.error) throw new Error(d.message);
  return d;
}

const apple = async kind =>
  (await getJson(`https://rss.marketingtools.apple.com/api/v2/us/music/most-played/${APPLE_LIMIT}/${kind}.json`, 5)).feed.results;

// Apple tags every item with genres plus a catch-all "Music"; keep the real ones (Julian: genres come to the site later).
const appleRow = s => [s.name, s.artistName, s.artistId || null, s.releaseDate || null, s.id,
  (s.genres || []).map(g => g.name).filter(g => g && g !== "Music")];

await loadEnv();
const KEY = process.env.LASTFM_API_KEY;
const today = new Date().toISOString().slice(0, 10);

const CHARTS = {
  lastfmGlobal: {
    fields: ["name", "musicbrainz", "listeners (all time)", "plays (all time)"],
    needsKey: true,
    get: async () => (await lastfm({ method: "chart.gettopartists" }, KEY)).artists.artist
      .map(a => [a.name, a.mbid || null, Number(a.listeners), Number(a.playcount)]),
  },
  lastfmUs: {
    fields: ["name", "musicbrainz", "US listeners this week"],
    needsKey: true,
    get: async () => (await lastfm({ method: "geo.gettopartists", country: "united states" }, KEY)).topartists.artist
      .map(a => [a.name, a.mbid || null, Number(a.listeners)]),
  },
  appleUsSongs: {
    fields: ["song", "artist (as credited)", "apple artist id (first artist)", "release date", "apple song id", "genres"],
    get: async () => (await apple("songs")).map(appleRow),
  },
  appleUsAlbums: {
    fields: ["album", "artist (as credited)", "apple artist id (first artist)", "release date", "apple album id", "genres"],
    get: async () => (await apple("albums")).map(appleRow),
  },
};

const out = { date: today, sources: { lastfm: "Last.fm API", apple: "Apple Music RSS (rss.marketingtools.apple.com)" }, fields: {}, errors: {} };
const data = {};
for (const [name, c] of Object.entries(CHARTS)) {
  out.fields[name] = c.fields;
  if (c.needsKey && !KEY) { data[name] = null; out.errors[name] = "no LASTFM_API_KEY"; continue; }
  try { data[name] = await c.get(); }
  catch (err) { data[name] = null; out.errors[name] = err.message; console.warn(`  ! ${name}: ${err.message}`); }
}
if (Object.values(data).every(d => d == null)) {
  console.error("Every chart failed; nothing written");
  process.exit(1);
}

// One row per line keeps daily files readable and git diffs small.
const block = list => list == null ? "null" : `[\n${list.map(r => "    " + JSON.stringify(r)).join(",\n")}\n  ]`;
const json = `{
  "date": ${JSON.stringify(out.date)},
  "sources": ${JSON.stringify(out.sources)},
  "fields": ${JSON.stringify(out.fields)},
  "errors": ${JSON.stringify(out.errors)},
${Object.entries(data).map(([k, v]) => `  ${JSON.stringify(k)}: ${block(v)}`).join(",\n")}
}
`;
JSON.parse(json); // sanity check before writing
await mkdir(path.join(ROOT, "data/charts"), { recursive: true });
await writeFile(path.join(ROOT, `data/charts/${today}.json`), json);
console.log(`Wrote data/charts/${today}.json: ` +
  Object.entries(data).map(([k, v]) => `${k} ${v ? v.length : "FAILED"}`).join(", "));
