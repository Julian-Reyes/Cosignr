// Rising (RISING.md): artists on the way up. Rows arrive ranked: Apple top 100 first, then Last.fm US top
// tracks, then everyone else (charting 3 · cosign 2 · heat/growth 1 within each tier). Same row style as Trending.
// Genre bar filter, header search, 5 shown + Show More 10, demo Cosign button. Props from risingRows().
//   All (no genre): 20, max 2 per genre in the top 10 and max 3 overall (capByGenre, like Trending).
//   A genre: every newcomer in that genre.
import { useEffect, useState } from "react";
import { capByGenre, INITIAL_COUNT, MORE_COUNT, DEFAULT_SOURCE, fmt, imageHtml, viewState, toast, currentGenre, genreLabel } from "../lib/shared.js";

const Icon = ({ id }) => <svg className="icon"><use href={`#${id}`} /></svg>;

export default function RisingList({ rows, images }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(null);
  const [count, setCount] = useState(INITIAL_COUNT);
  const [cosigned, setCosigned] = useState(() => new Set()); // demo: accounts aren't live yet
  const [view, setView] = useState({ source: DEFAULT_SOURCE, dev: false });

  useEffect(() => {
    setView(viewState());
    const q = new URLSearchParams(location.search).get("q");
    if (q) setQuery(q);
    setGenre(currentGenre());
    const onSearch = e => setQuery(e.detail.query);
    const onView = e => setView(e.detail);
    const onGenre = e => { setGenre(e.detail.genre); setCount(INITIAL_COUNT); };
    window.addEventListener("cosignr:search", onSearch);
    window.addEventListener("cosignr:view", onView);
    window.addEventListener("cosignr:genre", onGenre);
    return () => {
      window.removeEventListener("cosignr:search", onSearch);
      window.removeEventListener("cosignr:view", onView);
      window.removeEventListener("cosignr:genre", onGenre);
    };
  }, []);

  const inGenre = rows.filter(r => !genre || r.g === genre); // rows arrive ranked by Rising score
  const ranked = (genre ? inGenre : capByGenre(inGenre)).map((r, i) => ({ r, rank: i + 1 }));
  const q = query.trim().toLowerCase();
  const matches = q ? inGenre.map((r, i) => ({ r, rank: i + 1 })).filter(({ r }) => r.search.some(s => s.toLowerCase().includes(q))) : ranked;
  const visible = q ? matches : matches.slice(0, count);
  const left = matches.length - visible.length;

  const toggleCosign = r => {
    const next = new Set(cosigned);
    if (next.delete(r.id)) toast(`Removed your cosign from ${r.name} (demo, not saved yet)`);
    else { next.add(r.id); toast(`You cosigned ${r.name} (demo, not saved yet)`); }
    setCosigned(next);
  };

  return (
    <section className="rising" id="rising">
      <div className="section-head">
        <div>
          <h2>Rising</h2>
          <p>Artists on the way up: new and little-known names charting now, breaking out, or vouched for by the big names. Hover heat or a cosign to see why.</p>
        </div>
      </div>

      <ol className="trending">
        {!visible.length && <li className="empty">{q ? <>No rising artists match “{query}”{genre ? ` in ${genreLabel(genre)}` : ""}.</> : `No rising ${genreLabel(genre)} artists this year so far.`}</li>}
        {visible.map(({ r, rank }, i) => {
          const on = cosigned.has(r.id);
          const facts = [`${fmt(r.listeners)} listeners`, r.firstYear && `first release ${r.firstYear}`].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="artist" style={{ animationDelay: `${(i % MORE_COUNT) * 40}ms` }}>
              <div className="rank"><b>{rank}</b></div>
              <div className="avatar-cell">
                <div className="avatar" dangerouslySetInnerHTML={{ __html: imageHtml(images[r.id], r.name, view.source, { size: "thumb", focus: "center 25%", dev: view.dev }) }} />
                <div className="m-listeners"><b>{fmt(r.listeners)}</b><small>listeners</small></div>
              </div>
              <div>
                <h3>{r.page ? <a className="artist-link" href={r.href}>{r.name}</a>
                            : <a className="artist-link" href={r.href} target="_blank" rel="noopener" title="No Cosignr page yet: opens MusicBrainz">{r.name}</a>}</h3>
                <div className="meta">
                  {[r.genre, r.hometown].filter(Boolean).join(" · ")}
                  <span className="meta-listeners">{r.genre || r.hometown ? " · " : ""}<b>{facts}</b></span>
                </div>
                {(r.heat || r.charts.length > 0) && (
                  <div className="rising-charts">
                    {r.heat && <span className="heat" title={r.heatTitle}>Heat Score {Math.round(r.heat)}</span>}
                    {r.heat && r.charts.length > 0 && " · "}{r.charts.join(" · ")}
                  </div>
                )}
                <div className="cosigns">
                  <h5>Cosigned by</h5>
                  {r.chips.length === 0 && <span className="no-cosigns">No cosigns found yet</span>}
                  {r.chips.map((c, j) => c.href
                    ? <a key={c.name} className={`chip${j === 0 ? " top" : ""}`} title={c.title} href={c.href}>{c.name}</a>
                    : <a key={c.name} className={`chip${j === 0 ? " top" : ""}`} title={c.title} href={c.url || "#"} target="_blank" rel="noopener">{c.name}</a>)}
                </div>
              </div>
              <div className="stat">
                <b>{r.score.toFixed(1)}</b>
                <small>Rising Score</small>
                <div className="bar"><i style={{ width: `${Math.round(r.score * 10)}%` }} /></div>
              </div>
              <button className={`cosign-btn${on ? " on" : ""}`} type="button" aria-pressed={on} onClick={() => toggleCosign(r)}>
                <Icon id={on ? "i-check" : "i-plus"} />{on ? "Cosigned" : "Cosign"}
              </button>
            </li>
          );
        })}
      </ol>

      <button className={`showmore${left > 0 ? "" : " open"}`} type="button" hidden={!!q || matches.length <= INITIAL_COUNT}
              onClick={() => {
                if (left > 0) setCount(c => c + MORE_COUNT);
                else { setCount(INITIAL_COUNT); document.getElementById("rising")?.scrollIntoView({ behavior: "smooth" }); }
              }}>
        <span>{left > 0 ? `Show More (${Math.min(MORE_COUNT, left)})` : "Show Less"}</span> <Icon id="i-down" />
      </button>
    </section>
  );
}
