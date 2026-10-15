// Developer panel (Shift+D or ?dev): switch the image source to compare press / Wikimedia /
// Spotify / original mockup images. The choice is remembered in this browser only.
import { useEffect, useState } from "react";
import { SOURCES, DEFAULT_SOURCE, viewState, store, toast } from "../lib/shared.js";

export default function DevPanel({ counts, total, meta }) {
  const [view, setView] = useState({ source: DEFAULT_SOURCE, dev: false });

  useEffect(() => {
    setView(viewState());
    const onView = e => setView(e.detail);
    window.addEventListener("cosignr:view", onView);
    return () => window.removeEventListener("cosignr:view", onView);
  }, []);

  const set = next => window.dispatchEvent(new CustomEvent("cosignr:set-view", { detail: next }));
  const choose = source => { store.set("cosignr.imageSource", source); set({ ...view, source }); };
  const close = () => { store.set("cosignr.dev", "0"); set({ ...view, dev: false }); toast("Developer panel off"); };
  const options = [["auto", "Auto (best available)", total], ...Object.entries(SOURCES).map(([k, v]) => [k, v.label, counts[k]])];

  return (
    <aside className="dev-panel" id="devPanel" hidden={!view.dev} aria-label="Developer panel">
      <div className="dev-head">
        <b>Dev · Image source</b>
        <button id="devClose" type="button" aria-label="Close developer panel" onClick={close}>&times;</button>
      </div>
      <div className="dev-options">
        {options.map(([k, label, n]) => (
          <label key={k} className={view.source === k ? "on" : ""}>
            <input type="radio" name="imgsrc" value={k} checked={view.source === k} onChange={() => choose(k)} />
            <span>{label}</span><small>{n}/{total}</small>
          </label>
        ))}
      </div>
      <p className="dev-meta">{meta}</p>
    </aside>
  );
}
