#!/usr/bin/env python3
"""Merge several open perfume datasets into one catalog + buying feeds.

Sources (all on Hugging Face):
  main      doevent/perfume                     MIT        26k perfumes, notes, audience, family, country (2024)
  parfumo   junyeong-nero/perfume-dataset       UNKNOWN    42k perfumes, pyramids, ratings (Parfumo crawl, 2024)
  scento    scento/perfume-database             CC-BY-4.0  1.5k current perfumes: pyramid, seasons, times (Oct 2026)
  prices    10ml/perfume-price-per-ml-index     CC-BY-4.0  decant price per ml, ~1,100 perfumes (Sep-Oct 2026)
  bottles   10ml/perfume-price-per-ml-index     CC-BY-4.0  full-bottle reference prices
  dupes     10ml/perfume-dupe-prices            CC-BY-4.0  original vs dupe, EU price per ml (Oct 2026)
  demand    scento/fragrance-index              CC-BY-4.0  what Europe buys in decants (Oct 2025 - Sep 2026)

Run via build_site.py (use --refresh to re-download everything).
"""
import csv, json, os, re, unicodedata, urllib.request
from collections import defaultdict

HF = "https://huggingface.co/datasets/"
SOURCES = {
    "parfumo": (HF + "junyeong-nero/perfume-dataset/resolve/main/data.jsonl", "parfumo.jsonl"),
    "scento": (HF + "scento/perfume-database/resolve/main/perfumes.csv", "scento_perfumes.csv"),
    "prices": (HF + "10ml/perfume-price-per-ml-index/resolve/main/price-per-ml-index.csv", "price_per_ml.csv"),
    "bottles": (HF + "10ml/perfume-price-per-ml-index/resolve/main/full-bottle-reference-2026-09.csv", "full_bottle.csv"),
    "dupes": (HF + "10ml/perfume-dupe-prices/resolve/main/dupe-price-gap-2026-10.csv", "dupes.csv"),
    "demand": (HF + "scento/fragrance-index/resolve/main/scento-fragrance-index.csv", "demand.csv"),
}
SOURCE_INFO = [
    {"name": "doevent/perfume", "license": "MIT", "data": "26k perfumes: notes, audience, family, country", "as_of": "2024", "url": "https://huggingface.co/datasets/doevent/perfume"},
    {"name": "junyeong-nero/perfume-dataset", "license": "not stated", "data": "42k perfumes (Parfumo): note pyramids, ratings", "as_of": "2024", "url": "https://huggingface.co/datasets/junyeong-nero/perfume-dataset"},
    {"name": "scento/perfume-database", "license": "CC-BY-4.0", "data": "1.5k popular perfumes: pyramids, seasons, time of day", "as_of": "Oct 2026", "url": "https://huggingface.co/datasets/scento/perfume-database"},
    {"name": "10ml/perfume-price-per-ml-index", "license": "CC-BY-4.0", "data": "Decant price per ml for ~1,100 perfumes", "as_of": "Sep-Oct 2026", "url": "https://huggingface.co/datasets/10ml/perfume-price-per-ml-index"},
    {"name": "10ml/perfume-dupe-prices", "license": "CC-BY-4.0", "data": "267 original vs dupe price pairs", "as_of": "Oct 2026", "url": "https://huggingface.co/datasets/10ml/perfume-dupe-prices"},
    {"name": "scento/fragrance-index", "license": "CC-BY-4.0", "data": "What Europe buys in decants", "as_of": "Oct 2025 - Sep 2026", "url": "https://huggingface.co/datasets/scento/fragrance-index"},
]


def fetch(raw_dir, refresh=False):
    os.makedirs(raw_dir, exist_ok=True)
    paths = {}
    for key, (url, fn) in SOURCES.items():
        p = os.path.join(raw_dir, fn); paths[key] = p
        if refresh or not os.path.exists(p):
            print("downloading", key)
            urllib.request.urlretrieve(url, p)
    return paths


