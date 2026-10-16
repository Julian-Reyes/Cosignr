// Build-time data: reads data/*.json (written by scripts/fetch-*.mjs) and merges it for the pages.
// Only Astro pages import this, so none of the JSON is shipped to the browser.
import artistsJson from "../../data/artists.json";
import sources from "../../data/sources.json";
import stats from "../../data/stats.json";
import cosignsJson from "../../data/cosigns.json";
import tours from "../../data/tours.json";
import upcoming from "../../data/upcoming.json";
import profiles from "../../data/profiles.json";
import extendedJson from "../../data/extended.json";
import { mergeCosigns, byCosignerFame } from "./cosigns.js";
import { readFileSync, readdirSync } from "node:fs";

export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, "/");
export const DATA = artistsJson;
export const STATS = stats;
export const SRC = sources;
export const BY_ID = Object.fromEntries(DATA.artists.map(a => [a.id, a]));

// Everyone with an artist page: the roster plus the extended artists (top cosigners, light pages).
export const PAGES = [...DATA.artists, ...extendedJson.artists];
export const PAGE_BY_ID = Object.fromEntries(PAGES.map(a => [a.id, a]));
const PAGE_BY_MBID = Object.fromEntries(PAGES.map(a => [a.ids.musicbrainz, a]));
export const pageUrl = id => `${BASE}artist/${id}/`;
// Where an artist's name links to: their page if they have one, otherwise MusicBrainz.
export const linkFor = mbid => (PAGE_BY_MBID[mbid] ? pageUrl(PAGE_BY_MBID[mbid].id) : `https://musicbrainz.org/artist/${mbid}`);
export const hasPage = mbid => !!PAGE_BY_MBID[mbid];

// Hand-written hometown/genre win; otherwise MusicBrainz (hometown: born/formed, else based).
export const hometown = a => a.hometown || profiles.artists[a.id]?.hometown?.text || null;
export const genre = a => a.genre || profiles.artists[a.id]?.genre || null;

