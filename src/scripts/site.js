// Browser behaviour shared by every page: image-source switching (dev panel), header search,
// nav links, "coming soon" links and the Shift+D shortcut. Islands listen for the same events:
//   cosignr:view    { source, dev }  image source or dev mode changed
//   cosignr:search  { query }        header search typed
//   cosignr:genre   { genre }        genre bar clicked (null = All)
import { DEFAULT_SOURCE, imageHtml, creditHtml, creditsHtml, viewState, store, toast, currentGenre } from "../lib/shared.js";

const IMAGES = JSON.parse(document.getElementById("cosignr-images")?.textContent || "{}");
const BASE = document.body.dataset.base || "/";
const onHome = !!document.getElementById("trendingList");

// Static images (Featured, Top) are built with the default source. Elements marked
// data-img="<artist id>" hold the image as a direct child; data-credit marks a credit element.
function applyView({ source, dev }) {
  document.body.classList.toggle("dev", dev);
  for (const box of document.querySelectorAll("[data-img]")) {
    const img = IMAGES[box.dataset.img];
    if (!img) continue;
    const old = box.querySelector(":scope > img, :scope > .ph");
    const tmp = document.createElement("div");
    tmp.innerHTML = imageHtml(img, img.name, source, { focus: box.dataset.focus, dev });
    const next = tmp.firstElementChild;
    if (old) old.replaceWith(next);
    if (box.hasAttribute("data-src")) box.dataset.src = next.dataset.src;
  }
  for (const el of document.querySelectorAll("[data-credit]")) {
    const tmp = document.createElement("div");
    tmp.innerHTML = creditHtml(IMAGES[el.dataset.credit], source) || `<span hidden></span>`;
    const next = tmp.firstElementChild;
    next.dataset.credit = el.dataset.credit;
    el.replaceWith(next);
  }
  const list = document.getElementById("creditsList");
  if (list) {
    list.innerHTML = creditsHtml(IMAGES, source);
    document.getElementById("credits").hidden = !list.children.length;
  }
}

function broadcast(view) {
  applyView(view);
  window.dispatchEvent(new CustomEvent("cosignr:view", { detail: view }));
}

// Apply a non-default view (e.g. ?src=wikimedia or dev mode) as soon as the page loads.
const initial = viewState();
if (initial.source !== DEFAULT_SOURCE || initial.dev) applyView(initial);
window.addEventListener("cosignr:set-view", e => broadcast(e.detail));

// ---------- header search ----------
const input = document.getElementById("search");
const q = new URLSearchParams(location.search).get("q");
if (q && input) input.value = q;
input?.addEventListener("input", () => window.dispatchEvent(new CustomEvent("cosignr:search", { detail: { query: input.value } })));
document.getElementById("searchForm")?.addEventListener("submit", e => {
  e.preventDefault();
  if (!onHome) { location.href = `${BASE}?q=${encodeURIComponent(input.value)}#trending`; return; }
  window.dispatchEvent(new CustomEvent("cosignr:search", { detail: { query: input.value } }));
  document.getElementById("trending").scrollIntoView({ behavior: "smooth" });
});

// ---------- sticky bars ----------
// The nav is sticky, and on the home page the genre bar sticks right under it (Julian, 2026-10-19).
// Their heights differ by screen size, so measure them: --nav-h places the genre bar, and
// scroll-padding-top keeps section links and the genre scroll from landing under the bars.
function measureBars() {
  const nav = document.querySelector("nav")?.offsetHeight || 0;
  const bar = document.querySelector(".genre-bar")?.offsetHeight || 0;
  document.documentElement.style.setProperty("--nav-h", `${nav}px`);
  document.documentElement.style.scrollPaddingTop = `${nav + bar + 20}px`;
}
measureBars();
window.addEventListener("resize", measureBars);

// ---------- genre bar (home page) ----------
// Sets ?genre=<id> without reloading and tells the islands (Trending, Rising, Hot Right Now, Most
// Cosigned) through a "cosignr:genre" event. Featured is not filtered.
function applyGenre(genre) {
  for (const b of document.querySelectorAll(".genre-bar button")) {
    const on = (b.dataset.genre || null) === genre;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
    // On phones the bar scrolls sideways: bring the active genre into view (horizontal only).
    if (on) b.parentElement.scrollLeft = b.offsetLeft - (b.parentElement.clientWidth - b.offsetWidth) / 2;
  }
}
document.querySelectorAll(".genre-bar button").forEach(b => b.addEventListener("click", () => {
  const genre = b.dataset.genre || null;
  const url = new URL(location.href);
  if (genre) url.searchParams.set("genre", genre); else url.searchParams.delete("genre");
  history.replaceState(null, "", url);
  applyGenre(genre);
  window.dispatchEvent(new CustomEvent("cosignr:genre", { detail: { genre } }));
  // Jump like the nav links (Julian, 2026-10-19): a genre goes to Trending, the first list it filters;
  // "All" goes back to Featured.
  document.getElementById(genre ? "trending" : "featured")?.scrollIntoView({ behavior: "smooth" });
}));
if (currentGenre()) applyGenre(currentGenre());

// ---------- nav and placeholder links ----------
document.querySelectorAll("nav a").forEach(a => {
  a.addEventListener("click", e => {
    document.querySelectorAll("nav a").forEach(x => x.classList.toggle("active", x === a));
    if (a.dataset.target === "search") { e.preventDefault(); input?.focus(); }
  });
});
document.querySelectorAll('a[href="#"]').forEach(a =>
  a.addEventListener("click", e => {
    e.preventDefault();
    if (a.classList.contains("logo")) window.scrollTo({ top: 0, behavior: "smooth" });
    else toast("Coming soon");
  }));

// ---------- dev panel shortcut: Shift+D (or open the page with ?dev) ----------
document.addEventListener("keydown", e => {
  if (!(e.shiftKey && e.key.toLowerCase() === "d") || e.target.closest("input, textarea")) return;
  const view = viewState();
  const dev = !view.dev;
  store.set("cosignr.dev", dev ? "1" : "0");
  if (!dev && new URLSearchParams(location.search).has("dev")) history.replaceState(null, "", location.pathname + location.hash);
  broadcast({ ...view, dev });
  toast(dev ? "Developer panel on (Shift+D to hide)" : "Developer panel off");
});
