// Helpers used both at build time (Astro pages) and in the browser (React islands, site scripts).
// No data imports here: anything that runs in the browser must not pull in data/*.json.

// Trending sort tabs. `max` fixes the bar scale (the score is out of 100); otherwise bars are
// relative to the leader. (The all-time Score/Listeners/Plays/Fans tabs were retired 2026-10-19.)
// (TRENDING.md, Julian 2026-10-19: tabs for now, may go later.) All current data.
export const TREND_METRICS = {
  now:    { tab: "All sources", label: "Trending score", max: 100,
            title: "0–100: Apple Music chart position (US, today), Last.fm for genres Apple barely charts" },
  apple:  { tab: "Apple Music", label: "Apple chart points", title: "Songs and albums in Apple Music's US top 100 today (101 − rank each)" },
  lastfm: { tab: "Last.fm",     label: "US listeners this week", title: "Last.fm US chart, last 7 days" },
};
// "All" (Julian, 2026-10-19): 20 artists; at most 2 per genre in the top 10, at most 3 per genre overall;
// artists without a genre (sleep/white-noise albums) are left out of All.
export const TREND_ALL = [{ upTo: 10, perGenre: 2 }, { upTo: 20, perGenre: 3 }];

// The "All" view of Trending and Rising. Each step fills up to `upTo` rows with at most `perGenre` per
// genre; rows skipped by an earlier step are looked at again by the next one (Lil Baby misses the top
// 10's 2-per-genre cap, then gets #11). Rows without a genre (`g`) are left out.
export function capByGenre(list, steps = TREND_ALL) {
  const per = {}, out = [];
  for (const { upTo, perGenre } of steps) {
    for (const r of list) {
      if (out.length >= upTo) break;
      if (!r.g || out.includes(r) || (per[r.g] || 0) >= perGenre) continue;
      per[r.g] = (per[r.g] || 0) + 1;
      out.push(r);
    }
  }
  return out;
}
export const INITIAL_COUNT = 5; // Trending shows 5, then Show More adds MORE_COUNT (Julian, 2026-10-19)
export const MORE_COUNT = 10;
export const CHIP_COUNT = 4;

// Image sources, in "auto" fallback order (best first).
export const SOURCES = {
  press:     { label: "Press kit" },
  wikimedia: { label: "Wikimedia" },
  spotify:   { label: "Spotify" },
  original:  { label: "Original" },
};
export const AUTO_ORDER = ["press", "wikimedia", "spotify", "original"];
export const DEFAULT_SOURCE = "spotify"; // chosen 2026-10-14 after comparing sources

// Home page genre bar (Julian, 2026-10-16). Detailed genres (hand-written, MusicBrainz, Apple tags) fold
// into these groups; the first rule that matches wins, so "Indie Pop" is Indie and "Emo Rap" is Hip-Hop.
export const GENRES = [
  { id: "hip-hop", label: "Hip-Hop" }, { id: "pop", label: "Pop" }, { id: "rnb", label: "R&B" },
  { id: "indie", label: "Indie" }, { id: "electronic", label: "Electronic" }, { id: "rock", label: "Rock" },
  { id: "country", label: "Country" }, { id: "latin", label: "Latin" },
];
const GENRE_RULES = [
  ["hip-hop", /hip.?hop|rap\b|trap\b|drill|grime/i],
  ["rnb", /r&b|soul/i],
  ["country", /country|americana/i],
  ["latin", /latin|reggaeton|urbano|regional mexican|corrido|bachata|salsa/i],
  ["indie", /indie|alternative(?! dance)|art pop|dream pop|shoegaze|bedroom/i],
  ["rock", /rock|emo\b|punk|metal|grunge|hardcore/i],
  ["electronic", /electro|edm|house|techno|dubstep|brostep|bass|trance|dance|drum|breakbeat|garage|ambient/i],
  ["pop", /pop/i],
];
export const genreGroup = g => (g ? GENRE_RULES.find(([, re]) => re.test(g))?.[0] || null : null);
export const genreLabel = id => GENRES.find(g => g.id === id)?.label || null;
// Current genre filter (browser only): ?genre=hip-hop. Changes are broadcast as "cosignr:genre" events.
export const currentGenre = () => {
  const g = new URLSearchParams(location.search).get("genre");
  return GENRES.some(x => x.id === g) ? g : null;
};

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
                      : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
export const initials = name => name.split(/\s+/).filter(w => /^[a-z0-9]/i.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("");
export const icon = id => `<svg class="icon"><use href="#${id}"/></svg>`;

// ---------- images ----------
// `images` is { [artistId]: { original, press, wikimedia, spotify, focus } }, built by data.js.
// Paths to local files (original mockups, press kits) are already prefixed with the site base.

export function sourceFor(img, name) {
  return img?.[name] || null;
}

// Returns { src, name } for a source setting, or { src: null } if unavailable.
export function pickImage(img, source) {
  if (source !== "auto") return { src: sourceFor(img, source), name: source };
  for (const name of AUTO_ORDER) {
    const src = sourceFor(img, name);
    if (src) return { src, name };
  }
  return { src: null, name: "none" };
}

// The chosen source, or (outside the dev panel) the next best one when it has no photo: Spotify is the
// default, but a few artists only have a Wikimedia photo (Julian, 2026-10-19). In dev mode a missing
// source shows initials on purpose, so the sources can be compared.
export const shownImage = (img, source, dev = false) => {
  const pick = pickImage(img, source);
  return pick.src || dev ? pick : pickImage(img, "auto");
};

export function imageHtml(img, name, source, { size = "large", focus = "center 30%", dev = false } = {}) {
  const { src, name: used } = shownImage(img, source, dev);
  if (!src) {
    return `<div class="ph" data-src="none" role="img" aria-label="${esc(name)}">
              <span>${esc(initials(name))}</span>
              ${dev ? `<em>No ${esc(SOURCES[source]?.label || "")} image</em>` : ""}
            </div>`;
  }
  const url = size === "thumb" ? src.thumb || src.url : src.url;
  const pos = img.focus?.[used] || focus;
  return `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" data-src="${used}" style="object-position:${pos}">`;
}

export function creditHtml(img, source) {
  const { src, name } = shownImage(img, source);
  if (!src?.credit) return "";
  const c = src.credit;
  const text = name === "spotify" ? "Image: Spotify" : `Photo: ${c.author} · ${c.license}`;
  return c.source
    ? `<a class="credit" href="${esc(c.source)}" target="_blank" rel="noopener">${esc(text)}</a>`
    : `<span class="credit">${esc(text)}</span>`;
}

// Footer photo credits: <li> items for every artist whose image in this source has a credit.
export function creditsHtml(images, source) {
  return Object.values(images).map(img => {
    const { src, name } = shownImage(img, source);
    if (!src?.credit || name === "original") return "";
    const c = src.credit;
    const license = c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license);
    const link = c.source ? ` · <a href="${esc(c.source)}" target="_blank" rel="noopener">source</a>` : "";
    return `<li><b>${esc(img.name)}</b>: ${esc(c.author)} · ${license}${link}</li>`;
  }).filter(Boolean).join("");
}

// ---------- browser state ----------

export const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};

// Current image source and dev mode (browser only). Changes are broadcast as "cosignr:view" events.
export function viewState() {
  const params = new URLSearchParams(location.search);
  return {
    source: params.get("src") || store.get("cosignr.imageSource", DEFAULT_SOURCE),
    dev: params.has("dev") || store.get("cosignr.dev", "0") === "1",
  };
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
