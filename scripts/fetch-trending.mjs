#!/usr/bin/env node
// Builds data/trending.json: who is big right now, from real current data (plan in TRENDING.md,
// Julian 2026-10-19). Replaces the hand-picked Trending lists.
//   Apple Music  the main source. Every lead artist on the newest US most-played top 100 songs + albums
//                (data/charts/, from fetch-charts.mjs). Points: 101 − rank per entry, summed.
//   Last.fm      fills thin genres (fewer than THIN Apple artists): up to FILL artists per thin genre from
//                the Last.fm US weekly chart whose heat ratio (US listeners this week ÷ all-time listeners
//                × 1000) is at least MIN_RATIO, which keeps steady catalog acts (Radiohead 7.8) out.
// Each source is turned into 0–100 by percentile within its own list; Last.fm scores are weighted by
// LASTFM_WEIGHT so Apple leads (Julian: Apple "seems way more real").
//
// Artists are matched by ID, never by name alone:
//   Apple ID → MusicBrainz: page artists' IDs (profiles.json), then Wikidata P2850, then a MusicBrainz
//   URL lookup. Cached in data/cache/apple-mbid.json. Unresolved artists are kept, name only.
//   Last.fm rows carry a MusicBrainz ID; it counts only if Last.fm's page name for that ID matches the
//   chart name and MusicBrainz's name matches too (Last.fm merges namesakes, see CLAUDE.md).
// Genre: Apple tags (most common across the artist's entries); Last.fm: our genre for page artists,
// else Last.fm tags. Both folded into the genre bar's groups with genreGroup().
//
// Usage (from the project root):  node scripts/fetch-trending.mjs   (Last.fm fill needs LASTFM_API_KEY)

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { loadArtists } from "./lib/artists.mjs";
import { GENRES, genreGroup } from "../src/lib/shared.js";
import { loadMbidFixes, fixChartMbids, lastfmNameFor } from "./lib/mbid-fixes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes/Cosignr)" };
const THIN = 5;           // a genre with fewer Apple artists than this is "thin"
const FILL = 20;          // Last.fm artists added per thin genre (Julian, 2026-10-19)
const MIN_RATIO = 10;     // heat ratio needed for Last.fm artists
const LASTFM_WEIGHT = 0.75;
const CACHE_DAYS = 7;     // Last.fm info and unresolved Apple IDs are retried after this
const APPLE_CACHE = path.join(ROOT, "data/cache/apple-mbid.json");
const LASTFM_CACHE = path.join(ROOT, "data/cache/lastfm-info.json");

