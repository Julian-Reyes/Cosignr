#!/usr/bin/env node
// Builds data/stats.json (latest numbers) and data/snapshots/<date>.json (daily history)
// from the IDs in data/artists.json.
//   - Deezer:  fan count (no key needed)
//   - Last.fm: listeners, playcount, tags (needs LASTFM_API_KEY in .env or the environment)
// Sources without a key are skipped, and their previous values in stats.json are kept.
// A metric listed under an artist's `caveats` is fetched but left out of the score.
//
// Usage (from the project root):  node scripts/fetch-stats.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes)" };

// Cosignr score: each metric is log10-scaled between fixed bounds to 0–100, then averaged.
// Fixed bounds (not min/max of our roster) keep scores stable as artists are added.
const SCALE = {
  deezerFans:      [3, 8],   // 1k .. 100M fans
  lastfmListeners: [3, 7.5], // 1k .. ~32M listeners
  lastfmPlays:     [4, 9.5], // 10k .. ~3B plays
};
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

await writeFile(path.join(ROOT, "data/stats.json"), JSON.stringify(out, null, 2) + "\n");
await mkdir(path.join(ROOT, "data/snapshots"), { recursive: true });
await writeFile(path.join(ROOT, `data/snapshots/${today}.json`), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`\nWrote data/stats.json and data/snapshots/${today}.json`);
