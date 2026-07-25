# Spot-or-Not — parkour spot labeler

A standalone site for crowd-labeling parkour spots in Street View. Friends open a
link, scroll a 360° pano, and box any spot (or hit "No spot"). Labels auto-collect
into one bucket. Positives become tight crops; unboxed regions of the same pano
become clean same-domain negatives.

## Files
- `index.html`, `app.js`, `style.css` — the labeler (static).
- `spots-queue.json` — NYC-first ordered spots with resolved Street View pano IDs.
- `netlify/functions/submit.mjs` — receives one label, appends to Netlify Blobs.
- `netlify/functions/labels.mjs` — read back all labels (secret-gated).
- `pull_labels.py` — download labels + reconstruct training crops.

## Deploy (separate Netlify site)
1. Push this folder to its own Git repo (GitHub).
2. Netlify → **Add new site → Import from Git** → pick the repo.
3. Build settings: **leave build command empty**, publish dir `.` (netlify.toml
   already sets this). Netlify installs `@netlify/blobs` and bundles the functions
   automatically in the cloud.
4. Deploy. Share the site URL in the groupchat. That's it — Blobs needs no setup.

Optional: set env var `LABELS_KEY` to your own secret (Site config → Environment).

## Reading labels back
    https://YOUR-SITE.netlify.app/.netlify/functions/labels?k=ursa-spots-2026
Add `&stat=1` for just counts / per-user tallies. (Change the key in labels.mjs or
via LABELS_KEY.)

## Pulling + building training data
    python3 pull_labels.py https://YOUR-SITE.netlify.app ursa-spots-2026
Writes `labels.json`, and `crops/pos/*.jpg` (boxed spots) + `crops/neg/*.jpg`
(unboxed headings of the same panos) for retraining the classifier.

## Notes
- Queue is NYC-first, expanding outward by distance. Re-run `bake_queue.py` with a
  bigger `N` to extend it.
- Each label is stored with the labeler's handle, so you can weight by rater or
  measure agreement on panos multiple people saw.