// ---------- images ----------
// Per artist: every available source, local paths prefixed with the site base.
const local = url => (url && !/^https?:/.test(url) ? BASE + url.replace(/^\//, "") : url);
const withLocal = s => s && { ...s, url: local(s.url), thumb: local(s.thumb) };
export const IMAGES = Object.fromEntries(PAGES.map(a => {
  const s = SRC.artists[a.id] || {};
  return [a.id, {
    original: a.original ? { url: local(a.original), thumb: local(a.original), credit: null } : null,
    press: withLocal(s.press), wikimedia: withLocal(s.wikimedia), spotify: withLocal(s.spotify),
    focus: a.focus, name: a.name,
  }];
}));

// ---------- stats ----------
export function metricValue(artist, metric) {
  const s = STATS.artists[artist.id];
  if (!s) return null;
  switch (metric) {
    case "score":     return s.score?.value ?? null;
    case "listeners": return s.excluded.includes("lastfmListeners") ? null : s.lastfm?.listeners ?? null;
    case "plays":     return s.excluded.includes("lastfmPlays") ? null : s.lastfm?.plays ?? null;
    case "fans":      return s.excluded.includes("deezerFans") ? null : s.deezer?.fans ?? null;
  }
}

// ---------- cosigns ----------

// For each roster artist: everyone who cosigned them, ranked by byCosignerFame (src/lib/cosigns.js).
const MERGED = mergeCosigns({ cosigns: cosignsJson, tours, upcoming, fame: STATS.cosigners });
function buildCosignedBy() {
  const byMbid = Object.fromEntries(DATA.artists.map(a => [a.ids.musicbrainz, a.id]));
  const out = Object.fromEntries(DATA.artists.map(a => [a.id, []]));
  for (const e of MERGED) {
    const id = byMbid[e.to];
    if (id) out[id].push({ ...e, name: e.fromName, fame: e.fromFame });
  }
  for (const list of Object.values(out)) list.sort(byCosignerFame);
  return out;
}
export const COSIGNS = buildCosignedBy();

// Hover text: the strongest evidence leads (upcoming show, then tour, touring band, songs), the rest follow.
export function cosignTitle(c, artist) {
  const year = e => (e.date ? ` (${e.date.slice(0, 4)})` : "");
  const lines = [], srcs = new Set();
  if (c.next) {
    const when = new Date(c.next.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    lines.push(`Opening for ${c.name}: ${c.next.tour}, next show ${when}${c.next.city ? " in " + c.next.city : ""}${c.next.shows > 1 ? ` (${c.next.shows} shows)` : ""}`);
    srcs.add("Ticketmaster");
  }
  const tour = c.liveEvidence.find(e => e.type === "tour");
  if (tour) {
    lines.push(tour.title ? `${c.name} took ${artist.name} on tour: ${tour.title}${year(tour)}` : `${artist.name} opened for ${c.name}${year(tour)}`);
    if (c.tours > 1) lines.push(`${c.tours} tours`);
  }
  const band = c.liveEvidence.find(e => e.type === "band");
  if (band) lines.push(`${artist.name} played in ${c.name}'s touring band${year(band)}`);
  c.liveEvidence.forEach(e => srcs.add(e.source));
  if (c.songs) {
    const e = c.evidence[0];
    if (lines.length) lines.push(`${c.songs} song${c.songs > 1 ? "s" : ""} together`);
    else {
      lines.push((e.type === "feature" ? `${c.name} featured ${artist.name} on “${e.title}”`
                : e.type === "remix"   ? `${artist.name} remixed ${c.name}: “${e.title}”`
                : `${c.name} and ${artist.name}: “${e.title}”`) + year(e));
      if (c.songs > 1) lines.push(`${c.songs} songs together`);
    }
    srcs.add("MusicBrainz");
  }
  return lines.join(" · ") + ` · Source: ${[...srcs].join(", ")}`;
}

// Top chips for an artist: [{ name, title, href }]. href is set when the cosigner has a page.
export const chips = (artist, count) => COSIGNS[artist.id].slice(0, count)
  .map(c => ({ name: c.name, title: cosignTitle(c, artist), href: hasPage(c.from) ? linkFor(c.from) : null }));

// ---------- artist pages ----------

const yearOf = d => (d ? d.slice(0, 4) : null);
const showDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// One list row for an artist page. `dir` is "by" (they cosigned `me`) or "out" (`me` cosigned them).
// Evidence lines read from the page artist's point of view; every line links to its source.
function toRow(e, me, dir) {
  const other = dir === "by" ? { mbid: e.from, name: e.fromName, fame: e.fromFame } : { mbid: e.to, name: e.toName, fame: e.toFame };
  const by = dir === "by";
  const lines = [];
  if (e.next) {
    const n = e.next;
    lines.push({ type: "upcoming", source: "Ticketmaster", url: n.url, until: e.last || n.date,
      text: `${by ? `${me.name} opens for them` : `They open for ${me.name}`}: ${n.tour}, next show ${showDate(n.date)}${n.city ? ` in ${n.city}` : ""}${n.shows > 1 ? ` (${n.shows} shows)` : ""}` });
  }
  for (const t of e.liveEvidence) {
    const y = yearOf(t.date) ? ` (${yearOf(t.date)})` : "";
    const text = t.type === "band" ? (by ? `${me.name} played in their touring band` : `Played in ${me.name}'s touring band`) + y
      : t.title ? `${by ? `Took ${me.name} on tour` : "Took them on tour"}: ${t.title}${y}${t.shows > 1 ? ` · ${t.shows} shows` : ""}`
      : (by ? `${me.name} opened for them` : `They opened for ${me.name}`) + y;
    lines.push({ type: t.type, source: t.source, url: t.url, text });
  }
  for (const s of e.evidence) {
    const y = yearOf(s.date) ? ` (${yearOf(s.date)})` : "";
    const text = s.type === "feature" ? `${by ? `Featured ${me.name} on` : "Featured them on"} “${s.title}”${y}`
      : s.type === "remix" ? `${by ? `${me.name} remixed` : "They remixed"} “${s.title}”${y}`
      : `“${s.title}” together${y}`;
    lines.push({ type: s.type, source: "MusicBrainz", url: s.url, text });
  }
  if (e.songs > e.evidence.length) lines.push({ type: "more", text: `${e.songs} songs together in all` });
  return {
    name: other.name, href: linkFor(other.mbid), page: hasPage(other.mbid),
    types: e.types, vouches: e.vouches, songs: e.songs, tours: e.tours, last: e.last, fame: other.fame, lines,
  };
}

// Sort orders. "Cosigned by" always uses fame (as the chips); "Cosigns" has three tabs.
export const strongest = (x, y) => y.vouches - x.vouches || y.songs - x.songs || (y.last || "").localeCompare(x.last || "");

export function artistLists(a) {
  const mbid = a.ids.musicbrainz;
  const cosignedBy = MERGED.filter(e => e.to === mbid).sort(byCosignerFame).map(e => toRow(e, a, "by"));
  const cosigns = MERGED.filter(e => e.from === mbid).map(e => toRow(e, a, "out")).sort(strongest);
  return { cosignedBy, cosigns };
}

// Upcoming shows involving the artist, either as headliner or opener (Ticketmaster, not yet past).
export function upcomingFor(a) {
  const mbid = a.ids.musicbrainz;
  const today = new Date().toISOString().slice(0, 10);
  return upcoming.cosigns.filter(u => (u.from === mbid || u.to === mbid) && u.last >= today).map(u => {
    const headliner = u.from === mbid;
    const otherMbid = headliner ? u.to : u.from;
    return { headliner, name: upcoming.artists[otherMbid].name, href: linkFor(otherMbid), tour: u.next.tour,
             next: showDate(u.next.date), city: u.next.city, shows: u.shows, url: u.next.url, until: u.last };
  }).sort((x, y) => x.until.localeCompare(y.until));
}

// ---------- Hot Right Now (HOT.md) ----------
// Apple Music US songs + albums from the newest data/charts/<date>.json, and the YouTube US music chart
// from data/live/youtube.json (fetched by the deploy job, never committed: YouTube's 30-day rule).
// Paths are relative to the project root, where `astro build` / `astro dev` run.

const readJson = f => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const CHART = (() => {
  let files = [];
  try { files = readdirSync("data/charts").filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse(); } catch {}
  for (const f of files) { // newest day whose Apple chart didn't fail
    const c = readJson(`data/charts/${f}`);
    if (c?.appleUsSongs) return c;
  }
  return null;
})();
const YOUTUBE = readJson("data/live/youtube.json");

export const HOT_COUNT = 25; // Julian, 2026-10-16: top 5 shown, Show More adds 10, up to 25 per tab
const NEW_DAYS = 7;

// Chart entries match artists by Apple artist ID / YouTube channel ID (profiles.json), never by name alone.
const BY_APPLE = {}, BY_YOUTUBE = {};
for (const a of PAGES) {
  const p = profiles.artists[a.id] || {};
  for (const id of p.apple || []) BY_APPLE[id] ??= a;
  for (const id of p.youtube || []) BY_YOUTUBE[id] ??= a;
}

const norm = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasName = (text, name) => new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(norm(name))}($|[^\\p{L}\\p{N}])`, "u").test(norm(text));

// Everyone credited on a chart entry that we can vouch for: the ID-matched artists, plus their known cosign
// partners whose exact name appears in the credit/title (Apple only gives the first artist's ID; a name
// counts only when it's someone that artist already has a cosign with). Returns the cosigns between them too.
function creditsFor(text, matched) {
  const people = new Map(matched.map(a => [a.ids.musicbrainz, { mbid: a.ids.musicbrainz, name: a.name, idMatch: true }]));
  for (const a of matched) {
    for (const e of MERGED) {
      const [mbid, name] = e.from === a.ids.musicbrainz ? [e.to, e.toName] : e.to === a.ids.musicbrainz ? [e.from, e.fromName] : [];
      if (mbid && !people.has(mbid) && hasName(text, name)) people.set(mbid, { mbid, name, idMatch: false });
    }
  }
  const ids = new Set(people.keys());
  const pairs = new Map(); // one marker per pair; when both cosigned each other, the hover text has both
  for (const e of MERGED.filter(e => ids.has(e.from) && ids.has(e.to))) {
    const key = [e.from, e.to].sort().join(), title = cosignTitle({ ...e, name: e.fromName }, { name: e.toName });
    if (pairs.has(key)) pairs.get(key).title += `\n${title}`;
    else pairs.set(key, { label: `${e.fromName} × ${e.toName}`, title,
      href: hasPage(e.from) ? `${linkFor(e.from)}#cosigns` : `${linkFor(e.to)}#cosigned-by` });
  }
  const cosigns = [...pairs.values()];
  return { people: [...people.values()].map(p => ({ ...p, href: hasPage(p.mbid) ? linkFor(p.mbid) : null })), cosigns };
}

