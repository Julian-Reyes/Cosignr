#!/usr/bin/env node
// Builds data/cosigns.json: who has vouched for whom, with evidence, from MusicBrainz credits.
// Free, no key. MusicBrainz allows 1 request/second, so a full run takes a few minutes.
//
// Rules (one recording can produce several cosigns):
//   feature  "A feat. B"         A cosigns B (the main artist chose to put B on their song)
//   collab   "A & B", "A x B"    A and B cosign each other
//   remix    B remixed A's song  A cosigns B (official remixes are approved by the original artist)
// Only songs on at least one Official release count (MusicBrainz release status), which drops
// bootlegs, fan mashup tapes and unofficial DJ edits.
// Skipped: DJ-mix segments, mashups and medleys (credits list everyone sampled, not collaborators),
// pairs between a band and its own members, and pairs where neither artist is on our roster.
// Posthumous: a song released after the cosigner died (or after a band split up) doesn't count,
// because a cosign means the artist personally vouched. End dates are cached in
// data/cache/mb-lifespans.json and refreshed after LIFESPAN_MAX_AGE_DAYS.
// Cosigns are grouped per (from, to) pair. `songs` counts distinct song titles, so versions,
// edits and remixes of one song count once. `vouches` counts the songs that are a feature or remix:
// explicit vouching, which ranks above collab-only pairs (often duo partners or joint albums).
//
// Usage (from the project root):  node scripts/fetch-cosigns.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PER_COSIGN = 3;
const MAX_REMIX_LOOKUPS = 60; // per artist; each is one request
const LIFESPAN_MAX_AGE_DAYS = 30;
const LIFESPAN_CACHE = path.join(ROOT, "data/cache/mb-lifespans.json");
// Special-purpose MusicBrainz artists that aren't real people or groups.
const SKIP = new Set([
  "89ad4ac3-39f7-470e-963a-56509c546377", // Various Artists
  "125ec42a-7229-4250-afc5-e057484327fe", // [unknown]
  "f731ccc4-e22a-43af-a747-64213329e088", // [anonymous]
  "9be7f096-97ec-4615-8957-8d40b5dcbc41", // [traditional]
]);
const FEAT = /\b(feat|ft|featuring|with)\b\.?/i;
// "bootleg" in a title is an unofficial remix even when a producer puts it on an official release.
const isMashup = rec => / \/ |\bmedley\b|\bmash-?up\b|\bmegamix\b|\bbootleg\b/i.test(rec.title)
  || /dj-?mix|mash-?up/i.test(rec.disambiguation || "");

