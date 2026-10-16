// Trending Artists: sort tabs, search filter, Show More, chip click (search by cosigner) and the
// demo Cosign button. Rendered at build time and hydrated in the browser.
// Props are prepared by index.astro: rows hold only what this list shows, not the raw data files.
import { useEffect, useState } from "react";
import { METRICS, INITIAL_COUNT, DEFAULT_SOURCE, fmt, imageHtml, viewState, toast, currentGenre, genreLabel } from "../lib/shared.js";

const Icon = ({ id }) => <svg className="icon"><use href={`#${id}`} /></svg>;

export default function TrendingList({ rows, metrics, images }) {
  const [metric, setMetric] = useState(metrics[0]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(null); // genre bar, null = All
  const [expanded, setExpanded] = useState(false);
  const [cosigned, setCosigned] = useState(() => new Set(["saba"])); // demo: accounts aren't live yet
  const [view, setView] = useState({ source: DEFAULT_SOURCE, dev: false });

  useEffect(() => {
    setView(viewState());
    const q = new URLSearchParams(location.search).get("q");
    if (q) setQuery(q);
    const onSearch = e => setQuery(e.detail.query);
    const onView = e => setView(e.detail);
    const onGenre = e => setGenre(e.detail.genre);
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

  const value = r => r.metrics[metric];
  // All: the hand-picked Trending list. A genre: its genre picks plus any All artist in that genre.
  const inView = r => (genre ? r.picks.includes(genre) || (r.all && r.g === genre) : r.all);
  // Ranked within the current view. Artists without a value for this metric sink to the bottom, in curated order.
  const ranked = rows.filter(inView).sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1)).map((r, i) => ({ r, rank: i + 1 }));
  const max = METRICS[metric]?.max || (ranked[0] && value(ranked[0].r)) || 1;
  const q = query.trim().toLowerCase();
  const matches = q ? ranked.filter(({ r }) => r.search.some(s => s.toLowerCase().includes(q))) : ranked;
  const visible = q || expanded ? matches : matches.slice(0, INITIAL_COUNT);

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

  return (
    <>
      <div className="section-head" id="trending">
        <div>
          <h2>Trending Artists</h2>
          <p id="trendingSub">Who the artists you love are cosigning right now. Hover a cosign to see the song behind it.</p>
        </div>
        <div className="tabs" id="metricTabs" role="tablist" aria-label="Sort trending artists">
          <span>Sort by</span>
          {metrics.map(m => (
            <button key={m} className={m === metric ? "active" : ""} type="button" role="tab" aria-selected={m === metric}
                    title={METRICS[m].title} onClick={() => setMetric(m)}>{METRICS[m].tab}</button>
          ))}
        </div>
      </div>

      <ol className="trending" id="trendingList">
        {!visible.length && <li className="empty">{q ? <>No artists match “{query}”{genre ? ` in ${genreLabel(genre)}` : ""}.</> : `No ${genreLabel(genre)} artists in Trending yet.`}</li>}
        {visible.map(({ r, rank }, i) => {
          const on = cosigned.has(r.id);
          const v = value(r);
          const listeners = r.metrics.listeners;
          return (
            <li key={r.id} className="artist" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="rank"><b>{v == null ? "–" : rank}</b></div>
              <div className="avatar-cell">
                <div className="avatar" dangerouslySetInnerHTML={{ __html: imageHtml(images[r.id], r.name, view.source, { size: "thumb", focus: "center 25%", dev: view.dev }) }} />
                {/* Phones (Julian, 2026-10-16): score badge on the photo's top-left, listeners under it. */}
                {r.metrics.score != null && <div className="m-score" title="Cosignr score">{r.metrics.score}</div>}
                {listeners != null && <div className="m-listeners"><b>{fmt(listeners)}</b><small>listeners</small></div>}
              </div>
              <div>
                <h3><a className="artist-link" href={r.href}>{r.name}</a></h3>
                <div className="meta">
                  {[r.genre, r.hometown].filter(Boolean).join(" · ")}
                  {listeners != null && <span className="meta-listeners">{r.genre || r.hometown ? " · " : ""}<b>{fmt(listeners)} listeners</b></span>}
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
              <div className="stat" title={v == null && r.caveat ? r.caveat : undefined}>
                <b>{v == null ? "–" : metric === "score" ? v : fmt(v)}</b>
                <small>{v == null ? "No reliable data yet" : METRICS[metric].label}</small>
                <div className="bar"><i style={{ width: `${v == null ? 0 : Math.round(v / max * 100)}%` }} /></div>
              </div>
              <button className={`cosign-btn${on ? " on" : ""}`} type="button" aria-pressed={on} onClick={() => toggleCosign(r)}>
                <Icon id={on ? "i-check" : "i-plus"} />{on ? "Cosigned" : "Cosign"}
              </button>
            </li>
          );
        })}
      </ol>

      <button className={`showmore${expanded ? " open" : ""}`} id="showMore" type="button" hidden={!!q || matches.length <= INITIAL_COUNT}
              onClick={() => setExpanded(!expanded)}>
        <span>{expanded ? "Show Less" : `Show More (${matches.length - INITIAL_COUNT})`}</span> <Icon id="i-down" />
      </button>
    </>
  );
}
