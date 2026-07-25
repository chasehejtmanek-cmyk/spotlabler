#!/usr/bin/env python3
# Pull labels from the deployed labeler and reconstruct training crops.
#   python3 pull_labels.py https://YOUR-SITE.netlify.app ursa-spots-2026
import sys, os, io, json, time, urllib.request, urllib.parse
try:
    from PIL import Image
except Exception:
    Image = None

ROOT = os.path.dirname(os.path.abspath(__file__))
HDR = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/126 Safari/537.36",
       "Referer": "https://www.google.com/maps/"}

def thumb(pid, yaw, fov, w, h, pitch=0):
    u = (f"https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid={pid}"
         f"&cb_client=apiv3&w={w}&h={h}&yaw={yaw}&pitch={pitch}&thumbfov={fov}")
    r = urllib.request.urlopen(urllib.request.Request(u, headers=HDR), timeout=20).read()
    return Image.open(io.BytesIO(r)).convert("RGB")

def main():
    if len(sys.argv) < 3:
        print("usage: pull_labels.py <site-url> <secret-key>"); return
    site, key = sys.argv[1].rstrip("/"), sys.argv[2]
    url = f"{site}/.netlify/functions/labels?k={urllib.parse.quote(key)}"
    recs = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60))
    json.dump(recs, open(os.path.join(ROOT, "labels.json"), "w"))
    spots = [r for r in recs if r.get("spot")]
    print(f"{len(recs)} labels · {len(spots)} spots · "
          f"{sum(len(r.get('boxes',[])) for r in spots)} boxes")

    if Image is None:
        print("Pillow not installed — labels.json saved, skipping crops."); return
    posd = os.path.join(ROOT, "crops", "pos"); negd = os.path.join(ROOT, "crops", "neg")
    os.makedirs(posd, exist_ok=True); os.makedirs(negd, exist_ok=True)
    npos = nneg = 0
    for i, r in enumerate(recs):
        pid = r["panoid"]
        boxed_yaws = []
        # positive crops: one per box, centered on the box, fov = box width
        for j, b in enumerate(r.get("boxes", [])):
            yc = ((b["yaw0"] + b["yaw1"]) / 2) % 360
            fov = max(18, min(90, b["yaw1"] - b["yaw0"]))
            pc = (b.get("pitch0", 0) + b.get("pitch1", 0)) / 2
            boxed_yaws.append(yc)
            try:
                im = thumb(pid, yc, round(fov, 1), 384, 384, pitch=round(pc, 1))
                im.save(os.path.join(posd, f"{pid}_{j}.jpg"), quality=88); npos += 1
            except Exception as e:
                print("  pos fail", pid, e)
            time.sleep(0.03)
        # same-pano negatives: headings >45° away from every boxed spot
        if r.get("spot") or r.get("skip"):
            cand = [h for h in range(0, 360, 45)
                    if all(min(abs(h - y), 360 - abs(h - y)) > 45 for y in boxed_yaws)]
        else:
            cand = list(range(0, 360, 90))   # clean "no spot" pano -> all headings negative
        for h in cand:
            try:
                im = thumb(pid, h, 45, 384, 384); im.save(os.path.join(negd, f"{pid}_{h}.jpg"), quality=88); nneg += 1
            except Exception as e:
                print("  neg fail", pid, e)
            time.sleep(0.03)
        if (i + 1) % 25 == 0: print(f"  {i+1}/{len(recs)} panos …")
    print(f"done: {npos} positive crops, {nneg} negative crops -> crops/")

if __name__ == "__main__":
    main()