const read = async f => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));
const readOr = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
const fresh = e => e?.at && Date.now() - Date.parse(e.at) < CACHE_DAYS * 864e5;
const sameName = (a, b) => a && b && a.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() === b.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url.replace(/api_key=[^&]+/, "api_key=…")}`);
  return res.json();
}
async function loadEnv() {
  try {
    for (const line of (await readFile(path.join(ROOT, ".env"), "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

await loadEnv();
const KEY = process.env.LASTFM_API_KEY;
const pages = await loadArtists();
const profiles = (await read("data/profiles.json")).artists;
const PAGE_BY_MBID = Object.fromEntries(pages.map(a => [a.ids.musicbrainz, a]));
const pageGenre = a => a.genre || profiles[a.id]?.genre || null;

// Newest chart file with an Apple song chart.
const files = (await readdir(path.join(ROOT, "data/charts"))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
let chart = null;
for (const f of files) { const c = await read(`data/charts/${f}`); if (c.appleUsSongs) { chart = c; break; } }
const MBID_FIXES = await loadMbidFixes();
fixChartMbids(chart, MBID_FIXES); // Last.fm namesake IDs (YENA)
if (!chart) { console.error("No Apple chart in data/charts/; run fetch-charts.mjs first"); process.exit(1); }
console.log(`Chart: ${chart.date}`);

// ---------- 1. Apple pool ----------
const apple = new Map(); // appleId -> artist
for (const [list, kind] of [[chart.appleUsSongs, "song"], [chart.appleUsAlbums || [], "album"]]) {
  list.forEach(([title, credit, artistId, , , genres, art, url], i) => {
    if (!artistId) return;
    const rank = i + 1;
    const a = apple.get(artistId) || { appleId: artistId, credit, points: 0, songs: 0, albums: 0, best: null, bestAlbum: null, tags: {}, top: null };
    a.points += 101 - rank;
    if (kind === "song") { a.songs++; a.best ??= rank; } else { a.albums++; a.bestAlbum ??= rank; }
    const g = genreGroup(genres?.[0]);
    if (g) a.tags[g] = (a.tags[g] || 0) + (101 - rank);
    // The artist's highest-ranked entry: shown when they have no page (cover art links to Apple Music).
    if (!a.top || rank < a.top.rank || (rank === a.top.rank && kind === "song")) a.top = { kind, rank, title, url, art };
    apple.set(artistId, a);
  });
}
console.log(`Apple: ${apple.size} lead artists`);

// Apple ID → MusicBrainz ID.
const appleCache = await readOr(APPLE_CACHE, {});
const byAppleId = {};
for (const a of pages) for (const id of profiles[a.id]?.apple || []) byAppleId[id] ??= a;
const todo = [];
for (const id of apple.keys()) {
  if (byAppleId[id]) appleCache[id] = { mbid: byAppleId[id].ids.musicbrainz, name: byAppleId[id].name, via: "page", at: new Date().toISOString() };
  else if (!(appleCache[id]?.mbid || fresh(appleCache[id]))) todo.push(id);
}
if (todo.length) {
  console.log(`Resolving ${todo.length} Apple artist IDs…`);
  // Wikidata first (fast): P2850 = Apple Music artist ID, P434 = MusicBrainz ID.
  for (const id of todo) {
    try {
      const s = await getJson(`https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=haswbstatement:P2850=${id}&format=json`);
      const qid = s.query?.search?.[0]?.title;
      if (!qid) continue;
      const e = (await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`)).entities[qid];
      const ids = (e?.claims?.P434 || []).map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
      if (ids.length === 1) appleCache[id] = { mbid: ids[0], via: "wikidata", at: new Date().toISOString() };
    } catch (err) { console.warn(`  ! wikidata ${id}: ${err.message}`); }
  }
  // Then MusicBrainz URL relations.
  for (const id of todo.filter(id => !appleCache[id]?.mbid)) {
    let found = null;
    for (const url of [`https://music.apple.com/us/artist/${id}`, `https://itunes.apple.com/us/artist/id${id}`]) {
      try {
        const u = await mb(`url?resource=${encodeURIComponent(url)}&inc=artist-rels`);
        const artists = (u.relations || []).filter(r => r.artist).map(r => r.artist.id);
        if (new Set(artists).size === 1) { found = artists[0]; break; }
      } catch (err) { if (!/^404/.test(err.message)) console.warn(`  ! musicbrainz url ${id}: ${err.message}`); }
    }
    appleCache[id] = found ? { mbid: found, via: "musicbrainz", at: new Date().toISOString() } : { mbid: null, at: new Date().toISOString() };
  }
}
// Names: our page name, else MusicBrainz's, else Apple's (iTunes lookup takes many IDs at once).
const needNames = [...apple.keys()].filter(id => !byAppleId[id] && !appleCache[id]?.name);
for (const id of needNames.filter(id => appleCache[id]?.mbid)) {
  try { appleCache[id].name = (await mb(`artist/${appleCache[id].mbid}`)).name; } catch (err) { console.warn(`  ! name ${id}: ${err.message}`); }
}
const nameless = needNames.filter(id => !appleCache[id]?.name);
for (let i = 0; i < nameless.length; i += 100) {
  try {
    const r = await getJson(`https://itunes.apple.com/lookup?id=${nameless.slice(i, i + 100).join(",")}`);
    for (const x of r.results || []) if (x.artistId && appleCache[x.artistId]) appleCache[x.artistId].name = x.artistName;
  } catch (err) { console.warn(`  ! itunes lookup: ${err.message}`); }
}
await mkdir(path.dirname(APPLE_CACHE), { recursive: true });
await writeFile(APPLE_CACHE, JSON.stringify(appleCache, null, 1) + "\n");

const appleList = [...apple.values()].map(a => {
  const c = appleCache[a.appleId] || {};
  const page = c.mbid && PAGE_BY_MBID[c.mbid];
  const genre = Object.entries(a.tags).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  return { name: page?.name || c.name || a.credit.split(/,\s|\s&\s/)[0], mbid: c.mbid || null, appleId: a.appleId, source: "apple", genre,
           apple: { points: a.points, songs: a.songs, albums: a.albums, best: a.best, bestAlbum: a.bestAlbum, top: a.top } };
}).sort((x, y) => y.apple.points - x.apple.points);
appleList.forEach((a, i) => { a.score = Math.round(100 * (appleList.length - i) / appleList.length); });
console.log(`  resolved to MusicBrainz: ${appleList.filter(a => a.mbid).length}/${appleList.length}`);

