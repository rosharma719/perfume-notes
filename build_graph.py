#!/usr/bin/env python3
"""Build a note <-> note graph (linked by the perfumes that share them).

Source: the public Hugging Face dataset `doevent/perfume` (26k perfumes with
note lists). fragrantica.com itself is behind a Cloudflare bot challenge, so it
is not scraped directly.

Pipeline
  1. load perfumes, parse note lists
  2. dedupe raw note strings -> canonical notes   (normalise_note)
  3. group canonical notes -> curated families    (FAMILY)
  4. build co-occurrence graph, weights = #shared perfumes, plus PMI/lift
  5. data-driven Louvain communities on the PMI-weighted graph
  6. write CSV / JSON / GraphML / interactive HTML

Usage: python3 build_graph.py [--raw DIR] [--out DIR]
"""
import argparse, ast, csv, gzip, itertools, json, os, re, urllib.request
from collections import Counter, defaultdict
from math import log

import networkx as nx

DATA_URL = "https://huggingface.co/datasets/doevent/perfume/resolve/main/perfumes.csv"

# ---------------------------------------------------------------- dedupe rules
# Parenthetical that names the *parent note* of an aroma-chemical/variant.
# "Galaxolide (Musk)" -> Musk. Any other parenthetical is an origin/variety
# ("Jasmine (Egypt)", "Vanilla (Bourbon)") and is simply dropped.
PAREN_PARENT = {
    "musk": "Musk", "woody musky": "Cashmere Wood", "ambergris": "Ambergris",
    "sandalwood": "Sandalwood", "cedarwood": "Cedarwood", "cedarwood note": "Cedarwood",
    "marine": "Marine", "lily of the valley": "Lily Of The Valley",
    "fruity notes": "Fruity Notes", "fruity note": "Fruity Notes",
    "floral note": "Floral Notes", "floral notes": "Floral Notes",
    "woody note": "Woody Notes", "green note": "Green Notes",
    "light jasmine": "Jasmine", "tonka bean note": "Tonka Bean",
    "vanilla note": "Vanilla", "saffron": "Saffron", "ylang-ylang": "Ylang-ylang",
    "heliotrope": "Heliotrope", "aldehyde": "Aldehyde", "animal note": "Animalic Notes",
    "suede note": "Suede", "melon note": "Melon", "praline": "Praline",
    "turmeric": "Turmeric", "plum": "Plum", "jalapeno": "Chili Pepper",
    "finger": "Lime",
}

# Exact-synonym merges applied after the parenthetical step.
SYNONYM = {
    "Dry Amber": "Amber", "Salty Amber": "Amber", "Ambre 83 de Laire": "Amber",
    "Arum Lily": "Lily", "Crinum Lily": "Lily",
    "Rose Centifolia": "Rose", "Rose Damascena": "Rose", "Rose Water": "Rose",
    "Night Blooming Jasmine": "Jasmine",
    "Incense / Olibanum": "Incense", "Iris / Orris": "Iris", "Oud / Agarwood": "Oud",
    "Citruses": "Citrus", "Lemon Zest": "Lemon", "Limequat": "Lime",
    "Bitter Orange": "Orange", "Mandarin Orange Blossom": "Orange Blossom",
    "Tangerine": "Mandarin", "Clementine": "Mandarin", "Green of Tangerine": "Mandarin",
    "Pepper": "Black Pepper", "Hot Pepper": "Chili Pepper", "Chilipepper": "Chili Pepper",
    "Red Chili": "Chili Pepper",
    "Peppermint": "Mint", "Spearmint": "Mint", "Citrata Mint": "Mint",
    "Green Tea": "Tea", "Oolong Tea": "Tea", "Genmai-Cha Tea Accord": "Tea",
    "Gardenia Leaves": "Gardenia", "Tobacco Accord": "Tobacco", "Tobacco Leaf": "Tobacco",
    "Tonkin Musk": "Musk", "Musk Ambrette": "Musk",
    "Sea Breeze": "Marine", "Sea Water": "Marine", "Ozonic Notes": "Marine",
    "Birch Tar": "Birch", "Red Apple": "Apple", "Green Apple": "Apple",
    "Red Ginger": "Ginger", "Fresh Spices": "Spices", "Hot Spices": "Spices",
    "Spicy Notes": "Spices", "Cotton Candy": "Candy", "Salty Caramel": "Caramel",
    "Cashmere Wood": "Cashmere Wood", "Curcuma": "Turmeric", "Mirabelle": "Plum",
    "Prunella": "Plum", "Prunol": "Plum", "Balsam": "Balsam Of Peru",
    "Lavandin": "Lavender", "Cypriol / Nagarmota": "Cypriol",
    "Fougère accord": "Fougère Accord", "Mate": "Maté",
}

# Aroma-chemical brand names with no parenthetical in the data -> parent note.
CHEMICAL = {"Sclarene": "Ambergris", "Mahonial": "Aldehyde", "Massoia": "Coconut"}

