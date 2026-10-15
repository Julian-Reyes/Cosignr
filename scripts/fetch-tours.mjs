#!/usr/bin/env node
// Builds data/tours.json: tour cosigns. A headliner who takes an artist on tour as their opener
// (support act) cosigns that artist. One tour counts once, however many shows it had.
//   Wikipedia  tour articles' infobox "support_acts". Tours are found through Wikidata (tours whose
//              performer is a roster artist) and the "<Artist> concert tours" category. Only linked
//              names count, matched to MusicBrainz through Wikidata (P434), so namesakes can't slip in.
//              Text is CC BY-SA: every tour links back to its article.
//   MusicBrainz  concerts with a "support act" relation (CC0), for roster artists as headliner or as
//              opener. Festivals and award shows are skipped: their "support" is just the line-up.
//              Shows are grouped into tours by their MusicBrainz series.
// Skipped: co-headliners (not a support slot), band <-> own member, pairs with no roster artist.
// Touring musicians who also opened (Tame Impala -> Nick Allbrook) count.
// Event lookups are cached in data/cache/mb-events.json for EVENT_MAX_AGE_DAYS.
//
// Usage (from the project root):  node scripts/fetch-tours.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mb } from "./lib/musicbrainz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes/Cosignr)" };
const EVIDENCE_PER_COSIGN = 3;
const EVENT_MAX_AGE_DAYS = 30;
const EVENT_CACHE = path.join(ROOT, "data/cache/mb-events.json");
const MAX_HEADLINERS = 3; // more "main performers" than this is a festival-style bill, not a tour
// Band members and a solo project's own person ("is person": Tame Impala = Kevin Parker) don't count
// as cosigns of each other. Touring/session musicians do count (Julian, 2026-10-15): a solo project
// choosing them is a vouch.
const MEMBER_TYPES = new Set(["member of band", "is person"]);
const CONCERT_TYPES = new Set(["Concert", undefined, null]); // MusicBrainz event types to read

const getJson = async url => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};
const wiki = params => getJson(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`);
const wikidata = params => getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: "json", ...params })}`);
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const tourKey = title => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const { artists } = JSON.parse(await readFile(path.join(ROOT, "data/artists.json"), "utf8"));
const roster = Object.fromEntries(artists.filter(a => a.ids.musicbrainz).map(a => [a.ids.musicbrainz, a.id]));

const names = {};          // mbid -> name
const members = new Set(); // "band|member" and "member|band" for roster artists (see MEMBER_TYPES)
const pairs = new Map();   // "from|to" -> { from, to, tours: Map(tourKey -> evidence) }

function add(from, to, tour) {
  if (from.mbid === to.mbid || members.has(`${from.mbid}|${to.mbid}`)) return;
  if (!roster[from.mbid] && !roster[to.mbid]) return;
  names[from.mbid] ??= from.name;
  names[to.mbid] ??= to.name;
  const key = `${from.mbid}|${to.mbid}`;
  let p = pairs.get(key);
  if (!p) pairs.set(key, p = { from: from.mbid, to: to.mbid, tours: new Map() });
  const k = tourKey(tour.key || tour.title);
  delete tour.key;
  const prev = p.tours.get(k);
  if (!prev) { p.tours.set(k, { ...tour }); return; }
  // Same tour from both sources: keep the Wikipedia link, add the MusicBrainz show count and dates.
  if (tour.source === "Wikipedia") Object.assign(prev, { title: tour.title, url: tour.url, source: tour.source });
  if (tour.shows) prev.shows = (prev.shows || 0) + tour.shows;
  if (tour.date && (!prev.date || tour.date < prev.date)) prev.date = tour.date;
}

// ---- 1. MusicBrainz: band members, and concerts each roster artist headlined or opened ----
let eventCache = {};
try { eventCache = JSON.parse(await readFile(EVENT_CACHE, "utf8")); } catch {}
const fresh = e => e && Date.now() - Date.parse(e.fetchedAt) < EVENT_MAX_AGE_DAYS * 864e5;
const events = new Map(); // event id -> cached event
let looked = 0;

