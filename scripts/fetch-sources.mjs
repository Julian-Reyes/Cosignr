#!/usr/bin/env node
// Builds data/sources.json from the IDs in data/artists.json.
// Free, key-less sources only:
//   - Wikimedia Commons: lead photo from Wikidata (P18) + license/author for attribution
//   - Spotify oEmbed:    artist thumbnail (no API key needed)
//   - Press kit:         local files in images/press/<id>.(jpg|png|webp), added by hand with permission
//
// Usage (from the project root):  node scripts/fetch-sources.mjs

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes)" };

const stripHtml = s => (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function wikimedia(qid) {
  if (!qid) return null;
  const entity = (await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`)).entities[qid];
  const file = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;

  const api = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
    + "&iiprop=url|extmetadata|size&iiurlwidth=1280&titles=" + encodeURIComponent("File:" + file);
  const page = Object.values((await getJson(api)).query.pages)[0];
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  // Commons only serves standard thumbnail widths (e.g. 330, 500, 960, 1280); 400 returns an error.
  const url = (info.thumburl || info.url).split("?")[0];
  return {
    url,
    thumb: url.includes("/1280px-") ? url.replace("/1280px-", "/500px-") : url,
    width: info.thumbwidth || info.width,
    height: info.thumbheight || info.height,
    credit: {
      author: stripHtml(meta.Artist?.value) || "Unknown",
      license: meta.LicenseShortName?.value || "See source",
      licenseUrl: meta.LicenseUrl?.value || null,
      source: info.descriptionurl,
    },
  };
}

async function spotify(id) {
  if (!id) return null;
  const data = await getJson(`https://open.spotify.com/oembed?url=https://open.spotify.com/artist/${id}`);
  if (!data.thumbnail_url) return null;
  // oEmbed returns the 320px variant; Spotify's 640px variant uses the "e5eb" size code.
  const large = data.thumbnail_url.replace(/\/image\/ab676161[0-9a-f]{8}/, "/image/ab6761610000e5eb");
  return {
    url: large,
    thumb: data.thumbnail_url,
    width: large === data.thumbnail_url ? data.thumbnail_width : 640,
    height: large === data.thumbnail_url ? data.thumbnail_height : 640,
    credit: { author: "Spotify", license: "Spotify Developer Terms", licenseUrl: "https://developer.spotify.com/terms", source: `https://open.spotify.com/artist/${id}` },
  };
}

async function pressFiles() {
  try {
    return await readdir(path.join(ROOT, "images/press"));
  } catch {
    return [];
  }
}

const { artists } = JSON.parse(await readFile(path.join(ROOT, "data/artists.json"), "utf8"));
const press = await pressFiles();
const out = { generatedAt: new Date().toISOString(), artists: {} };

for (const a of artists) {
  const entry = {};
  for (const [name, fn] of [["wikimedia", () => wikimedia(a.ids.wikidata)], ["spotify", () => spotify(a.ids.spotify)]]) {
    try {
      entry[name] = await fn();
    } catch (err) {
      console.warn(`  ! ${a.id} ${name}: ${err.message}`);
      entry[name] = null;
    }
  }
  const file = press.find(f => f.replace(/\.(jpe?g|png|webp)$/i, "") === a.id);
  entry.press = file ? { url: `images/press/${file}`, credit: { author: "Press kit", license: "Used with permission", source: null } } : null;

  out.artists[a.id] = entry;
  const mark = k => (entry[k] ? "✓" : "·");
  console.log(`${a.id.padEnd(16)} wikimedia ${mark("wikimedia")}  spotify ${mark("spotify")}  press ${mark("press")}`);
}

await writeFile(path.join(ROOT, "data/sources.json"), JSON.stringify(out, null, 2) + "\n");
console.log("\nWrote data/sources.json");