# ------------------------------------------------------------- curated families
FAMILY = {
 "Citrus": "Bergamot Lemon Lime Mandarin Orange Grapefruit Yuzu Citrus Petitgrain Neroli Caviar",
 "White Floral": "Jasmine Orange Blossom Tuberose Gardenia Ylang-ylang Magnolia Tiare Narcissus Honeysuckle Osmanthus Lily Hyacinth Mimosa Freesia Lily Of The Valley Orchid",
 "Rose & Garden Floral": "Rose Peony Geranium Carnation Violet Iris Heliotrope Lotus Sweet Pea Everlasting Flower Hellabore Flower Nerium Oleander Floral Notes Violet Leaves",
 "Woody": "Sandalwood Cedarwood Vetiver Patchouli Guaiac Wood Kingwood Queenwood Palisander Rosewood Palo Santo Woody Notes Cashmere Wood Birch Bamboo Cypriol Oud",
 "Amber & Resin": "Amber Ambergris Benzoin Labdanum Ciste Labdanum Incense Myrrh Opoponax Elemi Balsam Of Peru Galbanum Lentisk",
 "Musk & Animal": "Musk Ambrette Seed Civet Castoreum Animalic Notes Leather Suede Beeswax Hay",
 "Sweet & Gourmand": "Vanilla Tonka Bean Caramel Toffee Praline Candy Cocoa Coffee Rum White Sugared Almond Gourmand Accord Champagne Massoia Coconut Marshmallow",
 "Fruity": "Peach Pear Apple Plum Apricot Cherry Raspberry Strawberry Blackberry Cranberry Blackcurrant Bud Fig Mango Pineapple Passion Fruit Lychee Melon Rhubarb Guarana Fruity Notes",
 "Spicy": "Black Pepper Pink Pepper Chili Pepper Cardamom Cinnamon Clove Nutmeg Ginger Saffron Coriander Anise Star Anise Spices Turmeric Pimento Leaves Marjoram Buaya Laos",
 "Green & Herbal": "Lavender Clary Sage Rosemary Thyme Tarragon Mint Basil Artemisia Angelica Juniper Berries Bay Green Notes Fresh Cut Grass Ivy Tea Maté Dew Drop Aromatic Notes Fougère Accord Cologne Accord Chypre Accord Kyphi Accord",
 "Aquatic & Aldehydic": "Marine Aquaflora Aldehyde",
 "Earthy & Mossy": "Oakmoss Tobacco Truffle White Truffle Ink Gunpowder Sclarene",
}
FAMILY_OF = {}


def _build_family_lookup(notes):
    """Assign each canonical note to the family whose word list contains its
    full name (multi-word names are matched against the joined word list)."""
    for note in notes:
        for fam, words in FAMILY.items():
            padded = f" {words} "
            if f" {note} " in padded:
                FAMILY_OF[note] = fam
                break
        else:
            # fall back: any family where a whole word of the note matches
            toks = note.split()
            for fam, words in FAMILY.items():
                if any(f" {t} " in f" {words} " for t in toks):
                    FAMILY_OF[note] = fam
                    break
            else:
                FAMILY_OF[note] = "Other"


def normalise_note(raw):
    s = re.sub(r"\s+", " ", raw.strip())
    m = re.match(r"^(.*?)\s*\(\s*(.*?)\s*\)$", s)
    if m:
        base, paren = m.group(1).strip(), m.group(2).strip().lower()
        s = PAREN_PARENT.get(paren, base)   # chemical -> parent note, else drop origin tag
    s = SYNONYM.get(s, s)
    s = CHEMICAL.get(s, s)
    return SYNONYM.get(s, s)


