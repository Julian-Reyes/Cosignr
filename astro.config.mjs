// Static site for GitHub Pages, served at https://julianreyes.dev/Cosignr/ (julian-reyes.github.io redirects there).
// Every internal link must start with import.meta.env.BASE_URL ("/Cosignr/").
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://julianreyes.dev",
  base: "/Cosignr",
  output: "static",
  integrations: [react()],
});
