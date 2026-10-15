#!/usr/bin/env node
// Builds data/extended.json: the artists who get a page besides our roster. Julian (2026-10-15):
// the top EXTENDED_PER_ARTIST cosigners of each roster artist, ranked exactly like the "Cosigned by"
// chips (src/lib/cosigns.js). These are "light" pages: photo, stats, hometown, genre and upcoming
// shows are fetched for them by the other scripts, but their own song/tour history is not crawled.
//
// IDs come from MusicBrainz URL relations (Wikidata, Spotify, Deezer), falling back to Wikidata
// (P1902 Spotify, P2722 Deezer). Both services have empty duplicate pages, so every candidate is tried:
//   Spotify  Wikidata's ID first, then MusicBrainz's; the first with a photo wins (Beyoncé).
//   Deezer   the first page with albums wins (Daft Punk, Kygo). If its fan count is still implausible
//            (under 1% of the artist's Last.fm listeners: Skrillex, Metric, TEED, JID point at small
//            leftover pages), it gets a `caveats.deezer` note so the score leaves it out. We don't
//            search Deezer by name: namesakes share names (see Jackal). The Last.fm name is the one fetch-stats.mjs already verified for fame.
// Ranking uses fame from the previous fetch-stats.mjs run, so run order is:
//   cosigns -> tours -> extended -> sources -> upcoming -> profiles -> stats
//
// Usage (from the project root):  node scripts/fetch-extended.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";
import { mergeCosigns, byCosignerFame } from "../src/lib/cosigns.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes/Cosignr)" };
const EXTENDED_PER_ARTIST = 5;

const read = async f => JSON.parse(await readFile(path.join(ROOT, "data", f), "utf8"));
const getJson = async url => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};
const slug = name => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\$/g, "s").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";

const { artists } = await read("artists.json");
const stats = await read("stats.json");
const merged = mergeCosigns({ cosigns: await read("cosigns.json"), tours: await read("tours.json"), upcoming: await read("upcoming.json"), fame: stats.cosigners });
const roster = new Map(artists.map(a => [a.ids.musicbrainz, a]));

// 1. Top cosigners of each roster artist (roster artists themselves already have pages).
const picked = new Map(); // mbid -> { name, cosignerOf: [roster ids] }
for (const a of artists) {
  const top = merged.filter(e => e.to === a.ids.musicbrainz && !roster.has(e.from)).sort(byCosignerFame).slice(0, EXTENDED_PER_ARTIST);
  for (const e of top) {
    if (!picked.has(e.from)) picked.set(e.from, { name: e.fromName, cosignerOf: [] });
    picked.get(e.from).cosignerOf.push(a.id);
  }
}

// 2. IDs on other services.
const used = new Set(artists.map(a => a.id));
const out = [];
for (const [mbid, p] of picked) {
  const ids = { musicbrainz: mbid, wikidata: null, spotify: null, deezer: null, lastfm: stats.cosigners[mbid]?.lastfmName || p.name };
  const deezers = [], spotifys = [];
  const caveats = {};
  try {
    for (const r of (await mb(`artist/${mbid}?inc=url-rels`)).relations || []) {
      const url = r.url?.resource || "";
      ids.wikidata ??= url.match(/wikidata\.org\/wiki\/(Q\d+)/)?.[1] || null;
      const sp = url.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/)?.[1];
      if (sp) spotifys.push(sp);
      const dz = url.match(/deezer\.com\/(?:\w+\/)?artist\/(\d+)/)?.[1];
      if (dz) deezers.push(dz);
    }
    if (ids.wikidata) {
      const claims = (await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${ids.wikidata}.json`)).entities[ids.wikidata]?.claims || {};
      for (const c of claims.P1902 || []) if (c.mainsnak?.datavalue?.value) spotifys.unshift(c.mainsnak.datavalue.value);
      for (const c of claims.P2722 || []) if (c.mainsnak?.datavalue?.value) deezers.push(c.mainsnak.datavalue.value);
    }
    for (const sp of [...new Set(spotifys)]) {
      const o = await getJson(`https://open.spotify.com/oembed?url=https://open.spotify.com/artist/${sp}`).catch(() => ({}));
      if (o.thumbnail_url) { ids.spotify = sp; break; }
      console.log(`  ${p.name}: Spotify ${sp} has no photo, skipped`);
    }
    ids.spotify ??= spotifys[0] || null;
    for (const dz of [...new Set(deezers)]) {
      const d = await getJson(`https://api.deezer.com/artist/${dz}`);
      if (d.error || !(d.nb_album > 0)) { console.log(`  ${p.name}: Deezer ${dz} has no albums, skipped`); continue; }
      ids.deezer = dz;
      const listeners = stats.cosigners[mbid]?.listeners;
      if (listeners && d.nb_fan < listeners / 100) {
        caveats.deezer = `Deezer page has ${d.nb_fan.toLocaleString("en-US")} fans vs ${listeners.toLocaleString("en-US")} Last.fm listeners: probably a duplicate page, so it's left out of the score.`;
        console.log(`  ${p.name}: Deezer ${dz} has only ${d.nb_fan} fans, caveat added`);
      }
      break;
    }
  } catch (err) {
    console.warn(`  ! ${p.name}: ${err.message}`);
  }
  let id = slug(p.name);
  for (let n = 2; used.has(id); n++) id = `${slug(p.name)}-${n}`;
  used.add(id);
  out.push({ id, name: p.name, genre: null, hometown: null, ids, ...(Object.keys(caveats).length ? { caveats } : {}), extended: true, cosignerOf: p.cosignerOf });
  const mark = k => (ids[k] ? "✓" : "·");
  console.log(`${id.padEnd(26)} wikidata ${mark("wikidata")}  spotify ${mark("spotify")}  deezer ${mark("deezer")}  (top cosigner of ${p.cosignerOf.join(", ")})`);
}

await writeFile(path.join(ROOT, "data/extended.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  rule: `Top ${EXTENDED_PER_ARTIST} cosigners of each roster artist (light pages)`,
  artists: out,
}, null, 2) + "\n");
console.log(`\nWrote data/extended.json: ${out.length} artists`);