# ------------------------------------------------------------------ matching
_DROP = re.compile(r"\b(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|extrait|parfum|edp|edt|cologne|intense|pour homme|pour femme|for men|for women|the)\b")
_BRAND_DROP = re.compile(r"\b(parfums|parfum|perfumes|perfume|fragrances|fragrance|paris|london|maison|house of|prives|prive|de|di|by|the|co|and|eau)\b")
_ALIAS = {"ysl": "yvessaintlaurent", "dg": "dolcegabbana", "ck": "calvinklein"}


def _ascii(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().replace("&", " and ")


def nname(s):
    return re.sub(r"[^a-z0-9]", "", _DROP.sub(" ", _ascii(s)))


def nbrand(s):
    b = re.sub(r"[^a-z0-9]", "", _BRAND_DROP.sub(" ", _ascii(s)))
    return _ALIAS.get(b, b)


def key(brand, name):
    return (nbrand(brand), nname(name))


# ------------------------------------------------------------------ note mapping
EXTRA_SYN = {
    "mandarin orange": "Mandarin", "cedar": "Cedarwood", "frankincense": "Incense", "olibanum": "Incense",
    "blackcurrant": "Blackcurrant Bud", "cassis": "Blackcurrant Bud", "labdanum": "Ciste Labdanum", "cistus": "Ciste Labdanum",
    "moss": "Oakmoss", "tree moss": "Oakmoss", "gaiac wood": "Guaiac Wood", "gaiacwood": "Guaiac Wood", "aldehydes": "Aldehyde",
    "woods": "Woody Notes", "wood": "Woody Notes", "sage": "Clary Sage", "citrus notes": "Citrus", "citrus fruits": "Citrus",
    "orris root": "Iris", "orris": "Iris", "juniper berry": "Juniper Berries", "juniper": "Juniper Berries",
    "cashmeran": "Cashmere Wood", "ambroxan": "Ambergris", "ambrox": "Ambergris", "amberwood": "Amber", "elemi resin": "Elemi",
    "praliné": "Praline", "aniseed": "Anise", "violet leaf": "Violet Leaves", "marine notes": "Marine", "aquatic notes": "Marine",
    "sea notes": "Marine", "sea water": "Marine", "white musk": "Musk", "musks": "Musk", "peppercorn": "Black Pepper",
    "ylang ylang": "Ylang-ylang", "ylang-ylang": "Ylang-ylang", "muguet": "Lily Of The Valley", "sandal": "Sandalwood",
    "agarwood": "Oud", "chocolate": "Cocoa", "cacao": "Cocoa", "tonka": "Tonka Bean", "grapefruit zest": "Grapefruit",
    "green tea": "Tea", "black tea": "Tea", "white tea": "Tea", "iso e super": "Cedarwood", "ambergris": "Ambergris",
    "pimento": "Pimento Leaves", "cardamon": "Cardamom", "cinnamon bark": "Cinnamon", "spices": "Spices", "spicy notes": "Spices",
    "fruity": "Fruity Notes", "floral": "Floral Notes", "white flowers": "Floral Notes", "white florals": "Floral Notes",
    "woody": "Woody Notes", "citrus": "Citrus", "amber notes": "Amber", "musk notes": "Musk", "powdery notes": "Aldehyde",
}


class NoteMap:
    def __init__(self, canon_names, normalise):
        self.v = {n.lower(): n for n in canon_names}
        self.by_len = sorted(self.v, key=lambda s: -len(s))
        self.normalise = normalise
        self.cache = {}

    def __call__(self, raw):
        if raw in self.cache:
            return self.cache[raw]
        out = self._map(raw)
        self.cache[raw] = out
        return out

    def _map(self, raw):
        s = self.normalise(raw)
        low = re.sub(r"\s+", " ", s.lower().strip())
        if low in self.v: return self.v[low]
        if low in EXTRA_SYN:
            t = EXTRA_SYN[low].lower()
            return self.v.get(t)
        for v in self.by_len:
            if len(v) >= 3 and (low.endswith(" " + v) or low.startswith(v + " ")):
                return self.v[v]
        return None


# ------------------------------------------------------------------ loaders
def read_csv(path, **kw):
    csv.field_size_limit(10 ** 9)
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, **kw))


