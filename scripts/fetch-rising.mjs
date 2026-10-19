#!/usr/bin/env node
// Builds data/rising.json: artists on the way up (RISING.md; design agreed with Julian 2026-10-19).
// Rising is driven by charts and heat, like other "rising" lists; Cosignr adds artists the stars vouch for.
//
// Ways in (any one), all with at least MIN_LISTENERS Last.fm listeners:
//   new           first release within NEW_YEARS (any size: ADÉLA, Sienna Spiro)
//   little-known  under LITTLE listeners (any debut year: Belly Gang Kushington)
//   breaking out  charting (Apple US top 100 or Last.fm US top tracks), heat ≥ MIN_HEAT, under
//                 BREAKOUT_MAX listeners, first release within BREAKOUT_YEARS (Ella Langley)
//   (debut unknown: under UNKNOWN_MAX listeners)
// Signals, each 0–1:
//   charting  Apple US top 100 position (#1 = 1.0, +0.2 if it rose 3+ places or entered since the chart
//             CLIMB_DAYS earlier), Last.fm US top tracks (×0.7), Last.fm US top artists (×0.5); the best counts
//   cosign    big-artist cosigns in the last WINDOW_DAYS: Σ log10(cosigner ÷ artist listeners) × recency, ÷ 3.
//             Big = verified Last.fm fame ≥ BIG (any artist we know, e.g. Gunna). Apple's chart credits
//             count as evidence ("Belly Gang Kushington & 21 Savage"), matched to big artists we know.
//   heat      Last.fm US listeners this week ÷ all-time listeners × 1000 (÷ 30, capped), or growth in
//             listeners since an earlier snapshot (% ÷ GROWTH_FULL), whichever is stronger
// Rank: tier first (Apple top 100, then Last.fm US top tracks, then everyone else), then
//   3 × charting + 2 × cosign + 1 × heat/growth within the tier (Julian: weighting "A").
// Genre: Last.fm tags → our page genre → MusicBrainz genre → Apple tag → the cosigner's genre.
//
// Run after fetch-stats.mjs. Needs LASTFM_API_KEY for chart artists we haven't looked up before.
// Usage (from the project root):  node scripts/fetch-rising.mjs

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { loadArtists } from "./lib/artists.mjs";
import { mergeCosigns } from "../src/lib/cosigns.js";
import { genreGroup } from "../src/lib/shared.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_LISTENERS = 5_000;     // below it were kids credited on a parent's song, labels, actors, mismatched pages
const LITTLE = 150_000;
const NEW_YEARS = 5;
const MIN_HEAT = 10, BREAKOUT_MAX = 2_000_000, BREAKOUT_YEARS = 12; // 12, not 10: underscores debuted 2015 (Julian)
const UNKNOWN_MAX = 750_000;
const BIG = 1_000_000;
const WINDOW_DAYS = 365;         // cosigns from the last 12 months (24 considered, not chosen)
const CLIMB_DAYS = 7, GROWTH_DAYS = 7, GROWTH_FULL = 5; // 5% growth in a week = full marks
const WEIGHTS = { chart: 3, cosign: 2, heat: 1 };
const KEEP = 80;
const START_CACHE = path.join(ROOT, "data/cache/mb-artist-start.json");
const LASTFM_CACHE = path.join(ROOT, "data/cache/lastfm-info.json");
const START_MAX_AGE_DAYS = 30, LASTFM_MAX_AGE_DAYS = 7;
const TYPES = new Set(["feature", "collab", "tour", "band", "upcoming"]);
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes/Cosignr)" };

const read = async f => JSON.parse(await readFile(path.join(ROOT, "data", f), "utf8"));
const readOr = async (f, d) => { try { return await read(f); } catch { return d; } };
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const daysAgo = n => iso(Date.now() - n * 864e5);
const norm = x => x.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
const fresh = (e, days) => e?.at && Date.now() - Date.parse(e.at) < days * 864e5;

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

const stats = await read("stats.json");
const pages = await loadArtists();
const profiles = (await readOr("profiles.json", { artists: {} })).artists;
const appleMbid = await readOr("cache/apple-mbid.json", {});
const merged = mergeCosigns({
  cosigns: await read("cosigns.json"), charting: await readOr("trending-cosigns.json", null),
  tours: await readOr("tours.json", null), upcoming: await readOr("upcoming.json", null), fame: stats.cosigners,
});
const PAGE_BY_MBID = Object.fromEntries(pages.map(a => [a.ids.musicbrainz, a]));
const names = {};
for (const e of merged) { names[e.from] ??= e.fromName; names[e.to] ??= e.toName; }
for (const a of pages) names[a.ids.musicbrainz] = a.name;

