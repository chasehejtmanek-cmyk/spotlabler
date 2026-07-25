// ── Spot-or-Not labeler ─────────────────────────────────────────────
// Each location = 4 full-size directional cards (90° each). One TAP on the spot
// drops a square around it and auto-advances. No spot? one button. We store the
// square's yaw/pitch + heading (not pixels); crops are rebuilt server-side. Every
// card is one labeled image: tapped square = tight positive, rest = clean negative.

const CFG = {
  DIRS: [0, 90, 180, 270],   // headings covering the full 360
  FOV: 90,                   // horizontal fov per view
  W: 640, H: 480,            // fetched image size
  BOX: 0.48,                 // marker square side as fraction of view height
  get VFOV() { return this.FOV * this.H / this.W; }, // 67.5
};
const SUBMIT = "/.netlify/functions/submit";
const NDIR = CFG.DIRS.length;

const $ = (s) => document.querySelector(s);
const state = { user: "", queue: [], idx: 0, dir: 0, cur: null, done: 0, spots: 0, busy: false, doneKeys: new Set() };

// ---- storage ---------------------------------------------------------
const LS = {
  get user() { return localStorage.getItem("sl.user") || ""; },
  set user(v) { localStorage.setItem("sl.user", v); },
  get pos() { try { return JSON.parse(localStorage.getItem("sl.pos." + state.user) || "null"); } catch { return null; } },
  set pos(v) { localStorage.setItem("sl.pos." + state.user, JSON.stringify(v)); },
  pushLog(rec) { const k = "sl.log", a = JSON.parse(localStorage.getItem(k) || "[]"); a.push(rec); localStorage.setItem(k, JSON.stringify(a)); },
  popLog() { const k = "sl.log", a = JSON.parse(localStorage.getItem(k) || "[]"); const r = a.pop(); localStorage.setItem(k, JSON.stringify(a)); return r; },
  counts() { const a = JSON.parse(localStorage.getItem("sl.log") || "[]"); return { done: a.length, spots: a.filter((r) => r.spot).length }; },
};

function viewUrl(pid, yaw) {
  return `https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=${pid}` +
         `&cb_client=apiv3&w=${CFG.W}&h=${CFG.H}&yaw=${yaw}&pitch=0&thumbfov=${CFG.FOV}`;
}
const compass = (deg) => ({ 0: "N", 90: "E", 180: "S", 270: "W" }[deg] || deg + "°");

// ---- boot ------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  const pre = LS.user;
  if (pre) $("#handle").value = pre;
  $("#start").onclick = start;
  $("#handle").addEventListener("keydown", (e) => { if (e.key === "Enter") start(); });
});

async function start() {
  const name = ($("#handle").value || "").trim().replace(/\s+/g, "_");
  if (!name) { $("#handle").focus(); return; }
  state.user = name; LS.user = name; $("#who").textContent = name;
  const c = LS.counts(); state.done = c.done; state.spots = c.spots;

  $("#gate").hidden = true; $("#bar").hidden = false; $("#stage").hidden = false;
  refreshCounts(); wireControls();
  if (!localStorage.getItem("sl.tut")) {
    $("#tut").hidden = false;
    $("#tutGo").onclick = () => { $("#tut").hidden = true; localStorage.setItem("sl.tut", "1"); };
  }

  try { const r = await fetch("spots-queue.json?v=" + Date.now()); state.queue = await r.json(); }
  catch (e) { toast("Couldn't load the spot queue.", "bad"); return; }
  if (!state.queue.length) { toast("Queue is empty.", "bad"); return; }

  // pull the already-labeled cards so we skip them (shared across everyone)
  try {
    const dr = await fetch("/.netlify/functions/done");
    if (dr.ok) { (await dr.json()).forEach((k) => state.doneKeys.add(k)); }
  } catch { /* offline / local — no skipping */ }

  const p = LS.pos;
  if (p) { setPos(p.i * NDIR + p.d); }
  else { setPos(Math.floor(Math.random() * Math.min(20, state.queue.length)) * NDIR); }
  loadView();
}

function refreshCounts() { $("#cDone").textContent = state.done; $("#cSpot").textContent = state.spots; }

// ---- position (linear over card = idx*NDIR + dir) --------------------
function posLin() { return state.idx * NDIR + state.dir; }
function setPos(lin) {
  lin = Math.max(0, lin);
  const n = state.queue.length || 1;
  state.idx = Math.floor(lin / NDIR) % n; state.dir = lin % NDIR;
  LS.pos = { i: state.idx, d: state.dir };
}

// ---- render one directional card ------------------------------------
function cardDone() {
  const s = state.queue[state.idx], h = CFG.DIRS[state.dir];
  return state.doneKeys.has(s.panoid + "|" + h) || state.doneKeys.has(s.panoid + "|x") || state.doneKeys.has(s.panoid + "|*");
}

