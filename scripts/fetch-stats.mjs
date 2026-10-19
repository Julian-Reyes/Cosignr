#!/usr/bin/env node
// Builds data/stats.json (latest numbers) and data/snapshots/<date>.json (daily history)
// for everyone with a page: data/artists.json (roster) + data/extended.json (top cosigners).
//   - Deezer:  fan count (no key needed)
//   - Last.fm: listeners, playcount, tags (needs LASTFM_API_KEY in .env or the environment)
// Sources without a key are skipped, and their previous values in stats.json are kept.
// A metric listed under an artist's `caveats` is fetched but left out of the score.
//
// Also fetches Last.fm listeners ("fame", stored under `cosigners`) for everyone linked to a page
// artist: their cosigners (to rank "Cosigned by" chips) and the artists they cosigned (for the
// "Famous" sort on artist pages). Reads data/cosigns.json, recent-cosigns.json, tours.json and
// upcoming.json, so run those scripts first.
// Lookup order: MusicBrainz ID, then name, then the artist's other names on MusicBrainz
// ("Ye" -> "Kanye West"). A name match whose Last.fm page carries a different MusicBrainz ID is
// accepted only if MusicBrainz redirects that ID to ours (merged duplicates); otherwise it's
// treated as a possible namesake, and the cosigner gets no fame and ranks after known ones.
// Results are cached for FAME_MAX_AGE_DAYS.
//
// Watch list (for "rising" later): artists a page artist cosigned in the last WATCH_YEARS years get
// their Last.fm listeners refreshed every night (not cached) and saved in the snapshot under `watch`,
// keyed by MusicBrainz ID. Only artists whose Last.fm page was already verified by the fame lookup.
//
// Usage (from the project root):  node scripts/fetch-stats.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { loadArtists } from "./lib/artists.mjs";

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
const WATCH_YEARS = 2;
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
  const a = await lastfmInfo({ artist: name }, key);
  if (!a) throw new Error(`no Last.fm page for "${name}"`);
  return {
    listeners: Number(a.stats.listeners),
    plays: Number(a.stats.playcount),
    tags: (a.tags?.tag || []).map(t => t.name),
    url: a.url,
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
  // Last.fm sometimes answers 503 for a few minutes (2026-10-19: 24 artists lost their numbers): retry.
  for (let attempt = 1; ; attempt++) {
    try {
      const d = await getJson(`https://ws.audioscrobbler.com/2.0/?${q}`);
      return d.error ? null : d.artist;
    } catch (err) {
      if (!/^5\d\d /.test(err.message) || attempt >= 4) throw err;
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
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
const artists = await loadArtists();
let prev = {};
try { prev = JSON.parse(await readFile(path.join(ROOT, "data/stats.json"), "utf8")).artists; } catch {}

const today = new Date().toISOString().slice(0, 10);
const out = { generatedAt: new Date().toISOString(), scale: SCALE, sources: { deezer: true, lastfm: !!LASTFM_KEY }, artists: {} };
const snapshot = { date: today, artists: {} };

if (!LASTFM_KEY) console.log("No LASTFM_API_KEY: skipping Last.fm (keeping previous values)\n");

// Extended artists' Last.fm page is found with the same checks as cosigner fame (MusicBrainz ID, then
// name, then aliases: "Ye" must land on Kanye West's page, not the smaller "Ye" page). The verified
// page name is kept in stats.json for FAME_MAX_AGE_DAYS. Roster artists use their hand-checked ids.lastfm.
const isFresh = e => e?.fetchedAt && Date.now() - Date.parse(e.fetchedAt) < FAME_MAX_AGE_DAYS * 864e5;
async function lastfmName(a) {
  if (!a.extended) return { name: a.ids.lastfm };
  const cached = prev[a.id]?.lastfmVerified;
  if (isFresh(cached)) return cached;
  const f = await fame(a.ids.musicbrainz, a.name, LASTFM_KEY);
  return { name: f?.name ?? null, via: f?.via ?? "unknown", fetchedAt: new Date().toISOString() };
}

for (const a of artists) {
  const entry = { deezer: null, lastfm: prev[a.id]?.lastfm || null };
  try { entry.deezer = await deezer(a.ids.deezer); } catch (err) { console.warn(`  ! ${a.id} deezer: ${err.message}`); entry.deezer = prev[a.id]?.deezer || null; }
  if (LASTFM_KEY) {
    try {
      const verified = await lastfmName(a);
      if (a.extended) entry.lastfmVerified = verified;
      entry.lastfm = verified.name ? await lastfm(verified.name, LASTFM_KEY) : null;
    } catch (err) { console.warn(`  ! ${a.id} lastfm: ${err.message}`); }
  } else if (prev[a.id]?.lastfmVerified) entry.lastfmVerified = prev[a.id].lastfmVerified;

  const metrics = { deezerFans: entry.deezer?.fans, lastfmListeners: entry.lastfm?.listeners, lastfmPlays: entry.lastfm?.plays };
  const excluded = Object.keys(a.caveats || {}).flatMap(src => CAVEAT_METRICS[src] || []);
  entry.excluded = excluded;
  entry.score = score(metrics, excluded);

  out.artists[a.id] = entry;
  snapshot.artists[a.id] = { ...metrics, score: entry.score?.value ?? null };
  const n = v => (v == null ? "·" : v.toLocaleString());
  console.log(`${a.id.padEnd(16)} score ${String(entry.score?.value ?? "·").padStart(3)}  fans ${n(metrics.deezerFans).padStart(11)}  listeners ${n(metrics.lastfmListeners).padStart(10)}${excluded.length ? "  (excluded: " + excluded.join(", ") + ")" : ""}`);
}

// ---- Fame of linked artists (ranking "Cosigned by", "Famous" sort) ----
let prevFame = {};
try { prevFame = JSON.parse(await readFile(path.join(ROOT, "data/stats.json"), "utf8")).cosigners || {}; } catch {}
out.cosigners = {};
try {
  const cosigns = JSON.parse(await readFile(path.join(ROOT, "data/cosigns.json"), "utf8"));
  for (const file of ["recent-cosigns.json", "tours.json", "upcoming.json"]) { // recent songs, tours, touring band, upcoming
    try {
      const more = JSON.parse(await readFile(path.join(ROOT, "data", file), "utf8"));
      cosigns.cosigns.push(...more.cosigns);
      for (const [mbid, a] of Object.entries(more.artists)) cosigns.artists[mbid] ??= a;
    } catch {}
  }
  const rosterMbids = new Map(artists.map(a => [a.ids.musicbrainz, a.id])); // everyone with a page
  const cosigners = [...new Set(cosigns.cosigns.flatMap(c => [
    ...(rosterMbids.has(c.to) ? [c.from] : []),   // who vouched for someone with a page
    ...(rosterMbids.has(c.from) ? [c.to] : []),   // who page artists vouched for ("Famous" sort)
  ]))].filter(m => cosigns.artists[m]);
  const fresh = e => e && Date.now() - Date.parse(e.fetchedAt) < FAME_MAX_AGE_DAYS * 864e5;
  let fetched = 0, unknown = 0;
  for (const mbid of cosigners) {
    const rosterId = rosterMbids.get(mbid);
    if (rosterId) { // artists with a page already have Last.fm numbers above
      const s = out.artists[rosterId];
      const name = s.lastfmVerified?.name ?? artists.find(x => x.id === rosterId).ids.lastfm;
      out.cosigners[mbid] = { listeners: s.lastfm?.listeners ?? null, lastfmName: name ?? null, via: "page" };
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

  // Watch list: refresh listeners nightly for everyone a page artist cosigned recently.
  const since = new Date(Date.now() - WATCH_YEARS * 365.25 * 864e5).toISOString().slice(0, 10);
  const watch = [...new Set(cosigns.cosigns
    .filter(c => rosterMbids.has(c.from) && !rosterMbids.has(c.to) && c.last && c.last >= since)
    .map(c => c.to))];
  snapshot.watch = {};
  let watched = 0;
  for (const mbid of watch) {
    const f = out.cosigners[mbid];
    if (!f?.lastfmName || f.listeners == null) continue; // no verified Last.fm page
    if (LASTFM_KEY && f.fetchedAt?.slice(0, 10) !== today) {
      try {
        const page = await lastfmInfo(f.via === "mbid" ? { mbid } : { artist: f.lastfmName }, LASTFM_KEY);
        if (page?.name === f.lastfmName) { f.listeners = Number(page.stats.listeners); watched++; } // same page as verified
        else console.warn(`  ! watch ${f.lastfmName}: Last.fm returned "${page?.name}", keeping cached number`);
      } catch (err) { console.warn(`  ! watch ${f.lastfmName}: ${err.message}`); }
    }
    snapshot.watch[mbid] = { name: cosigns.artists[mbid].name, lastfmListeners: f.listeners };
  }
  console.log(`Watch list: ${watch.length} artists cosigned since ${since}, ${Object.keys(snapshot.watch).length} with a Last.fm page (${watched} refreshed)`);
} catch (err) {
  console.warn(`  ! cosigner fame skipped: ${err.message}`);
  out.cosigners = prevFame;
}

await writeFile(path.join(ROOT, "data/stats.json"), JSON.stringify(out, null, 2) + "\n");
await mkdir(path.join(ROOT, "data/snapshots"), { recursive: true });
await writeFile(path.join(ROOT, `data/snapshots/${today}.json`), JSON.stringify(snapshot, null, 2) + "\n");
console.log(`\nWrote data/stats.json and data/snapshots/${today}.json`);
