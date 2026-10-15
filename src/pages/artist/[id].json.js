// /artist/<id>.json: an artist's full "Cosigned by" and "Cosigns" lists. Fetched by the page only
// when someone presses "Show more" or a sort tab, so the page itself stays small.
import { PAGES, artistLists } from "../../lib/data.js";

export function getStaticPaths() {
  return PAGES.map(a => ({ params: { id: a.id }, props: { artist: a } }));
}

export function GET({ props }) {
  return new Response(JSON.stringify(artistLists(props.artist)), { headers: { "Content-Type": "application/json" } });
}
