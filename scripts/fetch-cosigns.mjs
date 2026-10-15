#!/usr/bin/env node
// Builds data/cosigns.json: who has vouched for whom, with evidence, from MusicBrainz credits.
// Free, no key. MusicBrainz allows 1 request/second, so a full run takes a few minutes.
//
// Rules (one recording can produce several cosigns):
//   feature  "A feat. B"         A cosigns B (the main artist chose to put B on their song)
//   collab   "A & B", "A x B"    A and B cosign each other
//   remix    B remixed A's song  A cosigns B (official remixes are approved by the original artist)
// Skipped: DJ-mix segments, mashups and medleys (credits list everyone sampled, not collaborators),
// pairs between a band and its own members, and pairs where neither artist is on our roster.
// Cosigns are grouped per (from, to) pair. `songs` counts distinct song titles, so versions,
// edits and remixes of one song count once. `vouches` counts the songs that are a feature or remix:
// explicit vouching, which ranks above collab-only pairs (often duo partners or joint albums).
//
// Usage (from the project root):  node scripts/fetch-cosigns.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_PER_COSIGN = 3;
const MAX_REMIX_LOOKUPS = 60; // per artist; each is one request
// Special-purpose MusicBrainz artists that aren't real people or groups.
const SKIP = new Set([
  "89ad4ac3-39f7-470e-963a-56509c546377", // Various Artists
  "125ec42a-7229-4250-afc5-e057484327fe", // [unknown]
  "f731ccc4-e22a-43af-a747-64213329e088", // [anonymous]
  "9be7f096-97ec-4615-8957-8d40b5dcbc41", // [traditional]
]);
const FEAT = /\b(feat|ft|featuring|with)\b\.?/i;
const isMashup = rec => / \/ |\bmedley\b|\bmash-?up\b|\bmegamix\b/i.test(rec.title)
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
  if (isMashup(rec)) return;
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

  // 1. Every recording the artist is credited on (features, collabs, remixes of their songs).
  let offset = 0, total = Infinity;
  while (offset < total) {
    const page = await mb(`recording?artist=${mbid}&inc=artist-credits+artist-rels&limit=100&offset=${offset}`);
    total = page["recording-count"];
    page.recordings.forEach(fromRecording);
    offset += page.recordings.length;
    if (!page.recordings.length) break;
  }

  // 2. Remixes the artist made of other people's songs (credited to the original artist only).
  const rels = (await mb(`artist/${mbid}?inc=recording-rels`)).relations || [];
  const remixes = rels.filter(r => r.type === "remixer" && r.direction === "forward").slice(0, MAX_REMIX_LOOKUPS);
  for (const r of remixes) {
    try {
      const rec = await mb(`recording/${r.recording.id}?inc=artist-credits`);
      if (isMashup(rec)) continue;
      const { main } = splitCredit(rec["artist-credit"] || []);
      for (const orig of main) add(orig, { mbid, name: a.name }, "remix", rec);
    } catch (err) {
      console.warn(`  ! ${a.id} remix ${r.recording.id}: ${err.message}`);
    }
  }
  console.log(`${a.id.padEnd(16)} ${String(total).padStart(5)} recordings  ${String(remixes.length).padStart(3)} remixes  +${edges.size - before} cosigns`);
}

const roster = Object.fromEntries(artists.filter(a => a.ids.musicbrainz).map(a => [a.ids.musicbrainz, a.id]));
const cosigns = [...edges.values()].filter(e => roster[e.from] || roster[e.to]).map(e => {
  const songs = [...e.songs.values()].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const dates = songs.map(s => s.date).filter(Boolean).sort();
  return {
    from: e.from, to: e.to,
    types: [...e.types].sort(),
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
