#!/usr/bin/env node
// Builds data/upcoming.json: upcoming shows where a roster artist headlines with an opener, or opens
// for someone, from the Ticketmaster Discovery API (needs TICKETMASTER_API_KEY in .env or the env).
// The headliner (first act Ticketmaster lists) cosigns every other act on the bill.
//
// This is live data, not a permanent record: Ticketmaster's terms allow caching only "for reasonable
// periods", so the file is rebuilt nightly from scratch and only holds shows that haven't happened.
// (The page also hides shows whose date has passed, in case a nightly run fails.)
//
// Matching is exact: roster artists are recognised by their MusicBrainz or Spotify ID (Ticketmaster's
// MusicBrainz links are often missing or out of date: The xx has none). Other acts on a bill count only
// if Ticketmaster links them to MusicBrainz, which also drops listings that aren't artists
// ("Co-op Live - Premium Experiences"). Festivals are skipped (Julian, 2026-10-15), and so are tribute
// and DJ party nights that Ticketmaster tags with an artist ("Drake vs Bad Bunny Dance Night").
//
// Usage (from the project root):  node scripts/fetch-upcoming.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes/Cosignr)" };
const MAX_ACTS = 4; // more acts on one bill than this is a festival-style line-up
const FESTIVAL = /\bfest(ival)?\b/i;
const NOT_THE_ARTIST = /\b(vs\.?|versus|tribute|night|party|karaoke|experience|celebration|in concert)\b/i;

async function loadEnv() {
  try {
    for (const line of (await readFile(path.join(ROOT, ".env"), "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

let last = 0;
async function tm(endpoint, params) {
  const wait = last + 250 - Date.now(); // Ticketmaster allows 5 requests/second
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const q = new URLSearchParams({ ...params, apikey: process.env.TICKETMASTER_API_KEY });
  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/${endpoint}.json?${q}`, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${endpoint} ${JSON.stringify(params)}`);
  return res.json();
}


await loadEnv();
if (!process.env.TICKETMASTER_API_KEY) {
  console.log("No TICKETMASTER_API_KEY: keeping the previous data/upcoming.json");
  process.exit(0);
}

const { artists } = JSON.parse(await readFile(path.join(ROOT, "data/artists.json"), "utf8"));
const roster = Object.fromEntries(artists.filter(a => a.ids.musicbrainz).map(a => [a.ids.musicbrainz, a.id]));
const bySpotify = Object.fromEntries(artists.filter(a => a.ids.spotify && a.ids.musicbrainz).map(a => [a.ids.spotify, a.ids.musicbrainz]));
const today = new Date().toISOString().slice(0, 10);

// MusicBrainz ID for a Ticketmaster attraction: the roster artist it's linked to (by MusicBrainz or
// Spotify ID), else Ticketmaster's own MusicBrainz link, else null (can't be matched exactly).
function mbidOf(a) {
  const mbids = (a.externalLinks?.musicbrainz || []).map(x => x.id);
  const spotify = (a.externalLinks?.spotify || []).map(x => x.url?.match(/artist\/([A-Za-z0-9]+)/)?.[1]);
  return mbids.find(m => roster[m]) || spotify.map(id => bySpotify[id]).find(Boolean) || mbids[0] || null;
}
const isArtist = a => a.classifications?.[0]?.segment?.name === "Music" && mbidOf(a);
const names = {};
const pairs = new Map(); // "from|to" -> { from, to, shows: [{ tour, date, city, url }] }
const seen = new Set();  // event IDs (a show can come up under both acts)

for (const a of artists) {
  const mbid = a.ids.musicbrainz;
  if (!mbid) continue;
  const found = (await tm("attractions", { keyword: a.name, size: "20" }))._embedded?.attractions || [];
  const page = found.find(x => mbidOf(x) === mbid);
  if (!page) { console.log(`${a.id.padEnd(16)} no Ticketmaster page linked to their MusicBrainz or Spotify ID`); continue; }

  let kept = 0, festivals = 0;
  for (let p = 0, pages = 1; p < pages && p < 5; p++) {
    const d = await tm("events", { attractionId: page.id, size: "200", page: String(p), sort: "date,asc" });
    pages = d.page?.totalPages || 0;
    for (const ev of d._embedded?.events || []) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      const date = ev.dates?.start?.localDate;
      if (!date || date < today) continue;
      const music = (ev._embedded?.attractions || []).filter(x => x.classifications?.[0]?.segment?.name === "Music");
      const types = (ev.classifications || []).flatMap(c => [c.type?.name, c.subType?.name]);
      if (NOT_THE_ARTIST.test(ev.name)) continue;
      if (FESTIVAL.test(ev.name) || types.some(t => FESTIVAL.test(t || "")) || music.length > MAX_ACTS) { festivals++; continue; }
      const acts = music.filter(isArtist);
      const [head, ...openers] = acts;
      if (!head || music[0] !== head) continue; // headliner not linked to MusicBrainz: can't place the show
      for (const o of openers) {
        const from = mbidOf(head), to = mbidOf(o);
        if (from === to || (!roster[from] && !roster[to])) continue;
        names[from] = head.name;
        names[to] = o.name;
        const key = `${from}|${to}`;
        if (!pairs.has(key)) pairs.set(key, { from, to, shows: [] });
        pairs.get(key).shows.push({ tour: ev.name, date, city: ev._embedded?.venues?.[0]?.city?.name || null, url: ev.url });
        kept++;
      }
    }
  }
  console.log(`${a.id.padEnd(16)} ${String(page.upcomingEvents?._total ?? "?").padStart(3)} upcoming  ${kept} with openers  (${festivals} festival shows skipped)`);
}

const cosigns = [...pairs.values()].map(p => {
  const shows = p.shows.sort((x, y) => x.date.localeCompare(y.date));
  return { from: p.from, to: p.to, types: ["upcoming"], shows: shows.length, first: shows[0].date, last: shows.at(-1).date, next: shows[0] };
}).sort((x, y) => x.first.localeCompare(y.first));

const out = {
  generatedAt: new Date().toISOString(),
  source: "Ticketmaster Discovery API (live listings, rebuilt nightly)",
  artists: Object.fromEntries(Object.entries(names).map(([mbid, name]) => [mbid, roster[mbid] ? { name, id: roster[mbid] } : { name }])),
  cosigns,
};
await writeFile(path.join(ROOT, "data/upcoming.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nWrote data/upcoming.json: ${cosigns.length} upcoming tour pairs`);
for (const c of cosigns) console.log(`  ${names[c.from]} → ${names[c.to]}: ${c.next.tour}, ${c.shows} show${c.shows > 1 ? "s" : ""} from ${c.first}`);
