// Hand-checked MusicBrainz ID corrections for Last.fm (data/artists.json → `mbidFixes`, Julian 2026-10-19).
// Last.fm sometimes tags an artist's page with a namesake's MusicBrainz ID: its "YENA" page (the Korean
// singer, ex-IZ*ONE) carries the ID of an Italian italodance DJ "Yena". A name check can't catch that,
// because both are called Yena. Each fix says: on Last.fm, page `lastfmName` with ID `wrong` is really
// artist `right`. Chart rows are corrected when read, and Last.fm lookups for `right` use the page by name
// (Last.fm doesn't know the right ID).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const norm = s => (s || "").toLowerCase().normalize("NFKC").trim();

export async function loadMbidFixes() {
  try { return JSON.parse(await readFile(path.join(ROOT, "data/artists.json"), "utf8")).mbidFixes || []; } catch { return []; }
}

// Corrects the artist MusicBrainz IDs in a data/charts/<date>.json object, in place. Only rows whose
// artist name is the fix's Last.fm page name change, so a real Italian "Yena" row would be left alone.
export function fixChartMbids(chart, fixes) {
  if (!chart || !fixes.length) return chart;
  const swap = (name, mbid) => fixes.find(f => f.wrong === mbid && norm(f.lastfmName) === norm(name))?.right || mbid;
  for (const r of chart.lastfmUs || []) r[1] = swap(r[0], r[1]);
  for (const r of chart.lastfmGlobal || []) r[1] = swap(r[0], r[1]);
  for (const r of chart.lastfmUsTracks || []) r[2] = swap(r[1], r[2]);
  for (const r of chart.lastfmGlobalTracks || []) r[2] = swap(r[1], r[2]);
  return chart;
}

// The Last.fm page name to use for a corrected ID, or null.
export const lastfmNameFor = (fixes, mbid) => fixes.find(f => f.right === mbid)?.lastfmName || null;
