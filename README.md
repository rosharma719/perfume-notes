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

- **Explore**: select notes; related ones take their family colour, unrelated go gray. Pairings + Fragrances panel.
- **For me**: *Taste* (love/avoid notes and families, audience), *Collection* (what you own, gaps and overlaps), *Shop*
  (ranked suggestions that favour loved notes and gaps, avoid near-copies, and show rating, price, season). Saved in the
  browser (localStorage, persistent storage requested). Saved perfumes are re-matched when the catalog is rebuilt, and any
  that can't be matched are kept and listed. Back up with a file or a link that carries the profile to another device.
- **Buy**: Prices (decant EUR/ml), Dupes (original vs dupe, with note overlap), Trending (what Europe buys).
- **Insights**: Pairs, Trios, Stand-ins, Avoided, Trends, Formula size, Audience (from the original 26k sample).
- **Styles**: Families, Regions, Houses, By year. **About**: definitions and sources.

Each section has its own accent colour, and every perfume is drawn with a profile bar: the mix of its note families in the
family colours (rarer notes weigh more, so Musk doesn't colour everything), an edge in its dominant family, and a short caption.

The URL hash keeps the view and selection, so views are shareable.
