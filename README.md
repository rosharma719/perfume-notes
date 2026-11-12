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

## Site

`site/` is a static page, no build step: open `site/index.html` or serve the folder (Archivo is self-hosted in `site/fonts`).
Deploy on Vercel with Root Directory `site`, Framework "Other", no build command.

Two-level navigation (the URL hash keeps view + selection, so views are shareable):
- **Explore**: notes grouped by family. Select notes; related ones take their family colour, unrelated go gray. Side panel
  (bottom sheet on phones): Pairings, and Fragrances (filter by name, audience, olfactive family, country; sort; near-matches;
  Similar; CSV; copy link). "Browse perfumes" works without notes. `/` focuses note search.
- **Combos**: Pairs, Trios, Stand-ins, Avoided. **Notes**: Trends, Formula size, Audience.
- **Styles**: Families (classic fragrance wheel + subfamilies), Regions, Houses - signature notes, audience mix, share-of-releases trend.
- **Market**: releases, audience mix and formula size by year. **About**: definitions and caveats.

All tables are sortable and filterable; rows jump to the matching fragrances.

Regenerate its data with `python3 build_site.py` (needs `numpy`; writes `site/data.js`).