const songKey = title => title.toLowerCase().replace(/\s*[([].*?[)\]]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Splits an artist credit into main artists and guests.
function splitCredit(credit) {
  const main = [], guests = [];
  let target = main;
  for (const c of credit) {
    if (!SKIP.has(c.artist.id)) target.push({ mbid: c.artist.id, name: c.artist.name });
    if (FEAT.test(c.joinphrase || "")) target = guests;
  }
  return { main, guests };
}

const names = {};       // mbid -> name
const members = new Set(); // "band|member" and "member|band" for roster bands
const edges = new Map(); // "from|to" -> edge
const official = new Set(); // recording IDs that appear on at least one Official release

function add(from, to, type, rec) {
  if (from.mbid === to.mbid || members.has(`${from.mbid}|${to.mbid}`)) return;
  names[from.mbid] = from.name;
  names[to.mbid] = to.name;
  const key = `${from.mbid}|${to.mbid}`;
  let e = edges.get(key);
  if (!e) edges.set(key, e = { from: from.mbid, to: to.mbid, types: new Set(), songs: new Map() });
  e.types.add(type);
  const k = songKey(rec.title);
  const date = rec["first-release-date"] || null;
  const prev = e.songs.get(k);
  // Keep the earliest dated version of each song as its evidence.
  if (!prev || (date && (!prev.date || date < prev.date))) e.songs.set(k, { title: rec.title, recording: rec.id, date, type });
}

function fromRecording(rec) {
  if (isMashup(rec) || !official.has(rec.id)) return;
  const { main, guests } = splitCredit(rec["artist-credit"] || []);
  for (const a of main) for (const g of guests) add(a, g, "feature", rec);
  for (const a of main) for (const b of main) add(a, b, "collab", rec);
  for (const rel of rec.relations || []) {
    if (rel.type !== "remixer" || !rel.artist || SKIP.has(rel.artist.id)) continue;
    for (const a of main) add(a, { mbid: rel.artist.id, name: rel.artist.name }, "remix", rec);
  }
}

const { artists } = JSON.parse(await readFile(path.join(ROOT, "data/artists.json"), "utf8"));

for (const a of artists) {
  const mbid = a.ids.musicbrainz;
  if (!mbid) continue;
  const before = edges.size;

  // 0. Band members (and bands a solo artist belongs to), so they don't count as cosigns.
  for (const r of (await mb(`artist/${mbid}?inc=artist-rels`)).relations || []) {
    if (r.type !== "member of band") continue;
    members.add(`${mbid}|${r.artist.id}`);
    members.add(`${r.artist.id}|${mbid}`);
  }

  // 1. Recordings on the artist's official releases. `artist` lists releases credited to them;
  //    `track_artist` lists only releases where they're on a track but NOT the release artist.
  for (const param of ["artist", "track_artist"]) {
    for (let offset = 0, count = Infinity; offset < count;) {
      const page = await mb(`release?${param}=${mbid}&status=official&inc=recordings&limit=100&offset=${offset}`);
      count = page["release-count"];
      for (const rel of page.releases) for (const m of rel.media || []) for (const t of m.tracks || []) official.add(t.recording.id);
      offset += page.releases.length;
      if (!page.releases.length) break;
    }
  }

  // 2. Every recording the artist is credited on (features, collabs, remixes of their songs).
  let offset = 0, total = Infinity;
  while (offset < total) {
    const page = await mb(`recording?artist=${mbid}&inc=artist-credits+artist-rels&limit=100&offset=${offset}`);
    total = page["recording-count"];
    page.recordings.forEach(fromRecording);
    offset += page.recordings.length;
    if (!page.recordings.length) break;
  }

  // 3. Remixes the artist made of other people's songs (credited to the original artist only).
  const rels = (await mb(`artist/${mbid}?inc=recording-rels`)).relations || [];
  const remixes = rels.filter(r => r.type === "remixer" && r.direction === "forward").slice(0, MAX_REMIX_LOOKUPS);
  for (const r of remixes) {
    try {
      const rec = await mb(`recording/${r.recording.id}?inc=artist-credits+releases`);
      if (isMashup(rec) || !(rec.releases || []).some(x => x.status === "Official")) continue;
      const { main } = splitCredit(rec["artist-credit"] || []);
      for (const orig of main) add(orig, { mbid, name: a.name }, "remix", rec);
    } catch (err) {
      console.warn(`  ! ${a.id} remix ${r.recording.id}: ${err.message}`);
    }
  }
  console.log(`${a.id.padEnd(16)} ${String(total).padStart(5)} recordings  ${String(remixes.length).padStart(3)} remixes  +${edges.size - before} cosigns`);
}

const roster = Object.fromEntries(artists.filter(a => a.ids.musicbrainz).map(a => [a.ids.musicbrainz, a.id]));
const kept = [...edges.values()].filter(e => roster[e.from] || roster[e.to]);

// Posthumous filter: look up when each cosigner died or split up (cached).
let lifespans = {};
try { lifespans = JSON.parse(await readFile(LIFESPAN_CACHE, "utf8")); } catch {}
const stale = e => !e || Date.now() - Date.parse(e.fetchedAt) > LIFESPAN_MAX_AGE_DAYS * 864e5;
const cosigners = [...new Set(kept.map(e => e.from))].filter(m => stale(lifespans[m]));
console.log(`\nLooking up end dates for ${cosigners.length} cosigners (rest cached)…`);
for (const m of cosigners) {
  try {
    const a = await mb(`artist/${m}`);
    lifespans[m] = { end: a["life-span"]?.end || null, ended: !!a["life-span"]?.ended, type: a.type || null, fetchedAt: new Date().toISOString() };
  } catch (err) { console.warn(`  ! lifespan ${names[m]}: ${err.message}`); }
}
await mkdir(path.dirname(LIFESPAN_CACHE), { recursive: true });
await writeFile(LIFESPAN_CACHE, JSON.stringify(lifespans) + "\n");

// Partial dates ("2018", "2018-06"): pad the song date to its earliest day and the end date to its
// latest ("2018" -> "2018-31-31" sorts after every real 2018 date), so only clear cases are dropped.
const after = (date, end) => date && end && date.padEnd(10, "-01") > end.padEnd(10, "-31");
let posthumous = 0;
for (const e of kept) {
  const end = lifespans[e.from]?.end;
  for (const [k, song] of e.songs) if (after(song.date, end)) { e.songs.delete(k); posthumous++; }
}
console.log(`Dropped ${posthumous} posthumous songs`);

const cosigns = kept.filter(e => e.songs.size).map(e => {
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
const out = {
  generatedAt: new Date().toISOString(),
  source: "MusicBrainz (https://musicbrainz.org), CC0",
  artists: Object.fromEntries(Object.entries(names).map(([mbid, name]) => [mbid, roster[mbid] ? { name, id: roster[mbid] } : { name }])),
  cosigns,
};
await writeFile(path.join(ROOT, "data/cosigns.json"), JSON.stringify(out) + "\n");
console.log(`\nWrote data/cosigns.json: ${cosigns.length} cosigns between ${Object.keys(names).length} artists`);
