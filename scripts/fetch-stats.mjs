#!/usr/bin/env node
// Builds data/stats.json (latest numbers) and data/snapshots/<date>.json (daily history)
// from the IDs in data/artists.json.
//   - Deezer:  fan count (no key needed)
//   - Last.fm: listeners, playcount, tags (needs LASTFM_API_KEY in .env or the environment)
// Sources without a key are skipped, and their previous values in stats.json are kept.
// A metric listed under an artist's `caveats` is fetched but left out of the score.
//
// Also fetches Last.fm listeners for everyone who has cosigned a roster artist (from
// data/cosigns.json and data/tours.json, so run fetch-cosigns.mjs and fetch-tours.mjs first), used to rank "Cosigned by" chips by fame.
// Lookup order: MusicBrainz ID, then name, then the artist's other names on MusicBrainz
// ("Ye" -> "Kanye West"). A name match whose Last.fm page carries a different MusicBrainz ID is
// accepted only if MusicBrainz redirects that ID to ours (merged duplicates); otherwise it's
// treated as a possible namesake, and the cosigner gets no fame and ranks after known ones.
// Results are cached for FAME_MAX_AGE_DAYS.
//
// Usage (from the project root):  node scripts/fetch-stats.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes)" };

// Cosignr score: each metric is log10-scaled between fixed bounds to 0–100, then averaged.
// Fixed bounds (not min/max of our roster) keep scores stable as artists are added.
const SCALE = {
  deezerFans:      [3, 8],   // 1k .. 100M fans
  lastfmListeners: [3, 7.5], // 1k .. ~32M listeners
  lastfmPlays:     [4, 9.5], // 10k .. ~3B plays
};
const FAME_MAX_AGE_DAYS = 7;
const CAVEAT_METRICS = { deezer: ["deezerFans"], lastfm: ["lastfmListeners", "lastfmPlays"] };