// Splits Apple's credit string ("Drake & Don Toliver") into text and link segments for artists with a page.
// If the ID-matched first artist goes by another name on Apple, the first credited name is linked instead.
function creditSegments(credit, people) {
  const marks = [];
  for (const p of people.filter(p => p.href)) {
    const at = norm(credit).search(new RegExp(`(?<=^|[^\\p{L}\\p{N}])${escRe(norm(p.name))}(?=$|[^\\p{L}\\p{N}])`, "u"));
    if (at >= 0) marks.push([at, at + p.name.length, p.href]);
    else if (p.idMatch && !marks.some(m => m[0] === 0)) marks.push([0, credit.split(/,\s|\s&\s|\s[xX]\s|\s(?:feat\.?|ft\.?|with)\s/)[0].length, p.href]);
  }
  marks.sort((x, y) => x[0] - y[0]);
  const out = [];
  let pos = 0;
  for (const [s, e, href] of marks) {
    if (s < pos) continue;
    if (s > pos) out.push({ text: credit.slice(pos, s) });
    out.push({ text: credit.slice(s, e), href });
    pos = e;
  }
  if (pos < credit.length) out.push({ text: credit.slice(pos) });
  return out;
}

const daysBefore = (date, n) => new Date(Date.parse(date) - n * 864e5).toISOString().slice(0, 10);
const shortDate = d => new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function appleRows(list) {
  const newSince = daysBefore(CHART.date, NEW_DAYS);
  return (list || []).map(([title, credit, artistId, released, id, genres, art, url], i) => {
    // Titles carry features too: "WAIT FOR U (feat. Drake & Tems)" is credited to Future alone.
    const { people, cosigns } = creditsFor(`${credit} | ${title}`, BY_APPLE[artistId] ? [BY_APPLE[artistId]] : []);
    return {
      key: id, rank: i + 1, title, url, service: "Apple Music",
      art: art ? art.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/240x240bb.$1") : null, // 240px for retina at 120px
      artists: creditSegments(credit, people), genre: genres?.[0] || null,
      isNew: !!released && released >= newSince, cosigns, pages: people.filter(p => p.href).map(p => p.mbid),
    };
  });
}

