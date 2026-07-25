import { getStore } from "@netlify/blobs";

// GET /.netlify/functions/labels?k=SECRET        -> all label records (JSON array)
// GET /.netlify/functions/labels?k=SECRET&stat=1 -> just counts
// Change SECRET below (also settable via LABELS_KEY env var on Netlify).
const SECRET = process.env.LABELS_KEY || "ursa-spots-2026";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== SECRET) return new Response("nope", { status: 401 });

  const store = getStore("spot-labels");
  const { blobs } = await store.list();
  const recs = [];
  for (const b of blobs) {
    const v = await store.get(b.key, { type: "json" });
    if (v) recs.push(v);
  }
  recs.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  if (url.searchParams.get("stat")) {
    const byUser = {};
    let spots = 0, boxes = 0;
    for (const r of recs) {
      byUser[r.user] = (byUser[r.user] || 0) + 1;
      if (r.spot) spots += 1;
      boxes += (r.boxes || []).length;
    }
    return Response.json({ total: recs.length, spots, boxes, byUser });
  }
  return new Response(JSON.stringify(recs), { status: 200, headers: { "Content-Type": "application/json" } });
};
