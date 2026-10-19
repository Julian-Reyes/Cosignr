// Trending Artists: who's big right now (TRENDING.md). Sort tabs (All sources / Apple Music / Last.fm),
// genre bar filter, search filter, Show More, chip click (search by cosigner) and the demo Cosign button.
// Rendered at build time and hydrated in the browser. Props come from trendingRows() in data.js.
//   All (no genre): 20 artists, max 2 per genre in the top 10 and max 3 overall (TREND_ALL), no ungenred rows.
//   A genre: everyone charting in that genre.
import { useEffect, useState } from "react";
import { TREND_METRICS, TREND_ALL, INITIAL_COUNT, MORE_COUNT, DEFAULT_SOURCE, fmt, esc, imageHtml, viewState, toast, currentGenre, genreLabel } from "../lib/shared.js";

const Icon = ({ id }) => <svg className="icon"><use href={`#${id}`} /></svg>;
const SOURCE_LABEL = { apple: "Apple Music", lastfm: "Last.fm" };

// Each step fills up to `upTo` rows with at most `perGenre` per genre; artists skipped by an earlier step
// are looked at again by the next one (Lil Baby misses the top 10's 2-per-genre cap, then gets #11).
function capPerGenre(list) {
  const per = {}, out = [];
  for (const { upTo, perGenre } of TREND_ALL) {
    for (const r of list) {
      if (out.length >= upTo) break;
      if (!r.g || out.includes(r) || (per[r.g] || 0) >= perGenre) continue;
      per[r.g] = (per[r.g] || 0) + 1;
      out.push(r);
    }
  }
  return out;
}

