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

Ten tabs (sticky bar, scrolls sideways on phones; the URL hash keeps tab + selection so views are shareable):
- **Explore**: periodic table of notes. Tap a note and related notes light up in their family colour while unrelated ones go gray
  (colour is relative to the other notes for that selection). Side panel / bottom sheet with Pairings, and Fragrances
  (filter by name, audience, sort, near-matches, *Find similar*, CSV download). "Look up a perfume" works without selecting notes.
- **Odd couples, Stand-ins, Trios, Never together**: filterable lists; rows jump to the matching fragrances.
- **Trends, Houses** (browse a house's fragrances), **Formula size, His & hers, About**.

Regenerate its data with `python3 build_site.py` (needs `numpy`; writes `site/data.js`).
