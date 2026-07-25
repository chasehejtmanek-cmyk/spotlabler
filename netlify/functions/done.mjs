import { getStore } from "@netlify/blobs";

export default async (req) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  const store = getStore("spot-labels");
  const { blobs } = await store.list();
  const keys = new Set();
  for (const b of blobs) {
    const v = await store.get(b.key, { type: "json" });
    if (v && v.panoid) keys.add(v.panoid + "|" + (v.heading == null ? "x" : v.heading));
  }
  return new Response(JSON.stringify([...keys]), { headers: cors });
};
