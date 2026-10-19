#!/usr/bin/env node
// Builds data/rising.json: relatively unknown artists recently cosigned by big ones (RISING.md, Julian
// 2026-10-16/19). Reuses what the nightly job already collects, so the only new lookups are each
// newcomer's first release and MusicBrainz genre (cached).
//   Big cosigners  everyone in data/trending.json with ≥ MAX_LISTENERS + page artists with ≥ BIG Last.fm listeners
//   Cosigns        mergeCosigns() of cosigns.json, trending-cosigns.json, tours.json, upcoming.json:
//                  a feature, collab or tour (touring band / announced support count as tours)
//                  whose newest song or show is within WINDOW_DAYS
//   Newcomer       MIN_LISTENERS–MAX_LISTENERS Last.fm listeners (stats.json → cosigners; unknown = out) and a
//                  first release within MAX_YEARS (MusicBrainz release groups credited to them, not
//                  compilations; 100+ release groups = established; none of their own = in only with a song)
//   Rank           sum over their cosigns of log10(cosigner ÷ newcomer listeners) × recency
//                  (1.0 today → 0.3 at WINDOW_DAYS)
//   Genre          Last.fm tags (saved by fetch-stats) → MusicBrainz genre → the cosigner's genre
//   Chart boost    (Julian, 2026-10-19: "song climbers should absolutely feed rising") a newcomer with a
//                  song on Apple's US top 100 gets +CHART_SONG per song (max 2), +CHART_CLIMB if it rose
//                  3+ places or entered since the chart CLIMB_DAYS earlier, and +LASTFM_SONG if they're
//                  on Last.fm's US top tracks. Apple songs match by Apple ID (lead artist, via
//                  data/cache/apple-mbid.json) or by name only on a song led by one of their cosigners.
// Run after fetch-stats.mjs. Newcomers' daily listeners are already tracked in the snapshot `watch`
// list (fetch-stats), which "+X% this week" will use later.
//
// Usage (from the project root):  node scripts/fetch-rising.mjs

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { loadArtists } from "./lib/artists.mjs";
import { mergeCosigns } from "../src/lib/cosigns.js";
import { genreGroup } from "../src/lib/shared.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIG = 1_000_000;          // page artists with at least this many Last.fm listeners are big cosigners
const MAX_LISTENERS = 150_000;  // newcomer: fewer Last.fm listeners than this (Julian, 2026-10-16)
const MIN_LISTENERS = 5_000;    // …but at least this many: below it were kids, labels, actors, mismatched pages
const MAX_YEARS = 5;            // newcomer: first release within this many years
const WINDOW_DAYS = 365;        // cosigns from the last 12 months
const KEEP = 60;                // newcomers saved
const START_CACHE = path.join(ROOT, "data/cache/mb-artist-start.json");
const START_MAX_AGE_DAYS = 30;
const TYPES = new Set(["feature", "collab", "tour", "band", "upcoming"]);
const CHART_SONG = 1.0, CHART_CLIMB = 0.5, LASTFM_SONG = 0.5, CLIMB_DAYS = 7;

const read = async f => JSON.parse(await readFile(path.join(ROOT, "data", f), "utf8"));
const readOr = async (f, d) => { try { return await read(f); } catch { return d; } };
const today = new Date().toISOString().slice(0, 10);
const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
const tooOld = new Date(Date.now() - MAX_YEARS * 365.25 * 864e5).toISOString().slice(0, 10);

const stats = await read("stats.json");
const pages = await loadArtists();
const profiles = (await readOr("profiles.json", { artists: {} })).artists;
const trending = (await readOr("trending.json", { artists: [] })).artists;
const merged = mergeCosigns({
  cosigns: await read("cosigns.json"), charting: await readOr("trending-cosigns.json", null),
  tours: await readOr("tours.json", null), upcoming: await readOr("upcoming.json", null), fame: stats.cosigners,
});

