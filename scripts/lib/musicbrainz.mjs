// Shared MusicBrainz client. Keeps every script under the 1 request/second limit
// and retries when the server asks us to slow down (503/429).

const UA = { "User-Agent": "Cosignr/0.1 (music discovery demo; https://github.com/Julian-Reyes/Cosignr)", Accept: "application/json" };
const BASE = "https://musicbrainz.org/ws/2";

const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;

export async function mb(pathAndQuery) {
  for (let attempt = 0; ; attempt++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`${BASE}/${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}fmt=json`, { headers: UA });
    if (res.ok) return res.json();
    if ((res.status === 503 || res.status === 429) && attempt < 4) { await sleep(2000 * (attempt + 1)); continue; }
    throw new Error(`${res.status} ${pathAndQuery}`);
  }
}
