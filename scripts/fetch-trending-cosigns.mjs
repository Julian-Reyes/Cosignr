#!/usr/bin/env node
// Builds data/trending-cosigns.json: every cosign of every Trending artist (data/trending.json, from
// fetch-trending.mjs), over their whole history like the roster's (Julian, 2026-10-19: "go before
// 12 months"). fetch-cosigns.mjs crawls the 12 roster artists' release lists; this uses MusicBrainz's
// recording search instead (100 songs per request), which is much cheaper for ~110 chart artists.
//
// One paged search per artist finds every recording they're credited on, so both directions come out
// of it: songs they lead (they cosign the guests) and songs they guest on (the lead cosigns them).
// Same rules as fetch-cosigns.mjs (scripts/lib/cosign-rules.mjs), plus:
//   - Official releases only (search filter `status:official`).
//   - No remixes, edits, flips, covers/arrangements, live or alternate versions (most "flips"/"edits"
//     are fan uploads; arrangements credit the original artist with the arranger).
// Each song keeps its earliest date, so a reissue or re-dated live recording can't make an old cosign
// look new. Roster artists are skipped (fetch-cosigns.mjs already has their whole history); pairs that
// cosigns.json already has keep the cosigns.json version when the files are merged (src/lib/cosigns.js).
//
// Usage (from the project root):  node scripts/fetch-trending-cosigns.mjs   (1 request per 100 songs)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { SKIP, isMashup, songKey, splitCredit, lifespans, afterEnd } from "./lib/cosign-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PER_COSIGN = 3;
// Also covers and arrangements ("ウォーターフェル Arranged by Yuki Kishida" credited Toby Fox & the arranger).
const NOT_ORIGINAL = /\b(remix|rmx|edit|flip|rework|vip|bootleg|live|acoustic|instrumental|a cappella|acapella|sped up|slowed|demo|version|remaster(ed)?|karaoke|arranged|arrangement|cover)\b/i;

const read = async f => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));
const { artists: roster } = await read("data/artists.json");
const rosterMbids = new Set(roster.map(a => a.ids.musicbrainz));
const trending = (await read("data/trending.json")).artists.filter(a => a.mbid && !rosterMbids.has(a.mbid));

const names = {};
const edges = new Map();
const members = new Set();
function add(from, to, type, rec) {
  if (from.mbid === to.mbid || members.has(`${from.mbid}|${to.mbid}`)) return;
  names[from.mbid] = from.name;
  names[to.mbid] = to.name;
  const key = `${from.mbid}|${to.mbid}`;
  let e = edges.get(key);
  if (!e) edges.set(key, e = { from: from.mbid, to: to.mbid, songs: new Map() });
  const k = songKey(rec.title);
  const date = rec["first-release-date"] || null;
  const prev = e.songs.get(k);
  // Keep the earliest dated version of each song as its evidence.
  if (!prev || (date && (!prev.date || date < prev.date))) e.songs.set(k, { title: rec.title, recording: rec.id, date, type });
}

console.log(`Cosigns (full history) for ${trending.length} Trending artists`);
const started = Date.now();
const seen = new Set(); // recordings already handled (the same song shows up under each credited artist)
for (const a of trending) {
  const before = edges.size;
  let total = 0;
  try {
    for (const r of (await mb(`artist/${a.mbid}?inc=artist-rels`)).relations || []) {
      if (r.type !== "member of band" || !r.artist) continue;
      members.add(`${a.mbid}|${r.artist.id}`);
      members.add(`${r.artist.id}|${a.mbid}`);
    }
    const q = `arid:${a.mbid} AND status:official`;
    for (let offset = 0, count = Infinity; offset < count;) {
      const page = await mb(`recording?query=${encodeURIComponent(q)}&limit=100&offset=${offset}`);
      count = total = page.count;
      for (const rec of page.recordings || []) {
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        if (isMashup(rec) || NOT_ORIGINAL.test(rec.title) || NOT_ORIGINAL.test(rec.disambiguation || "")) continue;
        if (!(rec.releases || []).some(x => x.status === "Official")) continue;
        const { main, guests } = splitCredit(rec["artist-credit"] || []);
        if (!main.length || main.length + guests.length < 2) continue;
        for (const m of main) for (const g of guests) add(m, g, "feature", rec);
        for (const m of main) for (const n of main) add(m, n, "collab", rec);
      }
      offset += (page.recordings || []).length;
      if (!(page.recordings || []).length) break;
    }
  } catch (err) { console.warn(`  ! ${a.name}: ${err.message}`); }
  console.log(`${a.name.slice(0, 28).padEnd(28)} ${String(total).padStart(5)} recordings  +${edges.size - before}`);
}
console.log(`Searched in ${Math.round((Date.now() - started) / 60000)} min`);

// Posthumous filter (same as fetch-cosigns.mjs).
const all = [...edges.values()].filter(e => !SKIP.has(e.from) && !SKIP.has(e.to));
const ends = await lifespans(all.map(e => e.from), names);
for (const e of all) for (const [k, s] of e.songs) if (afterEnd(s.date, ends[e.from]?.end)) e.songs.delete(k);

const cosigns = all.filter(e => e.songs.size).map(e => {
  const songs = [...e.songs.values()].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const dates = songs.map(s => s.date).filter(Boolean).sort();
  return {
    from: e.from, to: e.to,
    types: [...new Set(songs.map(s => s.type))].sort(),
    songs: songs.length,
    vouches: songs.filter(s => s.type !== "collab").length,
    first: dates[0] || null,
    last: dates.at(-1) || null,
    evidence: songs.slice(0, EVIDENCE_PER_COSIGN).map(s => ({ ...s, url: `https://musicbrainz.org/recording/${s.recording}` })),
  };
}).sort((x, y) => y.vouches - x.vouches || y.songs - x.songs || (y.last || "").localeCompare(x.last || ""));

for (const k of Object.keys(names)) if (!cosigns.some(c => c.from === k || c.to === k)) delete names[k];
await writeFile(path.join(ROOT, "data/trending-cosigns.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "MusicBrainz (https://musicbrainz.org), CC0",
  artists: Object.fromEntries(Object.entries(names).map(([mbid, name]) => [mbid, { name }])),
  cosigns,
}) + "\n");
console.log(`\nWrote data/trending-cosigns.json: ${cosigns.length} cosigns between ${Object.keys(names).length} artists`);