// ---------- big cosigners ----------
const PAGE_BY_MBID = Object.fromEntries(pages.map(a => [a.ids.musicbrainz, a]));
const fameOf = mbid => {
  const page = PAGE_BY_MBID[mbid];
  return (page && stats.artists[page.id]?.lastfm?.listeners) || stats.cosigners[mbid]?.listeners || null;
};
const genreOfPage = mbid => { const p = PAGE_BY_MBID[mbid]; return p && genreGroup(p.genre || profiles[p.id]?.genre); };
const big = new Map(); // mbid -> { name, listeners, genre }
// Charting alone doesn't make someone big: a Trending artist under MAX_LISTENERS (Belly Gang Kushington,
// 45k, Apple #48) is a newcomer candidate, not a cosigner.
for (const t of trending) if (t.mbid && fameOf(t.mbid) >= MAX_LISTENERS) big.set(t.mbid, { name: t.name, listeners: fameOf(t.mbid), genre: t.genre || genreOfPage(t.mbid) });
for (const a of pages) {
  const l = fameOf(a.ids.musicbrainz);
  if (l >= BIG && !big.has(a.ids.musicbrainz)) big.set(a.ids.musicbrainz, { name: a.name, listeners: l, genre: genreOfPage(a.ids.musicbrainz) });
}
console.log(`Big cosigners: ${big.size}`);

// ---------- candidate cosigns ----------
const lastDate = e => e.next?.date || e.last; // an announced support slot counts as now
const candidates = new Map(); // newcomer mbid -> { name, listeners, cosigns: [] }
for (const e of merged) {
  const from = big.get(e.from);
  if (!from || big.has(e.to)) continue;
  if (!e.types.some(t => TYPES.has(t))) continue;
  const when = lastDate(e);
  if (!when || when < since) continue;
  const listeners = fameOf(e.to); // page stats for artists with a page (charting newcomers), else cosigner fame
  if (!(listeners > 0) || listeners < MIN_LISTENERS || listeners >= MAX_LISTENERS) continue;
  if (from.listeners <= listeners) continue;
  const c = candidates.get(e.to) || { mbid: e.to, name: e.toName, listeners, cosigns: [] };
  const song = e.evidence?.[0], live = e.liveEvidence?.[0];
  c.cosigns.push({
    from: e.from, name: from.name, listeners: from.listeners, genre: from.genre, date: when.slice(0, 10),
    types: e.types.filter(t => TYPES.has(t)),
    title: e.next ? e.next.tour : song?.title || live?.title || null,
    url: e.next ? e.next.url : song?.url || live?.url || null,
    weight: Math.log10(from.listeners / listeners) * Math.max(0.3, 1 - 0.7 * (Date.now() - Date.parse(when.slice(0, 10))) / (WINDOW_DAYS * 864e5)),
  });
  candidates.set(e.to, c);
}
console.log(`Candidates (cosigned by a big artist, under ${MAX_LISTENERS / 1000}k listeners): ${candidates.size}`);

// ---------- first release + MusicBrainz genre (cached) ----------
let starts = {};
try { starts = JSON.parse(await readFile(START_CACHE, "utf8")); } catch {}
const stale = e => !e || !("groups" in e) || Date.now() - Date.parse(e.at) > START_MAX_AGE_DAYS * 864e5;
const todo = [...candidates.keys()].filter(m => stale(starts[m]));
console.log(`Looking up first releases for ${todo.length} (rest cached)…`);
for (const mbid of todo) {
  try {
    // Release groups credited to them (paged list; the artist lookup's `inc` caps at 25 in no order,
    // which hid Kylie Minogue's early albums). 100+ release groups = established, not a newcomer.
    const rg = await mb(`release-group?artist=${mbid}&limit=100`);
    const dates = (rg["release-groups"] || [])
      .filter(g => !(g["secondary-types"] || []).some(t => /compilation|dj-mix/i.test(t)))
      .map(g => g["first-release-date"]).filter(Boolean).sort();
    const a = await mb(`artist/${mbid}?inc=genres`);
    const top = (a.genres || []).sort((x, y) => y.count - x.count)[0];
    starts[mbid] = { first: dates[0] || null, groups: rg["release-group-count"] ?? null, genre: top?.count > 0 ? top.name : null, at: new Date().toISOString() };
  } catch (err) { console.warn(`  ! ${candidates.get(mbid).name}: ${err.message}`); }
}
await mkdir(path.dirname(START_CACHE), { recursive: true });
await writeFile(START_CACHE, JSON.stringify(starts) + "\n");

