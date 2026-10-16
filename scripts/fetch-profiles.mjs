#!/usr/bin/env node
// Builds data/profiles.json: facts about each artist with a page (roster + extended) from MusicBrainz (no key).
//   hometown  where the artist was born (person) or formed (group): MusicBrainz "begin area".
//             Falls back to where they're based ("area") if that's missing. Country-only is OK.
//   genre     the most-voted MusicBrainz genre, title-cased ("Hip Hop"); null if none, never guessed.
//   apple     Apple Music artist IDs, from MusicBrainz links and Wikidata P2850.
//   youtube   YouTube channel IDs (UC…), from MusicBrainz links and Wikidata P2397. Handles (@name) are skipped.
//             Both match "Hot Right Now" chart entries to artists by ID, never by name (see HOT.md).
// A hometown or genre written in data/artists.json always wins on the page; this fills the gaps.
// Differences from artists.json are printed so they can be reviewed by hand.
//
// Usage (from the project root):  node scripts/fetch-profiles.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { loadArtists } from "./lib/artists.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRY_SHORT = { GB: "UK", US: "USA" }; // after a city: "London, UK"; alone, the full name is used

const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes)" };

// Apple Music and YouTube IDs from MusicBrainz URL links plus Wikidata (either can be missing).
async function serviceIds(artist, qid) {
  const apple = new Set(), youtube = new Set();
  for (const r of artist.relations || []) {
    const url = r.url?.resource || "";
    const am = url.match(/(?:music|itunes)\.apple\.com\/.*artist\/(?:[^/]+\/)?(?:id)?(\d+)/);
    if (am) apple.add(am[1]);
    const yt = url.match(/(?:www\.)?youtube\.com\/channel\/(UC[\w-]{22})/);
    if (yt) youtube.add(yt[1]); // music.youtube.com links are usually the "- Topic" channel
  }
  if (qid) {
    try {
      const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: UA });
      const claims = Object.values((await res.json()).entities)[0]?.claims || {};
      const vals = p => (claims[p] || []).map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
      vals("P2850").forEach(v => apple.add(String(v)));
      vals("P2397").filter(v => /^UC[\w-]{22}$/.test(v)).forEach(v => youtube.add(v));
    } catch (err) { console.warn(`  ! wikidata ${qid}: ${err.message}`); }
  }
  return { apple: [...apple], youtube: [...youtube] };
}

const areas = new Map(); // id -> area lookup with relations (cached for this run)
async function area(id) {
  if (!areas.has(id)) areas.set(id, await mb(`area/${id}?inc=area-rels`));
  return areas.get(id);
}

// Walks "part of" links up from an area to find its US state (or other subdivision) and country.
async function describe(id) {
  const start = await area(id);
  let subdivision = null, country = null, current = start;
  for (let depth = 0; current && depth < 6 && !country; depth++) {
    if (current.type === "Country") country = current;
    else if (current.type === "Subdivision" && !subdivision) subdivision = current;
    const parent = (current.relations || []).find(r => r.type === "part of" && r.direction === "backward");
    current = parent ? await area(parent.area.id) : null;
  }
  const cc = country?.["iso-3166-1-codes"]?.[0];
  if (start.type === "Country") return { text: start.name, country: cc || null };
  const state = cc === "US" && subdivision?.["iso-3166-2-codes"]?.[0]?.replace(/^US-/, "");
  const suffix = state || (country ? COUNTRY_SHORT[cc] || country.name : null);
  return { text: suffix ? `${start.name}, ${suffix}` : start.name, country: cc || null };
}

const artists = await loadArtists();
const titleCase = s => s.replace(/(^|[\s-])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/\bR&b\b/, "R&B").replace(/\bEdm\b/, "EDM");
const out = { generatedAt: new Date().toISOString(), source: "MusicBrainz (https://musicbrainz.org), CC0", artists: {} };
const differences = [];

for (const a of artists) {
  const mbid = a.ids.musicbrainz;
  if (!mbid) continue;
  try {
    const artist = await mb(`artist/${mbid}?inc=genres+url-rels`);
    const [kind, place] = artist["begin-area"] ? ["begin-area", artist["begin-area"]] : ["area", artist.area];
    const hometown = place ? { ...(await describe(place.id)), kind, area: `https://musicbrainz.org/area/${place.id}` } : null;
    const top = (artist.genres || []).sort((x, y) => y.count - x.count)[0];
    const genre = top?.count > 0 ? titleCase(top.name) : null;
    out.artists[a.id] = { type: artist.type || null, hometown, genre, ...(await serviceIds(artist, a.ids.wikidata)) };
    if (a.hometown && hometown && a.hometown !== hometown.text) differences.push(`${a.id}: artists.json "${a.hometown}" vs MusicBrainz ${kind} "${hometown.text}"`);
    console.log(`${a.id.padEnd(22)} ${(hometown?.text || "·").padEnd(30)} ${(genre || "·").padEnd(18)} ${(hometown ? `(${kind})` : "").padEnd(13)} apple ${out.artists[a.id].apple.length} youtube ${out.artists[a.id].youtube.length}`);
  } catch (err) {
    console.warn(`  ! ${a.id}: ${err.message}`);
  }
}

await writeFile(path.join(ROOT, "data/profiles.json"), JSON.stringify(out, null, 2) + "\n");
console.log("\nWrote data/profiles.json");
if (differences.length) console.log("\nReview (artists.json wins on the page):\n  " + differences.join("\n  "));
