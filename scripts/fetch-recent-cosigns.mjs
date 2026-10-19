#!/usr/bin/env node
// Builds data/recent-cosigns.json: cosigns from the last WINDOW_DAYS for every Trending artist
// (data/trending.json, from fetch-trending.mjs). Plan in TRENDING.md (Julian, 2026-10-19).
// fetch-cosigns.mjs reads the roster's full catalogs; this reads only recent songs, so the ~150 chart
// artists get real "Cosigns" / "Cosigned by" lists without crawling decades of releases.
//
// One MusicBrainz search per artist (paged) finds every recent recording they're credited on, so both
// directions come out of it: songs they lead (they cosign the guests) and songs they guest on (the
// lead cosigns them). Same rules as fetch-cosigns.mjs (scripts/lib/cosign-rules.mjs), plus:
//   - Official releases only (search filter), first released inside the window.
//   - No remixes, edits, flips, live or alternate versions in v1 (most "flips"/"edits" are fan uploads).
//   - Reissues don't count: a recording is skipped when its lead artist released a song with the same
//     title before (re-dated live/compilation recordings: Die With a Smile, SexyBack, Shallow).
//     Checked once per (artist, title) and cached in data/cache/mb-reissues.json.
// Roster artists are skipped (fetch-cosigns.mjs already has their whole history); pairs that
// cosigns.json already has are dropped when the cosign files are merged (src/lib/cosigns.js).
//
// Usage (from the project root):  node scripts/fetch-recent-cosigns.mjs   (~1–3 requests per artist)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { SKIP, isMashup, songKey, splitCredit, lifespans, afterEnd } from "./lib/cosign-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW_DAYS = 365;
const EVIDENCE_PER_COSIGN = 3;
const REISSUE_CACHE = path.join(ROOT, "data/cache/mb-reissues.json");
// Also covers and arrangements ("ウォーターフェル Arranged by Yuki Kishida" credited Toby Fox & the arranger).
const NOT_ORIGINAL = /\b(remix|rmx|edit|flip|rework|vip|bootleg|live|acoustic|instrumental|a cappella|acapella|sped up|slowed|demo|version|remaster(ed)?|karaoke|arranged|arrangement|cover)\b/i;

const read = async f => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
const dayBefore = d => new Date(Date.parse(d.padEnd(10, "-01")) - 864e5).toISOString().slice(0, 10);
const luceneQuote = s => `"${s.replace(/["\\]/g, " ")}"`;

const { artists: roster } = await read("data/artists.json");
const rosterMbids = new Set(roster.map(a => a.ids.musicbrainz));
const trending = (await read("data/trending.json")).artists.filter(a => a.mbid && !rosterMbids.has(a.mbid));
let reissues = {};
try { reissues = JSON.parse(await readFile(REISSUE_CACHE, "utf8")); } catch {}

// Did this artist release a song with this title before `date`? (cached: the answer doesn't change)
async function isReissue(lead, title, date) {
  const key = `${lead}|${songKey(title)}`;
  if (key in reissues) return reissues[key];
  let earlier = false;
  try {
    const q = `arid:${lead} AND recording:${luceneQuote(title)} AND firstreleasedate:[* TO ${dayBefore(date)}]`;
    const r = await mb(`recording?query=${encodeURIComponent(q)}&limit=25`);
    earlier = (r.recordings || []).some(x => songKey(x.title) === songKey(title));
  } catch (err) { console.warn(`  ! reissue check "${title}": ${err.message}`); return false; }
  reissues[key] = earlier;
  return earlier;
}

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
  if (!prev || (date && (!prev.date || date < prev.date))) e.songs.set(k, { title: rec.title, recording: rec.id, date, type });
}

console.log(`Recent cosigns since ${since} for ${trending.length} Trending artists`);
const seen = new Set(); // recordings already handled (the same song shows up under each credited artist)
for (const a of trending) {
  const before = edges.size;
  try {
    for (const r of (await mb(`artist/${a.mbid}?inc=artist-rels`)).relations || []) {
      if (r.type !== "member of band" || !r.artist) continue;
      members.add(`${a.mbid}|${r.artist.id}`);
      members.add(`${r.artist.id}|${a.mbid}`);
    }
    const q = `arid:${a.mbid} AND firstreleasedate:[${since} TO ${today}] AND status:official`;
    for (let offset = 0, total = Infinity; offset < total;) {
      const page = await mb(`recording?query=${encodeURIComponent(q)}&limit=100&offset=${offset}`);
      total = page.count;
      for (const rec of page.recordings || []) {
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        const date = rec["first-release-date"];
        if (!date || date < since || isMashup(rec) || NOT_ORIGINAL.test(rec.title) || NOT_ORIGINAL.test(rec.disambiguation || "")) continue;
        if (!(rec.releases || []).some(x => x.status === "Official")) continue;
        const { main, guests } = splitCredit(rec["artist-credit"] || []);
        if (!main.length || main.length + guests.length < 2) continue;
        if (await isReissue(main[0].mbid, rec.title, date)) continue;
        for (const m of main) for (const g of guests) add(m, g, "feature", rec);
        for (const m of main) for (const n of main) add(m, n, "collab", rec);
      }
      offset += (page.recordings || []).length;
      if (!(page.recordings || []).length) break;
    }
  } catch (err) { console.warn(`  ! ${a.name}: ${err.message}`); }
  console.log(`${a.name.slice(0, 28).padEnd(28)} +${edges.size - before}`);
}
await mkdir(path.dirname(REISSUE_CACHE), { recursive: true });
await writeFile(REISSUE_CACHE, JSON.stringify(reissues) + "\n");

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
await writeFile(path.join(ROOT, "data/recent-cosigns.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "MusicBrainz (https://musicbrainz.org), CC0",
  window: { since, until: today },
  artists: Object.fromEntries(Object.entries(names).map(([mbid, name]) => [mbid, { name }])),
  cosigns,
}) + "\n");
console.log(`\nWrote data/recent-cosigns.json: ${cosigns.length} cosigns between ${Object.keys(names).length} artists`);
