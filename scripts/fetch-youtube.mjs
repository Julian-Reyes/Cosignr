#!/usr/bin/env node
// Saves today's YouTube US music chart (most popular music videos, ~30) to data/live/youtube.json for
// the home page's "Hot Right Now" Videos tab and the artist pages' "Trending video" badge.
//
// YouTube's Developer Policies forbid storing API data for more than 30 days and building metrics from
// it (III.E.4), so this file is NEVER committed (data/live/ is in .gitignore). The deploy job runs this
// script right before `npm run build`, so the data only exists inside the published page, which is
// rebuilt every night. Don't add it to the nightly data commit, data/charts/ or any score.
// Without YOUTUBE_API_KEY (or if YouTube fails) the file is removed and the Videos tab is hidden.
//
// Kept per video: id, title, channel, publish date, a thumbnail, and the channel IDs linked in the
// description (videos link each featured artist's channel; used to match artists by ID, never by name).
//
// Usage (from the project root):  node scripts/fetch-youtube.mjs   (needs YOUTUBE_API_KEY, 1 quota unit)

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data/live/youtube.json");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes)" };

async function loadEnv() {
  try {
    for (const line of (await readFile(path.join(ROOT, ".env"), "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
}

await loadEnv();
const KEY = process.env.YOUTUBE_API_KEY;
try {
  if (!KEY) throw new Error("no YOUTUBE_API_KEY");
  const q = new URLSearchParams({ part: "snippet", chart: "mostPopular", regionCode: "US", videoCategoryId: "10", maxResults: "50", key: KEY });
  const { items } = await getJson(`https://www.googleapis.com/youtube/v3/videos?${q}`);
  if (!items?.length) throw new Error("empty chart");
  const videos = items.map(v => {
    const s = v.snippet;
    const linked = [...(s.description || "").matchAll(/youtube\.com\/channel\/(UC[\w-]{22})/g)].map(m => m[1]);
    return {
      id: v.id, title: s.title, channelId: s.channelId, channelTitle: s.channelTitle, published: s.publishedAt,
      thumb: (s.thumbnails.medium || s.thumbnails.default)?.url || null,
      linkedChannels: [...new Set(linked)].filter(id => id !== s.channelId),
    };
  });
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), region: "US", videos }, null, 2) + "\n");
  console.log(`Wrote data/live/youtube.json: ${videos.length} videos (not committed)`);
} catch (err) {
  await rm(OUT, { force: true }); // never build from an old copy
  console.warn(`YouTube chart skipped: ${err.message}`);
}
