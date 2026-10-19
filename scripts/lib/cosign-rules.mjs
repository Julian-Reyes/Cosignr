// Cosign rules shared by fetch-cosigns.mjs (full catalogs of the roster) and fetch-recent-cosigns.mjs
// (last 12 months of the Trending artists), so both read MusicBrainz credits the same way.
//   "A feat. B"  A cosigns B (feature)      "A & B"  both ways (collab)
// Skipped: DJ-mix segments, mashups and medleys, bootlegs, special artists (Various Artists…),
// band ↔ own member, and songs released after the cosigner died or split up.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./musicbrainz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Special-purpose MusicBrainz artists that aren't real people or groups.
export const SKIP = new Set([
  "89ad4ac3-39f7-470e-963a-56509c546377", // Various Artists
  "125ec42a-7229-4250-afc5-e057484327fe", // [unknown]
  "f731ccc4-e22a-43af-a747-64213329e088", // [anonymous]
  "9be7f096-97ec-4615-8957-8d40b5dcbc41", // [traditional]
]);
export const FEAT = /\b(feat|ft|featuring|with)\b\.?/i;

// "bootleg" in a title is an unofficial remix even when a producer puts it on an official release.
// " / " joins songs in DJ-set and medley recordings ("Technologic / Victory Lap / …").
export const isMashup = rec => / \/ |\bmedley\b|\bmash-?up\b|\bmegamix\b|\bbootleg\b/i.test(rec.title)
  || /dj-?mix|mash-?up/i.test(rec.disambiguation || "");

// One key per song, so versions, edits and remixes of a song count once.
export const songKey = title => title.toLowerCase().replace(/\s*[([].*?[)\]]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Splits an artist credit into main artists and guests.
export function splitCredit(credit) {
  const main = [], guests = [];
  let target = main;
  for (const c of credit) {
    if (!SKIP.has(c.artist.id)) target.push({ mbid: c.artist.id, name: c.artist.name });
    if (FEAT.test(c.joinphrase || "")) target = guests;
  }
  return { main, guests };
}

// ---------- posthumous filter ----------
const LIFESPAN_MAX_AGE_DAYS = 30;
const LIFESPAN_CACHE = path.join(ROOT, "data/cache/mb-lifespans.json");

// When each cosigner died or split up (cached in data/cache/mb-lifespans.json).
export async function lifespans(mbids, names = {}) {
  let cache = {};
  try { cache = JSON.parse(await readFile(LIFESPAN_CACHE, "utf8")); } catch {}
  const stale = e => !e || Date.now() - Date.parse(e.fetchedAt) > LIFESPAN_MAX_AGE_DAYS * 864e5;
  const todo = [...new Set(mbids)].filter(m => stale(cache[m]));
  console.log(`\nLooking up end dates for ${todo.length} cosigners (rest cached)…`);
  for (const m of todo) {
    try {
      const a = await mb(`artist/${m}`);
      cache[m] = { end: a["life-span"]?.end || null, ended: !!a["life-span"]?.ended, type: a.type || null, fetchedAt: new Date().toISOString() };
    } catch (err) { console.warn(`  ! lifespan ${names[m] || m}: ${err.message}`); }
  }
  await mkdir(path.dirname(LIFESPAN_CACHE), { recursive: true });
  await writeFile(LIFESPAN_CACHE, JSON.stringify(cache) + "\n");
  return cache;
}

// Partial dates ("2018", "2018-06"): pad the song date to its earliest day and the end date to its
// latest ("2018" -> "2018-31-31" sorts after every real 2018 date), so only clear cases are dropped.
export const afterEnd = (date, end) => date && end && date.padEnd(10, "-01") > end.padEnd(10, "-31");
