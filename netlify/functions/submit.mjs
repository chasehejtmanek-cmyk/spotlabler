import { getStore } from "@netlify/blobs";

// POST one label record -> append to the "spot-labels" blob store.
export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: cors });

  let rec;
  try { rec = await req.json(); } catch { return new Response("bad json", { status: 400, headers: cors }); }
  if (!rec || !rec.panoid) return new Response("missing panoid", { status: 400, headers: cors });

  const store = getStore("spot-labels");
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  rec._server_ts = new Date().toISOString();
  await store.setJSON(key, rec);

  return new Response(JSON.stringify({ ok: true, key }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
};
