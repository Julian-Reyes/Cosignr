// Everyone who gets an artist page: the hand-curated roster (data/artists.json) plus the generated
// "extended" artists (data/extended.json: top cosigners of the roster, see fetch-extended.mjs).
// Extended artists have the same shape as roster ones plus `extended: true` and `cosignerOf`.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function loadArtists({ extended = true } = {}) {
  const { artists } = JSON.parse(await readFile(path.join(ROOT, "data/artists.json"), "utf8"));
  if (!extended) return artists;
  try {
    const ext = JSON.parse(await readFile(path.join(ROOT, "data/extended.json"), "utf8"));
    return [...artists, ...ext.artists];
  } catch {
    return artists; // no extended.json yet (run fetch-extended.mjs)
  }
}
