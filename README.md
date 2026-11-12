# Perfume notes

Graph of fragrance notes, where two notes are linked by the perfumes that contain both.

**Source caveat:** fragrantica.com is behind a Cloudflare bot challenge, so it was not scraped.
The data is the public Hugging Face dataset [`doevent/perfume`](https://huggingface.co/datasets/doevent/perfume)
(MIT, ~26k perfumes, 2024 snapshot). It is not guaranteed to be a Fragrantica export.

Run: `python3 build_graph.py` (needs `networkx`; downloads the CSV into `raw/`).

Outputs in `output/`:
- `note_graph.html` – interactive graph (strong pairs only; click notes/edges for example perfumes)
- `note_graph.graphml` – full graph for Gephi/Cytoscape (nodes: perfumes, family, Louvain cluster; edges: weight, PMI)
- `edges_with_perfumes.jsonl.gz` – every edge with the full list of connecting perfume ids (join to `perfumes.csv`)
- `nodes.csv`, `perfumes.csv`, `note_dedupe_map.csv` (raw note -> canonical note -> family)

Dedupe: 394 raw note strings -> 153 canonical notes (origins stripped: `Jasmine (Egypt)` -> Jasmine;
aroma-chemicals folded into parent: `Galaxolide (Musk)` -> Musk; synonyms merged: `Rose Damascena` -> Rose).
Clustering: 12 hand-curated families plus data-driven Louvain communities on positive-PMI edges.

## Data

`python3 build_site.py` builds `site/data.js` from several open datasets (see `catalog.py` and the About tab for licenses and dates).
Run `python3 build_site.py --refresh` to re-download every source first. Needs `numpy`.

The catalog is de-duplicated (`catalog.py`): names are reduced to their distinguishing words, brand spellings that share products are
unified, and entries merge when the name matches in compatible years. New notes seen often in the newer sources are added to the
vocabulary and placed in a family by co-occurrence (`FAMILY_FIX` holds hand corrections).

| Source | Gives | As of |
|---|---|---|
| doevent/perfume (MIT) | 26k perfumes: notes, audience, family, country | 2024 |
| junyeong-nero/perfume-dataset (license not stated) | 42k Parfumo perfumes: ratings, top/heart/base | 2024 |
| scento/perfume-database (CC-BY) | current popular perfumes: pyramid, seasons, time of day | Oct 2026 |
| 10ml price-per-ml index and dupe prices (CC-BY) | decant prices, original vs dupe | Sep-Oct 2026 |
| scento/fragrance-index (CC-BY) | what Europe buys in decants | to Sep 2026 |

The note catalog itself stops around 2024; prices, demand and the Scento list are current. The Parfumo dataset has no stated license:
drop the `parfumo` source in `catalog.py` if that matters for how you use this.

## Site

`site/` is a static page, no build step: open `site/index.html` or serve the folder (Archivo is self-hosted in `site/fonts`).
Deploy on Vercel with Root Directory `site`, Framework "Other", no build command.

Four tabs, ordered by what people want to do (the URL hash keeps view + selection; old links still work):
- **Find** (home): "I love a perfume" or "I like certain scents" -> similar perfumes / perfumes with those scents, with plain reasons
  (shared notes, what differs, accords like fresh/spicy/woody). Opens on a live example so the output is visible immediately.
  Similarity = rarity-weighted note overlap blended with accord agreement, nudged toward well-reviewed perfumes.
- **My shelf**: *Taste* (love/avoid notes and families), *Collection* (what you own: gaps and overlaps), *Picks* (ranked suggestions).
  Saved in the browser; re-matched when the catalog changes; back up with a file or a link.
- **Note map**: the colour-coded note grid. Select notes and related ones light up; open Fragrances for real perfumes.
- **Insights**: Combinations (go together, trios, swaps, never together), Notes (trends, simple vs complex, men's vs women's),
  Styles (families, countries, houses, by year).

Each perfume is drawn with a profile bar (mix of note families), plain-word accords, rating, and its top/heart/base notes.
