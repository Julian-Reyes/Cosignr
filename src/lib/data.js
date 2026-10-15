// Build-time data: reads data/*.json (written by scripts/fetch-*.mjs) and merges it for the pages.
// Only Astro pages import this, so none of the JSON is shipped to the browser.
import artistsJson from "../../data/artists.json";
import sources from "../../data/sources.json";
import stats from "../../data/stats.json";
import cosignsJson from "../../data/cosigns.json";
import tours from "../../data/tours.json";
import upcoming from "../../data/upcoming.json";
import profiles from "../../data/profiles.json";

export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, "/");
export const DATA = artistsJson;
export const STATS = stats;
export const SRC = sources;
export const BY_ID = Object.fromEntries(DATA.artists.map(a => [a.id, a]));

// Hand-written hometown wins; otherwise MusicBrainz (born/formed, else based).
export const hometown = a => a.hometown || profiles.artists[a.id]?.hometown?.text || null;

// ---------- images ----------
// Per artist: every available source, local paths prefixed with the site base.
const local = url => (url && !/^https?:/.test(url) ? BASE + url.replace(/^\//, "") : url);
const withLocal = s => s && { ...s, url: local(s.url), thumb: local(s.thumb) };
export const IMAGES = Object.fromEntries(DATA.artists.map(a => {
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

// For each roster artist: everyone who cosigned them, most famous first (Last.fm listeners),
// then most vouches (features, remixes, tours, touring-band spots, upcoming shows), most songs, most
// recent. Cosigners with unknown fame go last. Songs (cosigns.json), past tours and touring bands
// (tours.json) and upcoming shows (upcoming.json) for the same pair become one entry.
function buildCosignedBy() {
  const byMbid = Object.fromEntries(DATA.artists.map(a => [a.ids.musicbrainz, a.id]));
  const out = Object.fromEntries(DATA.artists.map(a => [a.id, []]));
  const pairs = new Map();
  const entry = (c, names) => {
    const id = byMbid[c.to];
    if (!id) return null;
    let e = pairs.get(`${c.from}|${c.to}`);
    if (!e) {
      e = { from: c.from, to: c.to, types: [], songs: 0, vouches: 0, tours: 0, first: null, last: null, evidence: [],
            liveEvidence: [], next: null, name: names[c.from].name, fame: STATS.cosigners?.[c.from]?.listeners ?? -1 };
      pairs.set(`${c.from}|${c.to}`, e);
      out[id].push(e);
    }
    return e;
  };
  for (const c of cosignsJson.cosigns) {
    const e = entry(c, cosignsJson.artists);
    if (e) Object.assign(e, c);
  }
  for (const t of tours.cosigns) {
    const e = entry(t, tours.artists);
    if (!e) continue;
    e.types = [...new Set([...e.types, ...t.types])];
    e.tours = t.tours;
    e.vouches += t.tours + (t.types.includes("band") ? 1 : 0);
    e.liveEvidence = t.evidence;
    if (t.last && (!e.last || t.last > e.last)) e.last = t.last;
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const u of upcoming.cosigns) {
    if (u.last < today) continue; // Ticketmaster data is only kept until the show has happened
    const e = entry(u, upcoming.artists);
    if (!e) continue;
    e.types = [...new Set([...e.types, "upcoming"])];
    e.vouches += 1;
    e.next = { ...u.next, shows: u.shows };
  }
  for (const list of Object.values(out)) {
    list.sort((x, y) => y.fame - x.fame || y.vouches - x.vouches || y.songs - x.songs || (y.last || "").localeCompare(x.last || ""));
  }
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

// Top chips for an artist: [{ name, title }].
export const chips = (artist, count) => COSIGNS[artist.id].slice(0, count).map(c => ({ name: c.name, title: cosignTitle(c, artist) }));