// ---------- chart boost ----------
const chartFiles = (await readdir(path.join(ROOT, "data/charts"))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
let chartNow = null;
for (const f of chartFiles) { const c = await read(`charts/${f}`); if (c.appleUsSongs) { chartNow = c; break; } }
let chartThen = null;
if (chartNow) {
  const target = new Date(Date.parse(chartNow.date) - CLIMB_DAYS * 864e5).toISOString().slice(0, 10);
  const older = chartFiles.map(f => f.slice(0, 10)).filter(d => d < chartNow.date);
  const d = older.find(x => x <= target) || older.at(-1);
  if (d) chartThen = await read(`charts/${d}.json`);
}
const appleMbid = await readOr("cache/apple-mbid.json", {});
const thenRank = new Map((chartThen?.appleUsSongs || []).map((r, i) => [r[4], i + 1]));
const norm = x => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const hasName = (text, name) => new RegExp(`(^|[^\\p{L}\\p{N}])${norm(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(norm(text));
function chartFor(c) {
  const songs = [];
  (chartNow?.appleUsSongs || []).forEach(([title, credit, artistId, , id], i) => {
    const lead = appleMbid[artistId]?.mbid;
    const mine = lead === c.mbid || (lead && c.cosigns.some(x => x.from === lead) && hasName(`${credit} | ${title}`, c.name));
    if (!mine) return;
    const was = thenRank.get(id);
    songs.push({ title, rank: i + 1, move: was ? was - (i + 1) : null, entered: !!chartThen && !was });
  });
  const lf = (chartNow?.lastfmUsTracks || []).map((r, i) => ({ r, rank: i + 1 })).filter(({ r }) => r[2] === c.mbid);
  const bonus = Math.min(2, songs.length) * CHART_SONG
    + (songs.some(x => x.entered || x.move >= 3) ? CHART_CLIMB : 0) + (lf.length ? LASTFM_SONG : 0);
  return {
    bonus,
    apple: songs.slice(0, 2),
    lastfm: lf.slice(0, 2).map(({ r, rank }) => ({ title: r[0], rank, listeners: r[4] })),
  };
}

// ---------- rank ----------
const rising = [];
let old = 0;
for (const c of candidates.values()) {
  const s = starts[c.mbid] || {};
  if ((s.first && s.first < tooOld) || s.groups >= 100) { old++; continue; }
  // No releases of their own on MusicBrainz is normal for a newcomer who's only been featured (Iconic
  // Savvy), but with a show as the only evidence it's usually a stale Ticketmaster ID (a "Kylie Minogue"
  // duplicate with 0 releases): those need a song.
  if (s.groups === 0 && !c.cosigns.some(x => x.types.some(t => t === "feature" || t === "collab"))) { old++; continue; }
  const tags = stats.cosigners[c.mbid]?.tags || [];
  const byVotes = {};
  for (const x of c.cosigns) if (x.genre) byVotes[x.genre] = (byVotes[x.genre] || 0) + x.weight;
  const genre = tags.map(genreGroup).find(Boolean) || genreGroup(s.genre)
    || Object.entries(byVotes).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  c.cosigns.sort((x, y) => y.weight - x.weight || y.date.localeCompare(x.date));
  const chart = chartFor(c);
  rising.push({
    mbid: c.mbid, name: c.name, listeners: c.listeners, firstRelease: s.first || null, genre,
    score: Math.round((c.cosigns.reduce((t, x) => t + x.weight, 0) + chart.bonus) * 100) / 100,
    charts: chart.apple.length || chart.lastfm.length ? { apple: chart.apple, lastfm: chart.lastfm, since: chartThen?.date || null } : null,
    newest: c.cosigns.map(x => x.date).sort().at(-1),
    cosigns: c.cosigns.slice(0, 4).map(({ weight, genre, ...x }) => x),
  });
}
rising.sort((x, y) => y.score - x.score || y.newest.localeCompare(x.newest));
// MusicBrainz sometimes has two entries for one artist (Buddah Bless): keep the higher-ranked one.
const seenNames = new Set();
const deduped = rising.filter(r => { const k = r.name.toLowerCase(); if (seenNames.has(k)) return false; seenNames.add(k); return true; });
rising.length = 0; rising.push(...deduped);
console.log(`Dropped ${old}: first release before ${tooOld}, 100+ releases, or no releases and no song`);

await writeFile(path.join(ROOT, "data/rising.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  rules: { bigListeners: BIG, maxListeners: MAX_LISTENERS, maxYears: MAX_YEARS, windowDays: WINDOW_DAYS },
  artists: rising.slice(0, KEEP),
}, null, 1) + "\n");
console.log(`Wrote data/rising.json: ${Math.min(KEEP, rising.length)} of ${rising.length} newcomers`);
for (const r of rising.slice(0, 15)) console.log(`  ${r.score.toFixed(2).padStart(5)}  ${r.name.padEnd(24)} ${String(r.listeners).padStart(7)}  ${(r.genre || "·").padEnd(10)} ← ${r.cosigns.map(x => x.name).join(", ")}`);
