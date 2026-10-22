// Shared MusicBrainz client. Keeps every script under the 1 request/second limit
// and retries when the server asks us to slow down (503/429), has a server error (5xx),
// or the connection fails (a slow connect killed the nightly job on 2026-10-22).

const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes/Cosignr)", Accept: "application/json" };
const BASE = "https://musicbrainz.org/ws/2";

const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;

export async function mb(pathAndQuery) {
  for (let attempt = 0; ; attempt++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res;
    try {
      res = await fetch(`${BASE}/${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}fmt=json`, { headers: UA });
    } catch (err) {
      // Network failure (timeout, reset, DNS): wait longer each time, up to ~1 min in total.
      if (attempt < 5) { console.warn(`  ! MusicBrainz ${err.cause?.code || err.message}, retrying`); await sleep(4000 * (attempt + 1)); continue; }
      throw err;
    }
    if (res.ok) return res.json();
    if ((res.status === 503 || res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(2000 * (attempt + 1)); continue; }
    throw new Error(`${res.status} ${pathAndQuery}`);
  }
}