// ---------- 2. Last.fm fill for thin genres ----------
const perGenre = Object.fromEntries(GENRES.map(g => [g.id, appleList.filter(a => a.genre === g.id).length]));
const thin = GENRES.map(g => g.id).filter(g => perGenre[g] < THIN);
console.log(`Apple artists per genre: ${JSON.stringify(perGenre)}\nThin: ${thin.join(", ") || "none"}`);

const lastfmCache = await readOr(LASTFM_CACHE, {});
let lastCall = 0;
async function lastfmInfo(mbid) {
  if (fresh(lastfmCache[mbid])) return lastfmCache[mbid];
  const wait = lastCall + 220 - Date.now(); // Last.fm: at most ~5 requests/second
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  // A corrected ID isn't known to Last.fm: look its page up by the hand-checked name instead.
  const byName = lastfmNameFor(MBID_FIXES, mbid);
  const q = byName ? `artist=${encodeURIComponent(byName)}` : `mbid=${mbid}`;
  const d = await getJson(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&${q}&autocorrect=0&format=json&api_key=${KEY}`);
  const e = d.error ? { name: null, at: new Date().toISOString() }
    : { name: d.artist.name, listeners: Number(d.artist.stats.listeners), tags: (d.artist.tags?.tag || []).map(t => t.name), at: new Date().toISOString() };
  lastfmCache[mbid] = e;
  return e;
}
const appleMbids = new Set(appleList.map(a => a.mbid).filter(Boolean));
const usRank = new Map(); // mbid -> { rank, listeners }
(chart.lastfmUs || []).forEach(([, mbid, listeners], i) => { if (mbid && !usRank.has(mbid)) usRank.set(mbid, { rank: i + 1, listeners }); });

const fill = [];
if (!KEY || !chart.lastfmUs) console.log("No LASTFM_API_KEY or Last.fm US chart: no Last.fm fill");
else if (thin.length) {
  const added = Object.fromEntries(thin.map(g => [g, 0]));
  for (const [i, [name, mbid, listeners]] of chart.lastfmUs.entries()) {
    if (thin.every(g => added[g] >= FILL)) break;
    if (!mbid || appleMbids.has(mbid)) continue;
    let info;
    try { info = await lastfmInfo(mbid); } catch (err) { console.warn(`  ! last.fm ${name}: ${err.message}`); continue; }
    if (!sameName(info.name, name) || !info.listeners) continue;
    const ratio = listeners / info.listeners * 1000;
    if (ratio < MIN_RATIO) continue;
    const page = PAGE_BY_MBID[mbid];
    const genre = page ? genreGroup(pageGenre(page)) : info.tags.map(genreGroup).find(Boolean) || null;
    if (!thin.includes(genre) || added[genre] >= FILL) continue;
    // Last.fm can tag a page with a namesake's MusicBrainz ID: MusicBrainz's name must match too.
    if (!page) {
      try { if (!sameName((await mb(`artist/${mbid}`)).name, name)) continue; } catch { continue; }
    }
    added[genre]++;
    fill.push({ name: page?.name || name, mbid, source: "lastfm", genre, lastfm: { rank: i + 1, listeners, allTime: info.listeners, ratio: Math.round(ratio * 10) / 10 } });
  }
  console.log(`Last.fm fill: ${JSON.stringify(added)}`);
}
await writeFile(LASTFM_CACHE, JSON.stringify(lastfmCache) + "\n");
// Percentile within the Last.fm list (by US rank), weighted so Apple artists lead.
fill.sort((x, y) => x.lastfm.rank - y.lastfm.rank)
  .forEach((a, i, l) => { a.score = Math.round(LASTFM_WEIGHT * 100 * (l.length - i) / l.length); });

// Apple artists also on the Last.fm US chart get their Last.fm numbers (for the Last.fm tab).
for (const a of appleList) {
  const u = a.mbid && usRank.get(a.mbid);
  if (u) a.lastfm = { rank: u.rank, listeners: u.listeners };
}

const artists = [...appleList, ...fill].sort((x, y) => y.score - x.score);
await writeFile(path.join(ROOT, "data/trending.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  chartDate: chart.date,
  rules: { thin: THIN, fill: FILL, minRatio: MIN_RATIO, lastfmWeight: LASTFM_WEIGHT },
  thinGenres: thin,
  artists,
}, null, 1) + "\n");
console.log(`\nWrote data/trending.json: ${appleList.length} Apple + ${fill.length} Last.fm artists`);