def split(s):
    return [x.strip() for x in (s or "").split(";") if x.strip()]


def build(main_rows, notemap, paths, notes_index):
    """Return (catalog rows, priced, dupes, demand, stats).

    main_rows: rows from build_graph.load (already canonical notes).
    notes_index: {canonical note -> index} for the final vocabulary.
    """
    cat, order = {}, []

    def idxs(names):
        return sorted({notes_index[n] for n in names if n in notes_index})

    def slot(k):
        if k not in cat:
            cat[k] = {"k": k, "brand": "", "name": "", "year": 0, "gender": -1, "family": "", "origin": "",
                      "ids": [], "pyr": None, "rating": 0, "reviews": 0, "src": set(), "meta": None, "rank": 0}
            order.append(k)
        return cat[k]

    GEN = {"Male": 0, "Female": 1, "Unisex": 2}
    for r in main_rows:
        k = key(r["brand"], r["name"])
        c = slot(k)
        ids = idxs(r["notes"])
        if len(ids) > len(c["ids"]):
            c.update(brand=r["brand"], name=r["name"], ids=ids, gender=GEN.get(r["gender"], -1),
                     family=r.get("family", ""), origin=r.get("origin", ""))
            try: c["year"] = int(r["year"])
            except ValueError: pass
        c["src"].add("main")

    def pyramid(top, mid, base):
        parts = [idxs([n for n in map(notemap, sec or []) if n]) for sec in (top, mid, base)]
        return parts if any(parts) else None

    # parfumo: ratings + pyramids; adds perfumes that have >= 3 recognised notes
    n_new_p = 0
    for line in open(paths["parfumo"], encoding="utf-8"):
        r = json.loads(line)
        if not r.get("brand_name") or not r.get("perfume_name"): continue
        k = key(r["brand_name"], r["perfume_name"])
        pyr = pyramid(r.get("top_notes"), r.get("middle_notes"), r.get("base_notes"))
        allids = sorted({i for p in (pyr or []) for i in p})
        if k not in cat and len(allids) < 3: continue
        c = slot(k)
        if not c["name"]:
            c.update(brand=r["brand_name"], name=r["perfume_name"], ids=allids, year=r.get("release_year") or 0)
            n_new_p += 1
        c["src"].add("parfumo")
        if pyr and not c["pyr"]: c["pyr"] = pyr
        if not c["year"] and r.get("release_year"): c["year"] = r["release_year"]
        rv = r.get("review_count") or 0
        if r.get("rating") and rv >= c["reviews"]:
            c["rating"], c["reviews"] = r["rating"], rv

    # scento: current perfumes, with seasons / time of day / popularity
    n_new_s = 0
    for r in read_csv(paths["scento"]):
        k = key(r["house"], r["name"])
        pyr = pyramid(split(r["top_notes"]), split(r["heart_notes"]), split(r["base_notes"]))
        allids = sorted({i for p in (pyr or []) for i in p})
        if k not in cat and len(allids) < 3: continue
        c = slot(k)
        if not c["name"]:
            c.update(brand=r["house"], name=r["name"], ids=allids, year=int(r["year"]) if (r.get("year") or "").isdigit() else 0)
            n_new_s += 1
        c["src"].add("scento")
        if pyr: c["pyr"] = pyr
        c["meta"] = [r.get("seasons", ""), r.get("times_of_day", ""), r.get("character", "")]
        try: c["rank"] = int(r["popularity_rank"])
        except (ValueError, KeyError): pass

    rows = [cat[k] for k in order if cat[k]["name"] and len(cat[k]["ids"]) >= 2]
    where = {r["k"]: i for i, r in enumerate(rows)}

    # ---------------- prices
    priced = {}
    for r in read_csv(paths["prices"]):
        k = key(r["house"], r["perfume"])
        e = priced.setdefault(k, {"house": r["house"], "name": r["perfume"], "tier": r["tier"], "p": {}, "m": {},
                                  "slug": r["url"].rsplit("/", 1)[-1] if r.get("url") else ""})
        e["p"][r["size_ml"]] = float(r["price_eur"]); e["m"][r["size_ml"]] = float(r["price_per_ml_eur"])
    bottles = {}
    for r in read_csv(paths["bottles"]):
        cols = list(r.keys())
        bk = key(r.get(cols[0], ""), r.get(cols[1], ""))
        bottles[bk] = r
    priced_list = []
    for k, e in priced.items():
        priced_list.append({"house": e["house"], "name": e["name"], "tier": e["tier"], "slug": e["slug"],
                            "p": [e["p"].get(s) for s in ("3", "10", "30")], "m": [e["m"].get(s) for s in ("3", "10", "30")],
                            "k": where.get(k, -1)})

    # ---------------- dupes
    def jacc(a, b):
        if a < 0 or b < 0: return None
        x, y = set(rows[a]["ids"]), set(rows[b]["ids"])
        return round(len(x & y) / len(x | y), 2) if x | y else None
    dupes = []
    for r in read_csv(paths["dupes"]):
        ko, kd = key(r["original_house"], r["original"]), key(r["dupe_house"], r["dupe"])
        ao, ad = where.get(ko, -1), where.get(kd, -1)
        dupes.append({"o": {"house": r["original_house"], "name": r["original"], "ppm": float(r["original_price_per_ml_eur"]), "price": float(r["original_price_eur"]), "ml": int(float(r["original_size_ml"])), "k": ao},
                      "d": {"house": r["dupe_house"], "name": r["dupe"], "ppm": float(r["dupe_price_per_ml_eur"]), "price": float(r["dupe_price_eur"]), "ml": int(float(r["dupe_size_ml"])), "k": ad, "seller": r.get("dupe_seller", "")},
                      "save": float(r["saving_pct"]), "sim": jacc(ao, ad)})

    # ---------------- demand
    dem = read_csv(paths["demand"])
    pk = {}
    for e in priced_list: pk[key(e["house"], e["name"])] = e

    def dlist(metric, period=None):
        out = []
        for r in dem:
            if r["metric"] != metric: continue
            if period and r["period"] != period: continue
            if not r["perfume"] and not r["house"]: continue
            kk = key(r["house"], r["perfume"]) if r["perfume"] else None
            out.append({"rank": int(r["rank"]) if r["rank"] else 0, "perfume": r["perfume"], "house": r["house"],
                        "share": float(r["share"]) if r["share"] else None, "period": r["period"],
                        "k": where.get(kk, -1) if kk else -1, "priced": bool(kk and kk in pk)})
        return sorted(out, key=lambda x: x["rank"])
    periods = sorted({r["period"] for r in dem if r["metric"] == "quarterlyClimbers"})
    last = periods[-1] if periods else None
    demand = {"europe": dlist("topPerfumesEurope"), "fem": dlist("topFeminine"), "masc": dlist("topMasculine"),
              "uni": dlist("topUnisex"), "houses": dlist("topHouses"),
              "climbers": dlist("quarterlyClimbers", last), "fallers": dlist("quarterlyFallers", last), "period": last}
    stats = {"catalog": len(rows), "new_parfumo": n_new_p, "new_scento": n_new_s,
             "rated": sum(1 for r in rows if r["rating"]), "pyramids": sum(1 for r in rows if r["pyr"]),
             "priced": len(priced_list), "priced_matched": sum(1 for e in priced_list if e["k"] >= 0)}
    return rows, priced_list, dupes, demand, stats
