// Static site for GitHub Pages: https://julian-reyes.github.io/Cosignr/
// Every internal link must start with import.meta.env.BASE_URL ("/Cosignr/").
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://julian-reyes.github.io",
  base: "/Cosignr",
  output: "static",
  integrations: [react()],
});