for (const a of artists) {
  const mbid = a.ids.musicbrainz;
  if (!mbid) continue;
  const rels = (await mb(`artist/${mbid}?inc=artist-rels+event-rels`)).relations || [];
  for (const r of rels) {
    if (MEMBER_TYPES.has(r.type) && r.artist) { members.add(`${mbid}|${r.artist.id}`); members.add(`${r.artist.id}|${mbid}`); }
    if (r.event && (r.type === "main performer" || r.type === "support act") && CONCERT_TYPES.has(r.event.type) && !events.has(r.event.id)) {
      if (!fresh(eventCache[r.event.id])) {
        try {
          const ev = await mb(`event/${r.event.id}?inc=artist-rels+series-rels`);
          const rs = ev.relations || [];
          const who = type => rs.filter(x => x.type === type && x.artist).map(x => ({ mbid: x.artist.id, name: x.artist.name }));
          eventCache[r.event.id] = {
            name: ev.name, date: ev["life-span"]?.begin || null,
            series: rs.find(x => x.series)?.series || null,
            main: who("main performer"), support: who("support act"),
            fetchedAt: new Date().toISOString(),
          };
          looked++;
        } catch (err) { console.warn(`  ! event ${r.event.id}: ${err.message}`); continue; }
      }
      events.set(r.event.id, eventCache[r.event.id]);
    }
  }
}
await mkdir(path.dirname(EVENT_CACHE), { recursive: true });
await writeFile(EVENT_CACHE, JSON.stringify(eventCache) + "\n");

let mbShows = 0;
for (const [id, ev] of events) {
  if (!ev.support.length || ev.main.length > MAX_HEADLINERS) continue;
  // Shows outside a tour series have no tour name (title null) and are grouped per headliner and
  // year, so a run of one-off dates counts once.
  const title = ev.series?.name || null;
  const key = ev.series?.name || `${ev.main.map(m => m.name).join(", ")} ${ev.date?.slice(0, 4) || ""} shows`;
  for (const h of ev.main) for (const s of ev.support) {
    add(h, s, { title, key, date: ev.date, type: "tour", source: "MusicBrainz", shows: 1,
      url: ev.series ? `https://musicbrainz.org/series/${ev.series.id}` : `https://musicbrainz.org/event/${id}` });
    mbShows++;
  }
}
console.log(`MusicBrainz: ${events.size} concerts (${looked} looked up, rest cached), ${mbShows} support slots`);

// ---- 2. Wikipedia: tour articles of roster artists ----
const qids = artists.map(a => a.ids.wikidata).filter(Boolean);
const enTitle = {}; // roster mbid -> enwiki title
for (const batch of chunks(qids, 50)) {
  const d = await wikidata({ action: "wbgetentities", ids: batch.join("|"), props: "sitelinks", sitefilter: "enwiki" });
  for (const a of artists) {
    const t = d.entities[a.ids.wikidata]?.sitelinks?.enwiki?.title;
    if (t && a.ids.musicbrainz) enTitle[a.ids.musicbrainz] = t;
  }
}

const tourTitles = new Set();
const sparql = `SELECT ?article WHERE {
  VALUES ?artist { ${qids.map(q => "wd:" + q).join(" ")} }
  ?tour wdt:P175 ?artist ; wdt:P31/wdt:P279* wd:Q1573906 .
  ?article schema:about ?tour ; schema:isPartOf <https://en.wikipedia.org/> .
}`;
const sq = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`);
for (const b of sq.results.bindings) tourTitles.add(decodeURIComponent(b.article.value.split("/wiki/")[1]).replace(/_/g, " "));
for (const title of Object.values(enTitle)) {
  for (const cat of new Set([title, title.replace(/ \(.*\)$/, "")])) {
    const d = await wiki({ action: "query", list: "categorymembers", cmtitle: `Category:${cat} concert tours`, cmnamespace: "0", cmlimit: "100" });
    for (const m of d.query.categorymembers) tourTitles.add(m.title);
  }
}

// Infobox field value: from "| field =" up to the next "| other =" (strips refs and comments first).
function field(text, name) {
  const m = text.match(new RegExp(`\\|\\s*${name}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[a-z_]+\\s*=|\\n}}|\\|\\s*[a-z_]+\\s*=)`));
  return m ? m[1].trim() : "";
}
const links = text => [...text.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1].trim());

const tours = []; // { title, url, date, headliners: [link titles], support: [link titles] }
for (const title of tourTitles) {
  const d = await wiki({ action: "parse", page: title, prop: "wikitext", redirects: "1" });
  if (!d.parse) continue;
  const text = d.parse.wikitext.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>|<!--[\s\S]*?-->/g, "");
  const support = links(field(text, "support_acts?"));
  if (!support.length) continue;
  const start = field(text, "start_date").match(/(\d{4})\|(\d{1,2})(?:\|(\d{1,2}))?/);
  tours.push({
    title: d.parse.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(d.parse.title.replace(/ /g, "_"))}`,
    date: start ? [start[1], start[2].padStart(2, "0"), start[3]?.padStart(2, "0")].filter(Boolean).join("-") : null,
    headliners: links(field(text, "artist")),
    support,
  });
}