function loadView() {
  if (!state.queue.length) return;
  // skip forward over anything already labeled (by anyone)
  let guard = 0, max = state.queue.length * NDIR;
  while (cardDone() && guard++ < max) setPos(posLin() + 1);
  if (guard >= max) { toast("You've labeled everything in the queue 🎉", "good"); }

  state.busy = false; clearBox(); clearPreview();
  const s = state.queue[state.idx]; state.cur = s;
  const heading = CFG.DIRS[state.dir];

  const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.lat},${s.lng}`;
  $("#spotMeta").innerHTML =
    `<b>${esc(s.name || "spot")}</b> · view ${state.dir + 1}/${NDIR} facing ${compass(heading)} · ` +
    `${s.km ?? "?"} km from NYC · <a href="${sv}" target="_blank" rel="noopener">Google ↗</a>`;

  const img = $("#pano");
  fitFrame();
  $("#loading").hidden = false;
  img.onload = () => { $("#loading").hidden = true; };
  img.onerror = () => { $("#loading").hidden = true; toast("No imagery this way — No visible spot.", "bad"); };
  img.src = viewUrl(s.panoid, heading);

  let nl = posLin() + 1;
  const ni = Math.floor(nl / NDIR) % state.queue.length, nd = nl % NDIR;
  const n = state.queue[ni]; if (n) { const im = new Image(); im.src = viewUrl(n.panoid, CFG.DIRS[nd]); }
}

// ---- frame fit -------------------------------------------------------
function fitFrame() {
  const vp = $("#viewport"), frame = $("#frame");
  if (!vp || !frame) return;
  const pad = 12, ar = CFG.W / CFG.H;
  const vw = vp.clientWidth - pad, vh = vp.clientHeight - pad;
  let w = vw, h = w / ar;
  if (h > vh) { h = vh; w = h * ar; }
  frame.style.width = Math.max(120, w) + "px";
  frame.style.height = Math.max(90, h) + "px";
}

// ---- tap to mark a spot ---------------------------------------------
function wireControls() {
  const overlay = $("#overlay");
  // Tap = fixed square around the point. Click-and-drag = custom-size box.
  overlay.addEventListener("pointerdown", (e) => {
    if (state.busy || e.button !== 0) return;
    const r = overlay.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    state.drag = { x0: x, y0: y, x1: x, y1: y, moved: false };
    overlay.setPointerCapture(e.pointerId);
  });
  overlay.addEventListener("pointermove", (e) => {
    if (state.busy) return;
    const r = overlay.getBoundingClientRect();
    if (state.drag) {                                   // drawing a custom box
      state.drag.x1 = clamp(e.clientX - r.left, 0, r.width);
      state.drag.y1 = clamp(e.clientY - r.top, 0, r.height);
      if (Math.hypot(state.drag.x1 - state.drag.x0, state.drag.y1 - state.drag.y0) > 6) state.drag.moved = true;
      showRect(Math.min(state.drag.x0, state.drag.x1), Math.min(state.drag.y0, state.drag.y1),
               Math.abs(state.drag.x1 - state.drag.x0), Math.abs(state.drag.y1 - state.drag.y0));
      return;
    }
    if (e.pointerType === "touch") return;              // hover preview (mouse only)
    const side = CFG.BOX * r.height;
    const cx = clamp(e.clientX - r.left, side / 2, r.width - side / 2);
    const cy = clamp(e.clientY - r.top, side / 2, r.height - side / 2);
    showRect(cx - side / 2, cy - side / 2, side, side);
  });
  overlay.addEventListener("pointerup", (e) => {
    if (state.busy) return;
    const r = overlay.getBoundingClientRect();
    const d = state.drag; state.drag = null;
    let box;
    if (d && d.moved && Math.abs(d.x1 - d.x0) > 8 && Math.abs(d.y1 - d.y0) > 8) {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      box = { x0: x0 / r.width, x1: x1 / r.width, y0: y0 / r.height, y1: y1 / r.height };
    } else {                                            // a tap → fixed square
      const px = d ? d.x0 : e.clientX - r.left, py = d ? d.y0 : e.clientY - r.top;
      const side = CFG.BOX * r.height;
      const cx = clamp(px, side / 2, r.width - side / 2), cy = clamp(py, side / 2, r.height - side / 2);
      box = { x0: (cx - side / 2) / r.width, x1: (cx + side / 2) / r.width, y0: (cy - side / 2) / r.height, y1: (cy + side / 2) / r.height };
    }
    state.busy = true; clearPreview(); showBox(box);    // flash the square, then advance
    setTimeout(() => submitCard(true, false, box), 160);
  });
  overlay.addEventListener("pointerleave", () => { if (!state.drag) clearPreview(); });

  $("#bNo").onclick = () => submitCard(false, false, null);
  $("#bSkip").onclick = () => submitCard(false, true, null);
  $("#bBack").onclick = goBack;
  window.addEventListener("resize", fitFrame);
  document.addEventListener("keydown", (e) => {
    if ($("#stage").hidden) return;
    const k = e.key.toLowerCase();
    if (k === "n" || e.key === "ArrowLeft") { e.preventDefault(); submitCard(false, false, null); }
    else if (k === "s") { e.preventDefault(); submitCard(false, true, null); }
    else if (k === "b" || e.key === "Backspace") { e.preventDefault(); goBack(); }
  });
}

function showBox(box) {
  const overlay = $("#overlay"); clearBox();
  const W = overlay.clientWidth, H = overlay.clientHeight;
  const el = document.createElement("div"); el.className = "box";
  el.style.left = box.x0 * W + "px"; el.style.top = box.y0 * H + "px";
  el.style.width = (box.x1 - box.x0) * W + "px"; el.style.height = (box.y1 - box.y0) * H + "px";
  overlay.appendChild(el);
}
function clearBox() { const o = $("#overlay"); if (o) [...o.querySelectorAll(".box")].forEach((n) => n.remove()); }
function showRect(left, top, w, h) {
  const o = $("#overlay"); let el = o.querySelector(".preview");
  if (!el) { el = document.createElement("div"); el.className = "preview"; o.appendChild(el); }
  el.style.left = left + "px"; el.style.top = top + "px"; el.style.width = w + "px"; el.style.height = h + "px";
}
function clearPreview() { const o = $("#overlay"); if (o) { const el = o.querySelector(".preview"); if (el) el.remove(); } }

// ---- submit / navigation --------------------------------------------
function submitCard(isSpot, isSkip, box) {
  const s = state.cur; if (!s) return;
  const heading = CFG.DIRS[state.dir];
  const boxes = box ? [{
    ...box,
    yaw0: +(((heading + (box.x0 - 0.5) * CFG.FOV) % 360 + 360) % 360).toFixed(2),
    yaw1: +(((heading + (box.x1 - 0.5) * CFG.FOV) % 360 + 360) % 360).toFixed(2),
    pitch0: +(((0.5 - box.y1) * CFG.VFOV)).toFixed(2),
    pitch1: +(((0.5 - box.y0) * CFG.VFOV)).toFixed(2),
  }] : [];
  const rec = {
    user: state.user, id: s.id, name: s.name, lat: s.lat, lng: s.lng, km: s.km,
    panoid: s.panoid, heading, fov: CFG.FOV, vfov: +CFG.VFOV.toFixed(2),
    spot: !!isSpot, skip: !!isSkip, boxes, ts: new Date().toISOString(),
  };
  LS.pushLog(rec);
  state.doneKeys.add(s.panoid + "|" + heading);
  state.done += 1; if (isSpot) state.spots += 1; refreshCounts();
  fetch(SUBMIT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }).catch(() => queuePending(rec));
  if (!isSpot) toast(isSkip ? "Skipped" : "No visible spot", "");

  setPos(posLin() + 1);
  loadView();
}

function goBack() {
  const r = LS.popLog();                 // undo the last record we saved
  if (!r) return;
  state.done = Math.max(0, state.done - 1); if (r.spot) state.spots = Math.max(0, state.spots - 1); refreshCounts();
  if (r.panoid != null) state.doneKeys.delete(r.panoid + "|" + r.heading);   // let it re-show so we can re-label
  const qi = state.queue.findIndex((q) => q.panoid === r.panoid), di = CFG.DIRS.indexOf(r.heading);
  if (qi >= 0 && di >= 0) setPos(qi * NDIR + di); else setPos(Math.max(0, posLin() - 1));
  loadView();
}

function exportLabels() {
  const a = JSON.parse(localStorage.getItem("sl.log") || "[]");
  if (!a.length) { toast("Nothing to export yet.", "bad"); return; }
  const blob = new Blob([JSON.stringify(a)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url; el.download = `spotlabels_${state.user}_${a.length}.json`;
  document.body.appendChild(el); el.click(); el.remove(); URL.revokeObjectURL(url);
  toast(`Exported ${a.length} labels — send me the file!`, "good");
}

function queuePending(rec) { const k = "sl.pending", a = JSON.parse(localStorage.getItem(k) || "[]"); a.push(rec); localStorage.setItem(k, JSON.stringify(a)); }
window.addEventListener("load", async () => {
  const k = "sl.pending"; let a = JSON.parse(localStorage.getItem(k) || "[]"); if (!a.length) return;
  const keep = [];
  for (const rec of a) { try { await fetch(SUBMIT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }); } catch { keep.push(rec); } }
  localStorage.setItem(k, JSON.stringify(keep));
});

// ---- utils -----------------------------------------------------------
let toastT = null;
function toast(msg, kind) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (kind ? " " + kind : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1200); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
