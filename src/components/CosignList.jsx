// A cosign list on an artist page ("Cosigned by" or "Cosigns"). The page HTML holds the first
// PAGE_SIZE rows; "Show more" and the sort tabs fetch the artist's full lists once
// (/artist/<id>.json) and then reveal PAGE_SIZE more at a time. Julian (2026-10-15): 10 at a time.
import { useState } from "react";

const PAGE_SIZE = 10;
const TYPE_LABELS = { upcoming: "Upcoming", tour: "Tour", band: "Touring band", feature: "Feature", remix: "Remix", collab: "Collab" };
const TYPE_ORDER = Object.keys(TYPE_LABELS);
// Sort tabs for the outbound list (Julian: Strongest is the default, then Recent and Famous).
const SORTS = {
  strongest: { tab: "Strongest", title: "Most vouches first: tours, features, remixes, touring band, upcoming shows",
               fn: (x, y) => y.vouches - x.vouches || y.songs - x.songs || (y.last || "").localeCompare(x.last || "") },
  recent:    { tab: "Recent", title: "Newest cosign first",
               fn: (x, y) => (y.last || "").localeCompare(x.last || "") || y.vouches - x.vouches },
  famous:    { tab: "Famous", title: "Most Last.fm listeners first",
               fn: (x, y) => y.fame - x.fame || y.vouches - x.vouches },
};

const Icon = ({ id }) => <svg className="icon"><use href={`#${id}`} /></svg>;

function Row({ r, i }) {
  const types = [...r.types].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  return (
    <li className="cosign-row" style={{ animationDelay: `${(i % PAGE_SIZE) * 30}ms` }}>
      <div className="cosign-head">
        {r.page ? <a className="cosign-name" href={r.href}>{r.name}</a>
                : <a className="cosign-name ext" href={r.href} target="_blank" rel="noopener" title="No Cosignr page yet: opens MusicBrainz">{r.name}</a>}
        <span className="badges">{types.map(t => <span key={t} className={`badge-type t-${t}`}>{TYPE_LABELS[t] || t}</span>)}</span>
      </div>
      <ul className="evidence">
        {r.lines.map((l, j) => (
          <li key={j} className={`ev ev-${l.type}`}>
            {l.url ? <a href={l.url} target="_blank" rel="noopener">{l.text}</a> : l.text}
            {l.source && <small> · {l.source}</small>}
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function CosignList({ id, list, title, sub, initial, total, jsonUrl, sorts = null, empty }) {
  const [rows, setRows] = useState(initial); // full list once loaded, else the first PAGE_SIZE
  const [loaded, setLoaded] = useState(initial.length >= total);
  const [count, setCount] = useState(PAGE_SIZE);
  const [sort, setSort] = useState(sorts?.[0] || null);
  const [busy, setBusy] = useState(false);

  async function full() {
    if (loaded) return rows;
    setBusy(true);
    try {
      const data = await (await fetch(jsonUrl)).json();
      setRows(data[list]);
      setLoaded(true);
      return data[list];
    } finally { setBusy(false); }
  }
  async function more() {
    await full();
    setCount(c => c + PAGE_SIZE);
  }
  async function resort(key) {
    const all = await full();
    setSort(key);
    setCount(PAGE_SIZE);
    setRows([...all].sort(SORTS[key].fn));
  }

  const visible = rows.slice(0, count);
  const left = total - visible.length;

  return (
    <section className="cosign-list" id={id}>
      <div className="section-head">
        <div>
          <h2>{title} <span className="count">{total}</span></h2>
          <p>{sub}</p>
        </div>
        {sorts && total > 1 && (
          <div className="tabs" role="tablist" aria-label={`Sort ${title}`}>
            <span>Sort by</span>
            {sorts.map(k => (
              <button key={k} className={k === sort ? "active" : ""} type="button" role="tab" aria-selected={k === sort}
                      title={SORTS[k].title} onClick={() => resort(k)}>{SORTS[k].tab}</button>
            ))}
          </div>
        )}
      </div>
      {total === 0
        ? <p className="no-cosigns">{empty}</p>
        : <ol className="cosign-rows">{visible.map((r, i) => <Row key={`${sort}-${r.href}`} r={r} i={i} />)}</ol>}
      {left > 0 && (
        <button className="showmore" type="button" onClick={more} disabled={busy}>
          <span>{busy ? "Loading…" : `Show ${Math.min(PAGE_SIZE, left)} more (${left} left)`}</span> <Icon id="i-down" />
        </button>
      )}
    </section>
  );
}