// Link titles -> Wikidata items -> MusicBrainz IDs.
const linkTitles = [...new Set(tours.flatMap(t => [...t.headliners, ...t.support]))];
const qidOf = {}; // link title -> qid
for (const batch of chunks(linkTitles, 50)) {
  const d = await wiki({ action: "query", prop: "pageprops", ppprop: "wikibase_item", redirects: "1", titles: batch.join("|") });
  const resolved = Object.fromEntries((d.query.normalized || []).map(n => [n.from, n.to]));
  // A redirect into a section ("LA Priest" -> "Late of the Pier#Side projects") is a different act.
  for (const r of d.query.redirects || []) resolved[r.from] = r.tofragment ? null : r.to;
  const byTitle = Object.fromEntries(d.query.pages.map(p => [p.title, p.pageprops?.wikibase_item]));
  for (const t of batch) {
    let x = t;
    for (let i = 0; i < 3 && resolved[x]; i++) x = resolved[x];
    if (x in resolved && resolved[x] === null) continue;
    if (byTitle[x]) qidOf[t] = byTitle[x];
  }
}
const mbOf = {}; // qid -> { mbid, label }
for (const batch of chunks([...new Set(Object.values(qidOf))], 50)) {
  const d = await wikidata({ action: "wbgetentities", ids: batch.join("|"), props: "claims|labels", languages: "en" });
  for (const [q, e] of Object.entries(d.entities)) {
    const ids = (e.claims?.P434 || []).map(c => c.mainsnak.datavalue?.value).filter(Boolean);
    // Several IDs (duplicates on MusicBrainz): use the roster one if there is one, otherwise skip.
    const mbid = ids.length === 1 ? ids[0] : ids.find(i => roster[i]);
    if (mbid) mbOf[q] = { mbid, name: e.labels?.en?.value || null };
  }
}
const artistOf = t => mbOf[qidOf[t]] && { mbid: mbOf[qidOf[t]].mbid, name: mbOf[qidOf[t]].name || t.replace(/ \(.*\)$/, "") };

let wpSlots = 0, unmatched = 0;
for (const t of tours) {
  // The roster artist must be credited as the tour's artist, not just have it in their category.
  const heads = t.headliners.map(artistOf).filter(Boolean);
  if (!heads.some(h => roster[h.mbid])) { console.log(`  skip ${t.title}: no roster headliner`); continue; }
  for (const s of t.support) {
    const sup = artistOf(s);
    if (!sup) { unmatched++; continue; }
    if (heads.some(h => h.mbid === sup.mbid)) continue; // co-headliner listed as support
    for (const h of heads) { add(h, sup, { title: t.title, url: t.url, date: t.date, type: "tour", source: "Wikipedia" }); wpSlots++; }
  }
}
console.log(`Wikipedia: ${tourTitles.size} tour articles, ${tours.length} with support acts, ${wpSlots} support slots (${unmatched} names with no MusicBrainz match skipped)`);

// ---- 3. Write ----
const cosigns = [...pairs.values()].map(p => {
  // Unnamed shows in the same year as a named tour of the same pair were most likely part of it.
  for (const [k, t] of p.tours) {
    const named = !t.title && [...p.tours.values()].find(x => x.title && x.date?.slice(0, 4) === t.date?.slice(0, 4));
    if (named) { named.shows = (named.shows || 0) + (t.shows || 0); p.tours.delete(k); }
  }
  const list = [...p.tours.values()].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const dates = list.map(t => t.date).filter(Boolean).sort();
  return {
    from: p.from, to: p.to, types: ["tour"],
    tours: list.length,
    first: dates[0] || null, last: dates.at(-1) || null,
    evidence: list.slice(0, EVIDENCE_PER_COSIGN),
  };
}).sort((x, y) => y.tours - x.tours || (y.last || "").localeCompare(x.last || ""));

const out = {
  generatedAt: new Date().toISOString(),
  source: "Wikipedia tour articles (CC BY-SA, linked per tour) and MusicBrainz events (CC0)",
  artists: Object.fromEntries(Object.entries(names).map(([mbid, name]) => [mbid, roster[mbid] ? { name, id: roster[mbid] } : { name }])),
  cosigns,
};
await writeFile(path.join(ROOT, "data/tours.json"), JSON.stringify(out) + "\n");
console.log(`\nWrote data/tours.json: ${cosigns.length} tour cosigns`);
for (const c of cosigns) console.log(`  ${names[c.from]} → ${names[c.to]}: ${c.evidence.map(e => `${e.title || "shows " + e.date?.slice(0, 4)}${e.shows ? ` (${e.shows} shows)` : ""} [${e.source}]`).join("; ")}`);