# ------------------------------------------------------------------- pipeline
def load(raw_dir):
    os.makedirs(raw_dir, exist_ok=True)
    path = os.path.join(raw_dir, "perfumes.csv")
    if not os.path.exists(path):
        print("downloading", DATA_URL)
        urllib.request.urlretrieve(DATA_URL, path)
    csv.field_size_limit(10 ** 9)
    seen, rows = set(), []
    for r in csv.DictReader(open(path, encoding="utf-8"), delimiter="|"):
        key = (r["brand"].strip().lower(), r["name_perfume"].strip().lower(), r["years"])
        if key in seen:
            continue
        seen.add(key)
        try:
            notes = ast.literal_eval(r["ingredients"])
        except Exception:
            continue
        canon = sorted({normalise_note(n) for n in notes})
        if canon:
            rows.append({"id": len(rows), "brand": r["brand"].strip(),
                         "name": r["name_perfume"].strip(), "year": r["years"], "gender": r["gender"],
                         "notes": canon, "raw_notes": notes})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--out", default="output")
    ap.add_argument("--min-edge", type=int, default=3, help="min shared perfumes for an edge")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    rows = load(a.raw)
    N = len(rows)
    freq = Counter(n for r in rows for n in r["notes"])
    _build_family_lookup(freq)
    raw_vocab = {n for r in rows for n in r["raw_notes"]}
    print(f"{N} perfumes | {len(raw_vocab)} raw note strings -> {len(freq)} canonical notes")

    # ---- co-occurrence
    pair_perfumes = defaultdict(list)
    for r in rows:
        for a_, b_ in itertools.combinations(r["notes"], 2):
            pair_perfumes[(a_, b_)].append(r["id"])

    G = nx.Graph()
    for n, c in freq.items():
        G.add_node(n, perfumes=c, family=FAMILY_OF[n])
    for (u, v), ids in pair_perfumes.items():
        w = len(ids)
        if w < a.min_edge:
            continue
        pmi = log((w / N) / ((freq[u] / N) * (freq[v] / N)))
        G.add_edge(u, v, weight=w, pmi=round(pmi, 3))

    # ---- data-driven communities (Louvain) on positive-PMI edges
    P = nx.Graph()
    P.add_nodes_from(G.nodes)
    for u, v, d in G.edges(data=True):
        if d["pmi"] > 0:
            P.add_edge(u, v, weight=d["pmi"] * (1 + log(d["weight"])))
    comms = nx.community.louvain_communities(P, weight="weight", resolution=1.0, seed=7)
    comms = sorted(comms, key=lambda c: -sum(freq[n] for n in c))
    cluster_of = {n: i for i, c in enumerate(comms) for n in c}
    for n in G.nodes:
        G.nodes[n]["cluster"] = cluster_of[n]

    # ---- outputs
    # dedupe map
    with open(f"{a.out}/note_dedupe_map.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["raw_note", "canonical_note", "family"])
        for raw in sorted(raw_vocab):
            c = normalise_note(raw); w.writerow([raw, c, FAMILY_OF.get(c, "Other")])
    with open(f"{a.out}/nodes.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["note", "perfumes", "family", "louvain_cluster"])
        for n, d in sorted(G.nodes(data=True), key=lambda x: -x[1]["perfumes"]):
            w.writerow([n, d["perfumes"], d["family"], d["cluster"]])
    with open(f"{a.out}/perfumes.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["id", "brand", "name", "year", "notes"])
        for r in rows:
            w.writerow([r["id"], r["brand"], r["name"], r["year"], "; ".join(r["notes"])])
    # edges with FULL perfume id lists (join to perfumes.csv on id)
    with gzip.open(f"{a.out}/edges_with_perfumes.jsonl.gz", "wt") as f:
        for u, v, d in sorted(G.edges(data=True), key=lambda e: -e[2]["weight"]):
            f.write(json.dumps({"source": u, "target": v, "weight": d["weight"], "pmi": d["pmi"],
                                "perfume_ids": pair_perfumes[tuple(sorted((u, v)))]
                                if tuple(sorted((u, v))) in pair_perfumes else pair_perfumes[(v, u)]}) + "\n")
    nx.write_graphml(G, f"{a.out}/note_graph.graphml")

    # HTML: strongest edges only, 12 example perfumes per edge
    pid = {r["id"]: f'{r["name"]} ({r["brand"]})' for r in rows}
    keep = [(u, v, d) for u, v, d in G.edges(data=True) if d["weight"] >= 40 and d["pmi"] > 0.3]
    nodes_in = {x for u, v, _ in keep for x in (u, v)}
    def examples(u, v):
        ids = pair_perfumes.get((u, v)) or pair_perfumes.get((v, u))
        return [pid[i] for i in ids[:12]]
    web = {
        "families": list(FAMILY) + ["Other"],
        "nodes": [{"id": n, "count": G.nodes[n]["perfumes"], "family": G.nodes[n]["family"],
                   "cluster": G.nodes[n]["cluster"]} for n in nodes_in],
        "links": [{"source": u, "target": v, "weight": d["weight"], "pmi": d["pmi"],
                   "examples": examples(u, v)} for u, v, d in keep],
    }
    here = os.path.dirname(os.path.abspath(__file__))
    tpl = open(os.path.join(here, "graph_template.html"), encoding="utf-8").read()
    open(f"{a.out}/note_graph.html", "w", encoding="utf-8").write(
        tpl.replace("__DATA__", json.dumps(web, ensure_ascii=False)))

    # summary
    print(f"graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges "
          f"(>= {a.min_edge} shared perfumes); html shows {len(web['nodes'])} nodes / {len(web['links'])} edges")
    for i, c in enumerate(comms[:12]):
        top = sorted(c, key=lambda n: -freq[n])[:10]
        print(f"cluster {i} ({len(c)} notes): {', '.join(top)}")
    print("Other:", sorted(n for n in freq if FAMILY_OF[n] == "Other"))


if __name__ == "__main__":
    main()