export default function TrendingList({ rows, images, date }) {
  const metrics = Object.keys(TREND_METRICS);
  const [metric, setMetric] = useState(metrics[0]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(null); // genre bar, null = All
  const [count, setCount] = useState(INITIAL_COUNT); // rows shown; Show More adds MORE_COUNT
  const [cosigned, setCosigned] = useState(() => new Set()); // demo: accounts aren't live yet
  const [view, setView] = useState({ source: DEFAULT_SOURCE, dev: false });

  useEffect(() => {
    setView(viewState());
    const q = new URLSearchParams(location.search).get("q");
    if (q) setQuery(q);
    const onSearch = e => setQuery(e.detail.query);
    const onView = e => setView(e.detail);
    const onGenre = e => { setGenre(e.detail.genre); setCount(INITIAL_COUNT); };
    setGenre(currentGenre());
    window.addEventListener("cosignr:search", onSearch);
    window.addEventListener("cosignr:view", onView);
    window.addEventListener("cosignr:genre", onGenre);
    return () => {
      window.removeEventListener("cosignr:search", onSearch);
      window.removeEventListener("cosignr:view", onView);
      window.removeEventListener("cosignr:genre", onGenre);
    };
  }, []);

  const value = r => r[metric];
  const sorted = rows.filter(r => value(r) != null && (!genre || r.g === genre)).sort((a, b) => value(b) - value(a));
  const ranked = (genre ? sorted : capPerGenre(sorted)).map((r, i) => ({ r, rank: i + 1 }));
  const max = TREND_METRICS[metric].max || (ranked[0] && value(ranked[0].r)) || 1;
  const q = query.trim().toLowerCase();
  // A search looks through everyone charting, not just the capped top 10.
  const pool = q ? sorted.map((r, i) => ({ r, rank: i + 1 })) : ranked;
  const matches = q ? pool.filter(({ r }) => r.search.some(s => s.toLowerCase().includes(q))) : pool;
  const visible = q ? matches : matches.slice(0, count);
  const left = matches.length - visible.length;

  const searchFor = name => {
    const input = document.getElementById("search");
    if (input) input.value = name;
    setQuery(name);
    toast(`Showing artists cosigned by ${name}`);
  };
  const toggleCosign = r => {
    const next = new Set(cosigned);
    if (next.delete(r.id)) toast(`Removed your cosign from ${r.name} (demo, not saved yet)`);
    else { next.add(r.id); toast(`You cosigned ${r.name} (demo, not saved yet)`); }
    setCosigned(next);
  };
  const statText = r => (metric === "now" ? r.now : metric === "apple" ? (r.short || "–") : fmt(r.lastfm));

  return (
    <>
      <div className="section-head" id="trending">
        <div>
          <h2>Trending Artists</h2>
          <p id="trendingSub">What the US is playing right now: Apple Music today{date ? ` (${date})` : ""}, Last.fm this week. Hover a cosign to see the song behind it.</p>
        </div>
        <div className="tabs" id="metricTabs" role="tablist" aria-label="Sort trending artists">
          <span>Sort by</span>
          {metrics.map(m => (
            <button key={m} className={m === metric ? "active" : ""} type="button" role="tab" aria-selected={m === metric}
                    title={TREND_METRICS[m].title} onClick={() => { setMetric(m); setCount(INITIAL_COUNT); }}>{TREND_METRICS[m].tab}</button>
          ))}
        </div>
      </div>

      <ol className="trending" id="trendingList">
        {!visible.length && <li className="empty">{q ? <>No artists match “{query}”{genre ? ` in ${genreLabel(genre)}` : ""}.</> : `No ${genre ? genreLabel(genre) + " " : ""}artists ${metric === "lastfm" ? "on Last.fm's US chart" : metric === "apple" ? "on Apple's US charts" : "charting"} right now.`}</li>}
        {visible.map(({ r, rank }, i) => {
          const on = cosigned.has(r.id);
          const v = value(r);
          const summary = r.appleText || r.lastfmText;
          return (
            <li key={r.id} className="artist" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="rank"><b>{rank}</b></div>
              <div className="avatar-cell">
                {r.art
                  // No Cosignr page: their top chart entry's cover art, linking back to Apple Music.
                  ? <a className="avatar" href={r.art.url} target="_blank" rel="noopener" title="Cover art: Apple Music"
                       dangerouslySetInnerHTML={{ __html: `<img src="${esc(r.art.src)}" alt="${esc(r.name)}" loading="lazy">` }} />
                  : <div className="avatar" dangerouslySetInnerHTML={{ __html: imageHtml(images[r.id], r.name, view.source, { size: "thumb", focus: "center 25%", dev: view.dev }) }} />}
                {/* Phones (Julian, 2026-10-16): score badge on the photo's top-left, the current number under it. */}
                <div className="m-score" title="Trending score">{r.now}</div>
                {r.short && <div className="m-listeners"><b>{r.short}</b><small>{r.apple != null ? "on Apple" : "this week"}</small></div>}
              </div>
              <div>
                <h3>
                  {r.href ? <a className="artist-link" href={r.href}>{r.name}</a> : r.name}
                  <span className={`src-tag src-${r.source}`} title={r.source === "lastfm" ? "Added from Last.fm: Apple's chart barely covers this genre" : "From Apple Music's US charts"}>{SOURCE_LABEL[r.source]}</span>
                </h3>
                <div className="meta">
                  {[r.genre, r.hometown].filter(Boolean).join(" · ")}
                  {summary && <span className="meta-listeners">{r.genre || r.hometown ? " · " : ""}<b>{summary}</b></span>}
                </div>
                <div className="cosigns">
                  <h5>Cosigned by</h5>
                  {r.chips.length
                    ? r.chips.map((c, j) => c.href
                        // Cosigners with an artist page link to it; others filter the list by that cosigner.
                        ? <a key={c.name} className={`chip${j === 0 ? " top" : ""}`} title={c.title} href={c.href}>{c.name}</a>
                        : <button key={c.name} className={`chip${j === 0 ? " top" : ""}`} title={c.title} type="button" onClick={() => searchFor(c.name)}>{c.name}</button>
                      )
                    : <span className="no-cosigns">No cosigns found yet</span>}
                </div>
              </div>
              <div className="stat">
                <b>{statText(r)}</b>
                <small>{TREND_METRICS[metric].label}</small>
                <div className="bar"><i style={{ width: `${Math.round(v / max * 100)}%` }} /></div>
              </div>
              <button className={`cosign-btn${on ? " on" : ""}`} type="button" aria-pressed={on} onClick={() => toggleCosign(r)}>
                <Icon id={on ? "i-check" : "i-plus"} />{on ? "Cosigned" : "Cosign"}
              </button>
            </li>
          );
        })}
      </ol>

      {/* 10 more per click, then Show Less (like Hot Right Now). */}
      <button className={`showmore${left > 0 ? "" : " open"}`} id="showMore" type="button" hidden={!!q || matches.length <= INITIAL_COUNT}
              onClick={() => {
                if (left > 0) setCount(c => c + MORE_COUNT);
                else { setCount(INITIAL_COUNT); document.getElementById("trending")?.scrollIntoView({ behavior: "smooth" }); }
              }}>
        <span>{left > 0 ? `Show More (${Math.min(MORE_COUNT, left)})` : "Show Less"}</span> <Icon id="i-down" />
      </button>
    </>
  );
}