// "OliviaRodrigoVEVO" -> "Olivia Rodrigo", "PARTYNEXTDOOR - Topic" -> "PARTYNEXTDOOR". Display only.
const channelName = c => / - Topic$/.test(c) ? c.replace(/ - Topic$/, "")
  : /VEVO$/.test(c) ? c.replace(/VEVO$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ Music$/, "") : c;

function videoRows() {
  const newSince = daysBefore(YOUTUBE.fetchedAt, NEW_DAYS);
  return YOUTUBE.videos.map((v, i) => {
    const owner = BY_YOUTUBE[v.channelId];
    // Channels linked in the description count only if that artist's name is also in the title.
    const featured = v.linkedChannels.map(id => BY_YOUTUBE[id]).filter(a => a && a !== owner && hasName(v.title, a.name));
    const { people, cosigns } = creditsFor(v.title, [owner, ...featured].filter(Boolean));
    const linked = people.filter(p => p.href);
    const artists = [];
    if (!owner) artists.push({ text: channelName(v.channelTitle) });
    linked.forEach(p => artists.push(...(artists.length ? [{ text: " · " }] : []), { text: p.name, href: p.href }));
    return {
      key: v.id, rank: i + 1, title: v.title, url: `https://www.youtube.com/watch?v=${v.id}`, service: "YouTube",
      art: v.thumb, artists, genre: null, isNew: v.published >= newSince, cosigns, pages: linked.map(p => p.mbid), wide: true,
    };
  });
}

const SONGS = CHART ? appleRows(CHART.appleUsSongs) : [];
const VIDEOS = YOUTUBE?.videos?.length ? videoRows() : [];

// Props for the home page's HotList island: only the rows it shows.
export function hotLists() {
  const strip = ({ pages, ...r }) => r;
  return {
    tabs: {
      songs: SONGS.slice(0, HOT_COUNT).map(strip),
      albums: CHART ? appleRows(CHART.appleUsAlbums).slice(0, HOT_COUNT).map(strip) : [],
      videos: VIDEOS.slice(0, HOT_COUNT).map(strip),
    },
    appleDate: CHART ? shortDate(CHART.date) : null,
    youtubeDate: YOUTUBE ? shortDate(YOUTUBE.fetchedAt) : null,
  };
}

// Artist page badges: best Apple Music US song rank (top 100) and a video in YouTube's US top chart.
export function hotFor(a) {
  const mbid = a.ids.musicbrainz;
  const song = SONGS.find(r => r.pages.includes(mbid));
  const video = VIDEOS.find(r => r.pages.includes(mbid));
  return {
    apple: song ? { rank: song.rank, title: song.title, url: song.url, date: shortDate(CHART.date) } : null,
    video: video ? { title: video.title, url: video.url } : null,
  };
}

// Stats shown on an artist page: [{ label, value, raw, note }], excluded metrics carry their caveat.
export function statsFor(a) {
  const s = STATS.artists[a.id];
  if (!s) return { score: null, rows: [] };
  const caveat = src => (a.caveats || {})[src] || null;
  return {
    score: s.score?.value ?? null,
    rows: [
      { label: "Last.fm listeners", raw: s.lastfm?.listeners, note: s.excluded.includes("lastfmListeners") ? caveat("lastfm") : null, url: s.lastfm?.url },
      { label: "Last.fm plays", raw: s.lastfm?.plays, note: s.excluded.includes("lastfmPlays") ? caveat("lastfm") : null, url: s.lastfm?.url },
      { label: "Deezer fans", raw: s.deezer?.fans, note: s.excluded.includes("deezerFans") ? caveat("deezer") : null, url: s.deezer?.url },
    ].filter(r => r.raw != null),
  };
}
