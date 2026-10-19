// Merges the cosign files into one entry per (from, to) pair. Plain ESM with no imports, so
// both the site (src/lib/data.js) and the Node scripts (scripts/fetch-extended.mjs) use the same rules.
//   songs     data/cosigns.json   feature / collab / remix (the roster's full catalogs)
//   charting  data/trending-cosigns.json  feature / collab, full history of the Trending artists; a pair
//             cosigns.json already has keeps the cosigns.json version
//   live      data/tours.json     tour / band
//   upcoming  data/upcoming.json  shows announced on Ticketmaster (dropped once past)
// `fame` maps MusicBrainz ID -> Last.fm listeners (stats.json -> cosigners).

export function mergeCosigns({ cosigns, charting, tours, upcoming, fame = {}, today = new Date().toISOString().slice(0, 10) }) {
  const pairs = new Map();
  const names = { ...charting?.artists, ...upcoming?.artists, ...tours?.artists, ...cosigns.artists };
  const entry = c => {
    const key = `${c.from}|${c.to}`;
    let e = pairs.get(key);
    if (!e) {
      e = { from: c.from, to: c.to, types: [], songs: 0, vouches: 0, tours: 0, first: null, last: null, evidence: [],
            liveEvidence: [], next: null, fromName: names[c.from]?.name, toName: names[c.to]?.name };
      pairs.set(key, e);
    }
    return e;
  };
  for (const c of cosigns.cosigns) {
    const { from, to, ...rest } = c;
    Object.assign(entry(c), rest);
  }
  for (const c of charting?.cosigns || []) {
    if (pairs.has(`${c.from}|${c.to}`)) continue;
    const { from, to, ...rest } = c;
    Object.assign(entry(c), rest);
  }
  for (const t of tours?.cosigns || []) {
    const e = entry(t);
    e.types = [...new Set([...e.types, ...t.types])];
    e.tours = t.tours;
    e.vouches += t.tours + (t.types.includes("band") ? 1 : 0);
    e.liveEvidence = t.evidence;
    if (t.first && (!e.first || t.first < e.first)) e.first = t.first;
    if (t.last && (!e.last || t.last > e.last)) e.last = t.last;
  }
  for (const u of upcoming?.cosigns || []) {
    if (u.last < today) continue; // Ticketmaster data is only kept until the show has happened
    const e = entry(u);
    e.types = [...new Set([...e.types, "upcoming"])];
    e.vouches += 1;
    e.next = { ...u.next, shows: u.shows };
  }
  for (const e of pairs.values()) {
    e.fromFame = fame[e.from]?.listeners ?? -1;
    e.toFame = fame[e.to]?.listeners ?? -1;
  }
  return [...pairs.values()];
}

// "Cosigned by" order (Julian, 2026-10-15: fame counts most): cosigner's Last.fm listeners, then
// vouches (features, remixes, tours, band spots, upcoming runs), songs, most recent. Unknown fame last.
export const byCosignerFame = (x, y) =>
  y.fromFame - x.fromFame || y.vouches - x.vouches || y.songs - x.songs || (y.last || "").localeCompare(x.last || "");