async function loadEnv() {
  try {
    for (const line of (await readFile(path.join(ROOT, ".env"), "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url.replace(/api_key=[^&]+/, "api_key=…")}`);
  return res.json();
}

async function deezer(id) {
  if (!id) return null;
  const d = await getJson(`https://api.deezer.com/artist/${id}`);
  if (d.error) throw new Error(d.error.message);
  return { fans: d.nb_fan, albums: d.nb_album, url: d.link };
}

async function lastfm(name, key) {
  if (!name) return null;
  const d = await getJson("https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&format=json&autocorrect=0"
    + `&artist=${encodeURIComponent(name)}&api_key=${key}`);
  if (d.error) throw new Error(d.message);
  return {
    listeners: Number(d.artist.stats.listeners),
    plays: Number(d.artist.stats.playcount),
    tags: (d.artist.tags?.tag || []).map(t => t.name),
    url: d.artist.url,
  };
}

let lastLastfm = 0;
async function lastfmInfo(params, key) {
  const wait = lastLastfm + 220 - Date.now(); // Last.fm asks for at most ~5 requests/second
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastLastfm = Date.now();
  // Last.fm reads a "+" in a name as a space unless it's encoded twice ("Florence + the Machine").
  if (params.artist) params = { ...params, artist: params.artist.replace(/\+/g, "%2B") };
  const q = new URLSearchParams({ method: "artist.getinfo", format: "json", autocorrect: "0", api_key: key, ...params });
  const d = await getJson(`https://ws.audioscrobbler.com/2.0/?${q}`);
  return d.error ? null : d.artist;
}

// Returns { listeners, name, via } or null if no trustworthy Last.fm page was found.
async function fame(mbid, name, key) {
  const byId = await lastfmInfo({ mbid }, key);
  const sameName = n => n.toLowerCase().replace(/\s+/g, " ") === name.toLowerCase().replace(/\s+/g, " ");
  if (byId && sameName(byId.name)) return { listeners: Number(byId.stats.listeners), name: byId.name, via: "mbid" };
  // The ID can point at a broken duplicate page ("Florence   The Machine"); prefer the page by
  // name if it carries our exact ID, otherwise keep the ID match.
  if (byId) {
    const byName = await lastfmInfo({ artist: name }, key);
    const best = byName?.mbid === mbid ? byName : byId;
    return { listeners: Number(best.stats.listeners), name: best.name, via: best === byName ? "name+mbid" : "mbid" };
  }
  // Last.fm may hold an old ID for an artist MusicBrainz has since merged; lookups of old IDs redirect.
  const sameArtist = async other => { try { return (await mb(`artist/${other}`)).id === mbid; } catch { return false; } };
  const trusted = async page => page && (!page.mbid || page.mbid === mbid || await sameArtist(page.mbid));
  const tried = new Set();
  const candidates = [];
  const tryName = async n => {
    if (tried.has(n.toLowerCase())) return;
    tried.add(n.toLowerCase());
    const page = await lastfmInfo({ artist: n }, key);
    if (await trusted(page)) candidates.push({ listeners: Number(page.stats.listeners), name: page.name, via: n === name ? "name" : "alias" });
  };
  await tryName(name);
  if (!candidates.length) {
    const aliases = (await mb(`artist/${mbid}?inc=aliases`)).aliases || [];
    for (const al of aliases.filter(x => !x.type || x.type === "Artist name" || x.type === "Legal name").slice(0, 5)) await tryName(al.name);
  }
  return candidates.sort((x, y) => y.listeners - x.listeners)[0] || null;
}

function score(metrics, excluded) {
  const parts = Object.entries(SCALE)
    .filter(([k]) => metrics[k] > 0 && !excluded.includes(k))
    .map(([k, [lo, hi]]) => [k, Math.min(1, Math.max(0, (Math.log10(metrics[k]) - lo) / (hi - lo))) * 100]);
  if (!parts.length) return null;
  return { value: Math.round(parts.reduce((s, [, v]) => s + v, 0) / parts.length), inputs: parts.map(([k]) => k) };
}

await loadEnv();
const LASTFM_KEY = process.env.LASTFM_API_KEY;
const { artists } = JSON.parse(await readFile(path.join(ROOT, "data/artists.json"), "utf8"));
let prev = {};
try { prev = JSON.parse(await readFile(path.join(ROOT, "data/stats.json"), "utf8")).artists; } catch {}

const today = new Date().toISOString().slice(0, 10);
const out = { generatedAt: new Date().toISOString(), scale: SCALE, sources: { deezer: true, lastfm: !!LASTFM_KEY }, artists: {} };
const snapshot = { date: today, artists: {} };

if (!LASTFM_KEY) console.log("No LASTFM_API_KEY: skipping Last.fm (keeping previous values)\n");

for (const a of artists) {
  const entry = { deezer: null, lastfm: prev[a.id]?.lastfm || null };
  try { entry.deezer = await deezer(a.ids.deezer); } catch (err) { console.warn(`  ! ${a.id} deezer: ${err.message}`); entry.deezer = prev[a.id]?.deezer || null; }
  if (LASTFM_KEY) {
    try { entry.lastfm = await lastfm(a.ids.lastfm, LASTFM_KEY); } catch (err) { console.warn(`  ! ${a.id} lastfm: ${err.message}`); }
  }

  const metrics = { deezerFans: entry.deezer?.fans, lastfmListeners: entry.lastfm?.listeners, lastfmPlays: entry.lastfm?.plays };
  const excluded = Object.keys(a.caveats || {}).flatMap(src => CAVEAT_METRICS[src] || []);
  entry.excluded = excluded;
  entry.score = score(metrics, excluded);

  out.artists[a.id] = entry;
  snapshot.artists[a.id] = { ...metrics, score: entry.score?.value ?? null };
  const n = v => (v == null ? "·" : v.toLocaleString());
  console.log(`${a.id.padEnd(16)} score ${String(entry.score?.value ?? "·").padStart(3)}  fans ${n(metrics.deezerFans).padStart(11)}  listeners ${n(metrics.lastfmListeners).padStart(10)}${excluded.length ? "  (excluded: " + excluded.join(", ") + ")" : ""}`);
}

// ---- Fame of cosigners (for ranking "Cosigned by") ----
let prevFame = {};
try { prevFame = JSON.parse(await readFile(path.join(ROOT, "data/stats.json"), "utf8")).cosigners || {}; } catch {}
out.cosigners = {};
try {
  const cosigns = JSON.parse(await readFile(path.join(ROOT, "data/cosigns.json"), "utf8"));
  try { // tour cosigns: add their pairs and names
    const tours = JSON.parse(await readFile(path.join(ROOT, "data/tours.json"), "utf8"));
    cosigns.cosigns.push(...tours.cosigns);
    for (const [mbid, a] of Object.entries(tours.artists)) cosigns.artists[mbid] ??= a;
  } catch {}
  const rosterMbids = new Map(artists.map(a => [a.ids.musicbrainz, a.id]));
  const cosigners = [...new Set(cosigns.cosigns.filter(c => rosterMbids.has(c.to)).map(c => c.from))];
  const fresh = e => e && Date.now() - Date.parse(e.fetchedAt) < FAME_MAX_AGE_DAYS * 864e5;
  let fetched = 0, unknown = 0;
  for (const mbid of cosigners) {
    const rosterId = rosterMbids.get(mbid);
    if (rosterId) { // roster artists already have Last.fm numbers above
      const l = out.artists[rosterId].lastfm;
      out.cosigners[mbid] = { listeners: l?.listeners ?? null, via: "roster" };
      continue;
    }
    if (fresh(prevFame[mbid]) || !LASTFM_KEY) { if (prevFame[mbid]) out.cosigners[mbid] = prevFame[mbid]; continue; }
    try {
      const f = await fame(mbid, cosigns.artists[mbid].name, LASTFM_KEY);
      out.cosigners[mbid] = { listeners: f?.listeners ?? null, lastfmName: f?.name ?? null, via: f?.via ?? "unknown", fetchedAt: new Date().toISOString() };
      fetched++;
      if (!f) unknown++;
    } catch (err) {
      console.warn(`  ! fame ${cosigns.artists[mbid].name}: ${err.message}`);
      if (prevFame[mbid]) out.cosigners[mbid] = prevFame[mbid];
    }
  }
  console.log(`\nCosigner fame: ${cosigners.length} cosigners, ${fetched} looked up (${unknown} not found), rest cached`);
} catch (err) {
  console.warn(`  ! cosigner fame skipped: ${err.message}`);
  out.cosigners = prevFame;
}

await writeFile(path.join(ROOT, "data/stats.json"), JSON.stringify(out, null, 2) + "\n");
await mkdir(path.join(ROOT, "data/snapshots"), { recursive: true });
await writeFile(path.join(ROOT, `data/snapshots/${today}.json`), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`\nWrote data/stats.json and data/snapshots/${today}.json`);
