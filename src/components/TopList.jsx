// Top Artists: the most cosigned artists (Julian, 2026-10-19), 3 per view. Follows the genre bar
// ("All" or a genre) and has its own toggle: All time (default) / This year. Props from topRows().
import { useEffect, useState } from "react";
import { DEFAULT_SOURCE, imageHtml, creditHtml, viewState, currentGenre, genreLabel } from "../lib/shared.js";

const PERIODS = { allTime: "All time", thisYear: "This year" };
const COUNT = 3;

export default function TopList({ rows, images }) {
  const [period, setPeriod] = useState("allTime");
  const [genre, setGenre] = useState(null);
  const [view, setView] = useState({ source: DEFAULT_SOURCE, dev: false });

  useEffect(() => {
    setView(viewState());
    setGenre(currentGenre());
    const onGenre = e => setGenre(e.detail.genre);
    const onView = e => setView(e.detail);
    window.addEventListener("cosignr:genre", onGenre);
    window.addEventListener("cosignr:view", onView);
    return () => { window.removeEventListener("cosignr:genre", onGenre); window.removeEventListener("cosignr:view", onView); };
  }, []);

  const shown = rows.filter(r => r[period] > 0 && (!genre || r.g === genre)).sort((x, y) => y[period] - x[period]).slice(0, COUNT);

  return (
    <section className="bottom" id="top">
      <h3>Most Cosigned</h3>
      <p className="sub">
        {genre ? `${genreLabel(genre)} artists` : "Artists"} with the most cosigners on Cosignr {period === "allTime" ? "of all time" : "in the last 12 months"}: features, collabs and tours.
      </p>
      <div className="tabs top-toggle" role="tablist" aria-label="Period">
        {Object.entries(PERIODS).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={k === period} className={k === period ? "active" : ""} onClick={() => setPeriod(k)}>{label}</button>
        ))}
      </div>
      {shown.length
        ? <div className="top-grid">
            {shown.map((r, i) => {
              const img = images[r.id];
              const credit = creditHtml(img, view.source);
              return (
                <article key={`${period}-${r.id}`} className="top-card">
                  <div className="top-img" dangerouslySetInnerHTML={{ __html: imageHtml(img, r.name, view.source, { dev: view.dev }) }} />
                  <span className="num">{i + 1}</span>
                  <div className="overlay">
                    <h3><a className="artist-link" href={r.href}>{r.name}</a></h3>
                    <p>{[r.genre, `${r[period]} cosigners`].filter(Boolean).join(" · ")}</p>
                  </div>
                  {credit && <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: credit }} />}
                </article>
              );
            })}
          </div>
        : <p className="genre-empty">No {genre ? genreLabel(genre) + " " : ""}artists with cosigns {period === "thisYear" ? "this year " : ""}yet.</p>}
    </section>
  );
}
