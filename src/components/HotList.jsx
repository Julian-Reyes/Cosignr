// "Hot Right Now" (HOT.md): Songs | Albums | Videos tabs from Apple Music US and YouTube US.
// Top 5, then Show More adds 10 at a time, up to HOT_COUNT (Julian, 2026-10-16; like Trending).
// Props come from hotLists() in data.js: rows hold only what the list shows. Cover art and thumbnails
// always link back to the service they came from (Apple Music / YouTube image terms, approved by
// Julian 2026-10-16).
import { useEffect, useState } from "react";
import { currentGenre, genreLabel } from "../lib/shared.js";

const INITIAL = 5;
const STEP = 10;
const TABS = { songs: "Songs", albums: "Albums", videos: "Videos" };

const Icon = ({ id }) => <svg className="icon"><use href={`#${id}`} /></svg>;

function Row({ r, i }) {
  return (
    <li className={`hot-row${r.wide ? " wide" : ""}`} style={{ animationDelay: `${(i < INITIAL ? i : (i - INITIAL) % STEP) * 30}ms` }}>
      <div className="rank"><b>{r.rank}</b></div>
      <a className="hot-art" href={r.url} target="_blank" rel="noopener" tabIndex={-1} aria-hidden="true">
        {r.art ? <img src={r.art} alt="" loading="lazy" /> : <span className="ph" />}
      </a>
      <div className="hot-info">
        <h3>
          <a href={r.url} target="_blank" rel="noopener">{r.title}</a>
          {r.isNew && <span className="hot-new">New</span>}
        </h3>
        <div className="hot-artists">
          {r.artists.map((s, j) => s.href ? <a key={j} className="artist-link" href={s.href}>{s.text}</a> : <span key={j}>{s.text}</span>)}
        </div>
        {(r.genre || r.cosigns.length > 0) && (
          <div className="hot-tags">
            {r.genre && <span className="badge-type">{r.genre}</span>}
            {r.cosigns.map(c => <a key={c.label} className="chip top" href={c.href} title={c.title}>{c.label}: cosign</a>)}
          </div>
        )}
      </div>
      <a className="hot-out" href={r.url} target="_blank" rel="noopener">{r.service}</a>
    </li>
  );
}

export default function HotList({ tabs, max, appleDate, youtubeDate }) {
  const keys = Object.keys(TABS).filter(k => tabs[k].length);
  const [tab, setTab] = useState(keys[0]);
  const [count, setCount] = useState(INITIAL);
  const [genre, setGenre] = useState(null); // genre bar, null = All

  useEffect(() => {
    setGenre(currentGenre());
    const onGenre = e => { setGenre(e.detail.genre); setCount(INITIAL); };
    window.addEventListener("cosignr:genre", onGenre);
    return () => window.removeEventListener("cosignr:genre", onGenre);
  }, []);
  if (!keys.length) return null;

  // Ranks stay the chart's ranks; a genre shows its own top `max` from the full chart.
  const rows = genre ? tabs[tab].filter(r => r.g === genre).slice(0, max) : tabs[tab].filter(r => r.rank <= max);
  const visible = rows.slice(0, count);
  const left = rows.length - visible.length;
  const source = tab === "videos" ? `YouTube, ${youtubeDate}` : `Apple Music, ${appleDate}`;

  return (
    <section className="hot" id="hot">
      <div className="section-head">
        <div>
          <h2>Hot Right Now</h2>
          <p>Most played in the US today ({source}). Updated daily.</p>
        </div>
        {keys.length > 1 && (
          <div className="tabs" role="tablist" aria-label="Hot Right Now">
            {keys.map(k => (
              <button key={k} className={k === tab ? "active" : ""} type="button" role="tab" aria-selected={k === tab}
                      onClick={() => { setTab(k); setCount(INITIAL); }}>{TABS[k]}</button>
            ))}
          </div>
        )}
      </div>
      {rows.length
        ? <ol className="hot-list">{visible.map((r, i) => <Row key={`${tab}-${r.key}`} r={r} i={i} />)}</ol>
        : <p className="genre-empty">No {genreLabel(genre)} {TABS[tab].toLowerCase()} in today's chart{tab === "videos" ? " that we can tag (video genres come from artists with a Cosignr page)" : ""}.</p>}
      {left > 0
        ? <button className="showmore" type="button" onClick={() => setCount(c => c + STEP)}>
            <span>Show More ({Math.min(STEP, left)})</span> <Icon id="i-down" />
          </button>
        : rows.length > INITIAL && (
          <button className="showmore open" type="button" onClick={() => { setCount(INITIAL); document.getElementById("hot")?.scrollIntoView({ behavior: "smooth" }); }}>
            <span>Show Less</span> <Icon id="i-down" />
          </button>
        )}
    </section>
  );
}