// ---------- Last.fm info (all-time listeners + tags), verified by name ----------
let lastfmCache = {};
try { lastfmCache = JSON.parse(await readFile(LASTFM_CACHE, "utf8")); } catch {}
let lastCall = 0;
async function lastfmInfo(mbid, name) {
  const c = lastfmCache[mbid];
  if (fresh(c, LASTFM_MAX_AGE_DAYS) || !KEY) return c?.name && (!name || norm(c.name) === norm(name)) ? c : null;
  const wait = lastCall + 220 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&mbid=${mbid}&autocorrect=0&format=json&api_key=${KEY}`, { headers: UA });
    const d = await res.json();
    lastfmCache[mbid] = d.error ? { name: null, at: new Date().toISOString() }
      : { name: d.artist.name, listeners: Number(d.artist.stats.listeners), tags: (d.artist.tags?.tag || []).map(t => t.name), at: new Date().toISOString() };
  } catch { return null; }
  const e = lastfmCache[mbid];
  return e.name && (!name || norm(e.name) === norm(name)) ? e : null; // Last.fm merges namesakes: the name must match
}
// Verified fame: our page stats, fetch-stats' cosigner fame, else the Last.fm cache.
const fameOf = mbid => {
  const page = PAGE_BY_MBID[mbid];
  return (page && stats.artists[page.id]?.lastfm?.listeners) || stats.cosigners[mbid]?.listeners
    || (lastfmCache[mbid]?.name ? lastfmCache[mbid].listeners : null) || null;
};

// ---------- charts ----------
const chartFiles = (await readdir(path.join(ROOT, "data/charts"))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
let now = null;
for (const f of chartFiles) { const c = await read(`charts/${f}`); if (c.appleUsSongs) { now = c; break; } }
if (!now) { console.error("No Apple chart in data/charts/"); process.exit(1); }
const olderThan = (date, days) => {
  const target = iso(Date.parse(date) - days * 864e5);
  const older = chartFiles.map(f => f.slice(0, 10)).filter(d => d < date);
  return older.find(d => d <= target) || older.at(-1) || null;
};
const thenDate = olderThan(now.date, CLIMB_DAYS);
const then = thenDate ? await read(`charts/${thenDate}.json`) : null;
const thenRank = new Map((then?.appleUsSongs || []).map((r, i) => [r[4], i + 1]));
const usWeekly = new Map((now.lastfmUs || []).filter(r => r[1]).map((r, i) => [r[1], { listeners: r[2], rank: i + 1 }]));

const C = new Map(); // mbid -> candidate
const cand = (mbid, name) => {
  if (!C.has(mbid)) C.set(mbid, { mbid, name: names[mbid] || name, apple: 0, appleSongs: [], appleTag: null, lfTracks: 0, lfSongs: [],
    lfArtists: 0, cosigns: [] });
  return C.get(mbid);
};

// Big artists by name, for Apple's credit strings ("… & 21 Savage"): verified fame ≥ BIG.
const bigByName = new Map();
for (const [m, n] of Object.entries(names)) if (fameOf(m) >= BIG) bigByName.set(norm(n), m);

now.appleUsSongs.forEach(([title, credit, artistId, , id, genres, , url], i) => {
  const mbid = appleMbid[artistId]?.mbid;
  if (!mbid) return;
  const rank = i + 1, was = thenRank.get(id);
  const climbed = !!then && (!was || was - rank >= 3);
  const c = cand(mbid, appleMbid[artistId]?.name || credit.split(/,\s|\s&\s/)[0]);
  c.apple = Math.max(c.apple, (101 - rank) / 100 + (climbed ? 0.2 : 0));
  c.appleSongs.push({ title, rank, move: was ? was - rank : null, entered: !!then && !was, url });
  c.appleTag ??= genres?.[0] || null;
  // Apple's credit as cosign evidence: the other credited artists who are big (MusicBrainz may not have the song yet).
  for (const n of credit.split(/,\s|\s&\s/).slice(1).map(norm)) {
    const b = bigByName.get(n);
    if (b && b !== mbid) c.cosigns.push({ from: b, date: now.date, types: ["collab"], title, url, viaApple: true });
  }
});
(now.lastfmUsTracks || []).forEach(([title, artist, mbid, , listeners], i) => {
  if (!mbid) return;
  const c = cand(mbid, artist);
  c.lfTracks = Math.max(c.lfTracks, 0.7 * (1001 - (i + 1)) / 1000);
  if (c.lfSongs.length < 2) c.lfSongs.push({ title, rank: i + 1, listeners });
});
(now.lastfmUs || []).forEach(([name, mbid], i) => { if (mbid) cand(mbid, name).lfArtists = 0.5 * (1001 - (i + 1)) / 1000; });

// ---------- big-artist cosigns (last 12 months) ----------
const since = daysAgo(WINDOW_DAYS);
for (const e of merged) {
  const when = e.next?.date || e.last;
  if (!when || when < since || !e.types.some(t => TYPES.has(t))) continue;
  if (!(fameOf(e.from) >= BIG)) continue;
  const song = e.evidence?.[0], live = e.liveEvidence?.[0];
  cand(e.to, e.toName).cosigns.push({ from: e.from, date: when.slice(0, 10), types: e.types.filter(t => TYPES.has(t)),
    title: e.next ? e.next.tour : song?.title || live?.title || null, url: e.next ? e.next.url : song?.url || live?.url || null });
}
console.log(`Candidates: ${C.size} (charting or cosigned by a big artist)`);

// ---------- fame for chart artists we haven't seen (Last.fm, verified) ----------
let looked = 0;
for (const c of C.values()) {
  if (fameOf(c.mbid) != null) continue;
  if (c.apple || c.lfTracks || c.lfArtists) { await lastfmInfo(c.mbid, c.name); looked++; }
}
console.log(`Last.fm lookups for chart artists: ${looked}`);
await mkdir(path.dirname(LASTFM_CACHE), { recursive: true });
await writeFile(LASTFM_CACHE, JSON.stringify(lastfmCache) + "\n");

// ---------- debut + MusicBrainz genre (cached) ----------
let starts = {};
try { starts = JSON.parse(await readFile(START_CACHE, "utf8")); } catch {}
const pool = [...C.values()].filter(c => (fameOf(c.mbid) || 0) >= MIN_LISTENERS && (fameOf(c.mbid) < BIG || c.apple || c.lfTracks));
const todo = pool.filter(c => !fresh(starts[c.mbid], START_MAX_AGE_DAYS) || !("groups" in starts[c.mbid]));
console.log(`Looking up first releases for ${todo.length} of ${pool.length} (rest cached)…`);
for (const c of todo) {
  try {
    const rg = await mb(`release-group?artist=${c.mbid}&limit=100`);
    const dates = (rg["release-groups"] || [])
      .filter(g => !(g["secondary-types"] || []).some(t => /compilation|dj-mix/i.test(t)))
      .map(g => g["first-release-date"]).filter(Boolean).sort();
    const a = await mb(`artist/${c.mbid}?inc=genres`);
    const top = (a.genres || []).sort((x, y) => y.count - x.count)[0];
    starts[c.mbid] = { first: dates[0] || null, groups: rg["release-group-count"] ?? null, genre: top?.count > 0 ? top.name : null, at: new Date().toISOString() };
  } catch (err) { console.warn(`  ! ${c.name}: ${err.message}`); }
}
await mkdir(path.dirname(START_CACHE), { recursive: true });
await writeFile(START_CACHE, JSON.stringify(starts) + "\n");

// ---------- growth (snapshots) ----------
const snapFiles = (await readdir(path.join(ROOT, "data/snapshots"))).filter(f => f.endsWith(".json")).sort();
const snapNow = snapFiles.length ? await read(`snapshots/${snapFiles.at(-1)}`) : null;
const snapDates = snapFiles.map(f => f.slice(0, 10));
const snapThenDate = snapNow && (snapDates.filter(d => d < snapNow.date && d <= daysAgo(GROWTH_DAYS)).at(-1)
  || snapDates.find(d => d >= "2026-10-16" && d < snapNow.date)); // the watch list starts 2026-10-16
const snapThen = snapThenDate ? await read(`snapshots/${snapThenDate}.json`) : null;
const snapVal = (s, m) => { const p = PAGE_BY_MBID[m]; return (p && s?.artists?.[p.id]?.lastfmListeners) || s?.watch?.[m]?.lastfmListeners || null; };

// ---------- eligibility, signals, rank ----------
const newSince = daysAgo(NEW_YEARS * 365.25), breakoutSince = daysAgo(BREAKOUT_YEARS * 365.25);
const rows = [];
for (const c of pool) {
  const listeners = fameOf(c.mbid), s = starts[c.mbid] || {};
  const charting = c.apple > 0 || c.lfTracks > 0;
  const wk = usWeekly.get(c.mbid);
  const heat = wk ? wk.listeners / listeners * 1000 : null;
  const route = s.first && s.first >= newSince ? "new"
    : listeners <= LITTLE ? "little-known"
    : charting && heat >= MIN_HEAT && listeners < BREAKOUT_MAX && s.first && s.first >= breakoutSince ? "breaking out"
    : !s.first && listeners <= UNKNOWN_MAX ? "debut unknown" : null;
  if (!route || s.groups >= 100) continue;
  // No releases of their own: fine for a newcomer who's charting or featured on a song; a show-only cosign
  // with 0 releases was a stale Ticketmaster ID (a duplicate "Kylie Minogue").
  if (s.groups === 0 && !charting && !c.cosigns.some(x => x.types.some(t => t === "feature" || t === "collab"))) continue;

  // cosign signal: a bigger star and a more recent cosign count more
  const seenFrom = new Set();
  const cos = c.cosigns.filter(x => fameOf(x.from) > listeners && !seenFrom.has(x.from) && seenFrom.add(x.from)).map(x => ({
    ...x, name: names[x.from], listeners: fameOf(x.from),
    weight: Math.log10(fameOf(x.from) / listeners) * Math.max(0.3, 1 - 0.7 * (Date.now() - Date.parse(x.date)) / (WINDOW_DAYS * 864e5)),
  })).sort((x, y) => y.weight - x.weight);
  const cosign = Math.min(1, cos.reduce((t, x) => t + x.weight, 0) / 3);
  const chart = Math.min(1, Math.max(c.apple, c.lfTracks, c.lfArtists));
  const a = snapVal(snapThen, c.mbid), b = snapVal(snapNow, c.mbid);
  const growthPct = a && b && b >= a ? (b - a) / a * 100 : null;
  const heatOrGrowth = Math.max(heat ? Math.min(1, heat / 30) : 0, growthPct ? Math.min(1, growthPct / GROWTH_FULL) : 0);
  const tier = c.apple > 0 ? 0 : c.lfTracks > 0 ? 1 : 2;
  if (!chart && !cosign && !heatOrGrowth) continue;

  const tags = stats.cosigners[c.mbid]?.tags?.length ? stats.cosigners[c.mbid].tags : lastfmCache[c.mbid]?.tags || [];
  const page = PAGE_BY_MBID[c.mbid];
  const votes = {};
  for (const x of cos) { const p = PAGE_BY_MBID[x.from]; const g = p && genreGroup(p.genre || profiles[p.id]?.genre); if (g) votes[g] = (votes[g] || 0) + x.weight; }
  const genre = tags.map(genreGroup).find(Boolean) || genreGroup(page && (page.genre || profiles[page.id]?.genre)) || genreGroup(s.genre)
    || genreGroup(c.appleTag) || Object.entries(votes).sort((x, y) => y[1] - x[1])[0]?.[0] || null;

  rows.push({
    mbid: c.mbid, name: c.name, listeners, firstRelease: s.first || null, route, tier, genre,
    heat: heat ? Math.round(heat * 10) / 10 : null, weekly: wk?.listeners ?? null, growthPct: growthPct != null ? Math.round(growthPct * 100) / 100 : null,
    signals: { chart: Math.round(chart * 100) / 100, cosign: Math.round(cosign * 100) / 100, heat: Math.round(heatOrGrowth * 100) / 100 },
    score: Math.round((WEIGHTS.chart * chart + WEIGHTS.cosign * cosign + WEIGHTS.heat * heatOrGrowth) * 100) / 100,
    charts: { apple: c.appleSongs.slice(0, 3), lastfm: c.lfSongs, since: thenDate },
    cosigns: cos.slice(0, 4).map(({ weight, ...x }) => x),
  });
}
rows.sort((x, y) => x.tier - y.tier || y.score - x.score);
// One row per name (Apple and Last.fm can point at different MusicBrainz entries: ADÉLA): keep the first
// (best tier/score) and fill in what it's missing from the others (her heat comes from the Last.fm entry).
const byName = new Map();
for (const r of rows) {
  const k = norm(r.name), o = byName.get(k);
  if (!o) { byName.set(k, r); continue; }
  o.heat ??= r.heat; o.weekly ??= r.weekly; o.growthPct ??= r.growthPct; o.firstRelease ??= r.firstRelease; o.genre ??= r.genre;
  if (!o.charts.lastfm.length) o.charts.lastfm = r.charts.lastfm;
  for (const c of r.cosigns) if (o.cosigns.length < 4 && !o.cosigns.some(x => x.from === c.from)) o.cosigns.push(c);
}
const out = [...byName.values()].slice(0, KEEP);

await writeFile(path.join(ROOT, "data/rising.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), chartDate: now.date, climbSince: thenDate, growthSince: snapThenDate,
  rules: { minListeners: MIN_LISTENERS, little: LITTLE, newYears: NEW_YEARS, minHeat: MIN_HEAT, breakoutMax: BREAKOUT_MAX,
           breakoutYears: BREAKOUT_YEARS, big: BIG, windowDays: WINDOW_DAYS, weights: WEIGHTS },
  artists: out,
}, null, 1) + "\n");
console.log(`Wrote data/rising.json: ${out.length} artists`);
const T = ["Apple", "Last.fm", "other"];
for (const r of out.slice(0, 20)) console.log(`  ${T[r.tier].padEnd(7)} ${r.score.toFixed(2).padStart(5)}  ${r.name.slice(0, 24).padEnd(24)} ${String(r.listeners).padStart(8)}  ${r.route.padEnd(13)} heat ${r.heat ?? "–"}  ${r.cosigns.map(x => x.name).slice(0, 2).join(", ")}`);
