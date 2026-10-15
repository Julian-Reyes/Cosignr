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
