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
    "rosewood": "Palisander Rosewood", "blond woods": "Woody Notes", "precious woods": "Woody Notes", "dry woods": "Woody Notes",
    "red fruits": "Fruity Notes", "fruits": "Fruity Notes", "green leaves": "Green Notes", "grass": "Fresh Cut Grass", "blossoms": "Floral Notes",
    "white blossoms": "Floral Notes", "musky notes": "Musk", "tiaré": "Tiare", "tiare flower": "Tiare", "ambrette": "Ambrette Seed", "cashmere": "Cashmere Wood",
    "peru balsam": "Balsam Of Peru", "citron": "Lemon", "coumarin": "Tonka Bean", "ozone": "Marine", "ozonic notes": "Marine", "nagarmotha": "Cypriol",
    "hedione": "Jasmine", "waterlily": "Lotus", "water lily": "Lotus", "mugwort": "Artemisia", "laurel": "Bay", "resins": "Amber", "balsamic notes": "Amber",
    "rosa centifolia": "Rose", "sichuan pepper": "Black Pepper", "tolu balm": "Balsam Of Peru", "red berries": "Fruity Notes", "red currant": "Blackcurrant Bud",
}


_PEPPER_ODD = ("white", "sichuan", "szechuan", "szechwan", "long", "green", "cubeb", "voatsiperifery", "timur", "sansho")
_FRUITY_TAIL = (" fruits", " fruit", " berries", " berry")


class NoteMap:
    """Map free-text notes onto a fixed vocabulary: exact, synonym, plural, then head-word rules."""

    def __init__(self, canon_names, normalise):
        self.v = {n.lower(): n for n in canon_names}
        self.by_len = sorted(self.v, key=lambda s: -len(s))
        self.normalise = normalise
        self.cache = {}

    def add(self, name):
        self.v[name.lower()] = name
        self.by_len = sorted(self.v, key=lambda s: -len(s)); self.cache = {}

    def __call__(self, raw):
        if raw in self.cache: return self.cache[raw]
        out = self._map(raw); self.cache[raw] = out
        return out

    def low(self, raw):
        return re.sub(r"\s+", " ", self.normalise(raw).lower().strip())

    def _map(self, raw):
        low = self.low(raw)
        if low in self.v: return self.v[low]
        if low in EXTRA_SYN:
            t = self.v.get(EXTRA_SYN[low].lower())
            if t: return t
        if low.endswith("s") and low[:-1] in self.v: return self.v[low[:-1]]          # plurals
        if re.search(r"\b(cedar|cedarwood)$", low) and "cedarwood" in self.v: return self.v["cedarwood"]
        if re.search(r"\brosewood$", low) and "palisander rosewood" in self.v: return self.v["palisander rosewood"]
        if low.endswith(" woods") and "woody notes" in self.v: return self.v["woody notes"]
        if low.endswith(" pepper") and low.split()[0] in _PEPPER_ODD and "black pepper" in self.v: return self.v["black pepper"]
        if low.endswith(_FRUITY_TAIL) and "fruity notes" in self.v and low not in self.v: return self.v["fruity notes"]
        if low.endswith(" blossoms") and "floral notes" in self.v: return self.v["floral notes"]
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


# ------------------------------------------------------------------ names & brands (dedupe)
_YEAR = re.compile(r"\b(19|20)\d\d\b")
_CONC = re.compile(r"\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche|extrait de parfum|parfum extrait|extrait|edp|edt|edc|parfum|cologne|toilette)\b")
_STOP = {"de", "du", "des", "la", "le", "les", "the", "of", "and", "et", "di", "da", "del", "von", "by", "for"}
_BGEN = {"parfums", "parfum", "perfumes", "perfume", "fragrances", "fragrance", "paris", "london", "maison", "house", "of", "de", "by", "the", "co", "and", "eau", "di", "da"}
GENDER_WORDS = {"men", "man", "women", "woman", "homme", "femme", "uomo", "donna", "him", "her", "male", "female"}
BRAND_ALIAS = {"ysl": "yvessaintlaurent", "dg": "dolcegabbana", "ck": "calvinklein", "christiandior": "dior", "giorgioarmani": "armani"}


def _words(s):
    return re.findall(r"[a-z0-9]+", _ascii(s))


def brand_tokens(brand):
    return {w for w in _words(brand) if w not in _BGEN and len(w) > 1}


def name_tokens(name, drop=()):
    s = _CONC.sub(" ", _YEAR.sub(" ", _ascii(name)))
    t = [w for w in re.findall(r"[a-z0-9]+", s) if (len(w) > 1 or w.isdigit()) and w not in _STOP]
    d = [w for w in t if w not in drop]
    return tuple(sorted(d or t))


def clean_display(name, brand):
    """Drop source clutter from a name: bracketed or trailing years, and the brand repeated inside the name.
    Concentration (Eau de Parfum...) is kept: it distinguishes real products."""
    n = re.sub(r"\(\s*(?:19|20)\d\d\s*\)", " ", name)
    n = re.sub(r"(?<=\D)\s+(?:19|20)\d\d\b(?=\s*(?:eau|extrait|parfum|cologne|$))", " ", n)
    m = re.sub(r"\b" + re.escape(brand) + r"\b", " ", n, flags=re.I)
    if len(m.split()) >= 1 and len(re.sub(r"[^a-zA-Z0-9]", "", m)) >= 2: n = m
    n = re.sub(r"\s+", " ", n).strip(" -\u2013:\u00b7,")
    return n or name


class UF:
    def __init__(self): self.p = {}
    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b: self.p[b] = a


def learn_brand_clusters(recs):
    """Merge brand spellings that clearly are one house: they share many product names and one
    spelling contains the other ('Nishane' / 'Nishane Istanbul', 'Rabanne' / 'Paco Rabanne')."""
    names = defaultdict(set)
    for r in recs:
        names[nbrand(r["brand"])].add(name_tokens(r["name"], brand_tokens(r["brand"])))
    inv = defaultdict(set)
    for b, ns in names.items():
        for n in ns: inv[n].add(b)
    pair = defaultdict(int)
    for n, bs in inv.items():
        if 1 < len(bs) <= 5:
            bs = sorted(bs)
            for i in range(len(bs)):
                for j in range(i + 1, len(bs)): pair[(bs[i], bs[j])] += 1
    uf = UF(); merged = []
    for (a, b), c in pair.items():
        small = min(len(names[a]), len(names[b]))
        related = (a in b or b in a) and min(len(a), len(b)) >= 3
        if related and (c >= 3 or (c >= 2 and small <= 4)) and c >= 0.3 * small:
            uf.union(a, b); merged.append((a, b, c))
    for k, v in BRAND_ALIAS.items(): uf.union(v, k)
    root = {b: uf.find(b) for b in names}
    return root, merged


def build(main_rows, stat_notes, normalise, fam_of_note, paths, extra_min=150):
    """Return (rows, priced, dupes, demand, stats, extras).

    rows: merged + deduplicated catalog.  extras: [(note, family)] discovered from the new data.
    """
    # ---------------- vocabulary: fixed notes + frequent ones the new data adds
    nm0 = NoteMap(stat_notes, normalise)
    extras = discover_extras(paths, nm0, fam_of_note, extra_min)
    all_notes = list(stat_notes) + [n for n, _ in extras]
    notemap = NoteMap(all_notes, normalise)
    notes_index = {n: i for i, n in enumerate(all_notes)}

    def idxs(names): return sorted({notes_index[n] for n in names if n in notes_index})

    def pyramid(top, mid, base):
        parts = [idxs([n for n in map(notemap, sec or []) if n]) for sec in (top, mid, base)]
        return parts if any(parts) else None

    # ---------------- 1. gather every source record
    GEN = {"Male": 0, "Female": 1, "Unisex": 2}
    recs = []
    for r in main_rows:
        try: y = int(r["year"])
        except ValueError: y = 0
        recs.append({"src": "main", "brand": r["brand"], "name": r["name"], "year": y, "gender": GEN.get(r["gender"], -1),
                     "family": r.get("family", ""), "origin": r.get("origin", ""), "ids": idxs(r["notes"]), "pyr": None,
                     "rating": 0, "reviews": 0, "meta": None, "rank": 0, "acc": []})
    for line in open(paths["parfumo"], encoding="utf-8"):
        r = json.loads(line)
        if not r.get("brand_name") or not r.get("perfume_name"): continue
        pyr = pyramid(r.get("top_notes"), r.get("middle_notes"), r.get("base_notes"))
        ids = sorted({i for p in (pyr or []) for i in p})
        recs.append({"src": "parfumo", "brand": r["brand_name"], "name": r["perfume_name"], "year": r.get("release_year") or 0,
                     "gender": -1, "family": "", "origin": "", "ids": ids, "pyr": pyr, "rating": r.get("rating") or 0,
                     "reviews": r.get("review_count") or 0, "meta": None, "rank": 0,
                     "acc": [a.strip().lower() for a in (r.get("main_accords") or []) if a and a.strip()]})
    for r in read_csv(paths["scento"]):
        pyr = pyramid(split(r["top_notes"]), split(r["heart_notes"]), split(r["base_notes"]))
        ids = sorted({i for p in (pyr or []) for i in p})
        try: rank = int(r["popularity_rank"])
        except (ValueError, KeyError): rank = 0
        recs.append({"src": "scento", "brand": r["house"], "name": r["name"], "year": int(r["year"]) if (r.get("year") or "").isdigit() else 0,
                     "gender": -1, "family": "", "origin": "", "ids": ids, "pyr": pyr, "rating": 0, "reviews": 0,
                     "meta": [r.get("seasons", ""), r.get("times_of_day", ""), r.get("character", "")], "rank": rank, "acc": []})
    n_raw = len(recs)

    # ---------------- 2. brands: learn aliases, then canonical names within each house
    root, merged_brands = learn_brand_clusters(recs)
    by_root_brand = defaultdict(lambda: defaultdict(int))
    toks_of_root = defaultdict(set)
    for r in recs:
        b = nbrand(r["brand"]); rt = root[b]
        by_root_brand[rt][(r["brand"], r["src"] == "main")] += 1
        toks_of_root[rt] |= brand_tokens(r["brand"])
    display = {rt: max(c.items(), key=lambda kv: (kv[0][1], kv[1]))[0][0] for rt, c in by_root_brand.items()}
    for r in recs:
        rt = root[nbrand(r["brand"])]
        r["root"] = rt
        r["key"] = (rt, name_tokens(r["name"], toks_of_root[rt]))

    # ---------------- 3. merge records that are one perfume; only when note lists agree
    def jac(x, y):
        x, y = set(x), set(y)
        return len(x & y) / len(x | y) if x | y else 1.0
    prio = {"main": 0, "scento": 1, "parfumo": 2}

    def same_perfume(m, cluster):
        """Same brand + name. Different sources with compatible years are one perfume even if their note lists
        disagree; within one source, or when years conflict, require the notes to agree."""
        for x in cluster:
            year_ok = not m["year"] or not x["year"] or abs(m["year"] - x["year"]) <= 1
            j = jac(m["ids"], x["ids"]) if len(m["ids"]) >= 3 and len(x["ids"]) >= 3 else 1.0
            if m["src"] != x["src"]:
                if year_ok or j >= 0.5: return True
            elif year_ok and j >= 0.5:
                return True
        return False
    groups = defaultdict(list)
    for r in recs: groups[r["key"]].append(r)
    rows, key_to_row, merged_n = [], {}, 0
    for key_, members in groups.items():
        members.sort(key=lambda r: (prio[r["src"]], -len(r["ids"])))
        clusters = []
        for m in members:
            for c in clusters:
                if same_perfume(m, c):
                    c.append(m); break
            else:
                clusters.append([m])
        for c in clusters:
            rep = c[0]
            row = {"brand": display[rep["root"]], "year": 0, "gender": -1, "family": "", "origin": "", "ids": rep["ids"], "pyr": None,
                   "rating": 0, "reviews": 0, "src": set(), "meta": None, "rank": 0, "acc": [], "root": rep["root"], "key": key_}
            # cleanest display name: fewest brand words, then shortest
            bt = toks_of_root[rep["root"]]
            row["name"] = min((clean_display(m["name"], display[rep["root"]]) for m in c), key=lambda n: (sum(w in bt for w in _words(n)), len(n)))
            years = [m["year"] for m in c if m["year"]]
            row["year"] = max(set(years), key=years.count) if years else 0
            for m in c:
                row["src"].add(m["src"])
                if m["gender"] >= 0 and row["gender"] < 0: row["gender"] = m["gender"]
                for f in ("family", "origin"):
                    if m[f] and not row[f]: row[f] = m[f]
                if m["pyr"] and not row["pyr"]: row["pyr"] = m["pyr"]
                if m["acc"] and not row["acc"]: row["acc"] = m["acc"]
                if m["meta"]: row["meta"], row["rank"] = m["meta"], m["rank"] or row["rank"]
                if m["rating"] and m["reviews"] >= row["reviews"]: row["rating"], row["reviews"] = m["rating"], m["reviews"]
                if len(m["ids"]) > len(row["ids"]) and prio[m["src"]] > 0 and not row["ids"]: row["ids"] = m["ids"]
            merged_n += len(c) - 1
            rows.append(row)
    rows = [r for r in rows if len(r["ids"]) >= 2]
    for i, r in enumerate(rows): key_to_row.setdefault(r["key"], i)
    loose = defaultdict(list)
    for i, r in enumerate(rows):
        loose[(r["root"], tuple(t for t in r["key"][1] if t not in GENDER_WORDS))].append(i)

    def find(brand, name):
        """Locate a catalog row for an outside (brand, name), tolerant of brand/gender/year noise."""
        b = nbrand(brand); rt = root.get(b, BRAND_ALIAS.get(b, b))
        bt = toks_of_root.get(rt) or brand_tokens(brand)
        k = (rt, name_tokens(name, bt))
        if k in key_to_row: return key_to_row[k]
        c = loose.get((rt, tuple(t for t in k[1] if t not in GENDER_WORDS)), [])
        return c[0] if len(c) == 1 else -1
    where = find

    # ---------------- prices
    priced = {}
    for r in read_csv(paths["prices"]):
        e = priced.setdefault((nbrand(r["house"]), nname(r["perfume"])), {"house": r["house"], "name": r["perfume"], "tier": r["tier"], "p": {}, "m": {},
                              "slug": r["url"].rsplit("/", 1)[-1] if r.get("url") else ""})
        e["p"][r["size_ml"]] = float(r["price_eur"]); e["m"][r["size_ml"]] = float(r["price_per_ml_eur"])
    priced_list = [{"house": e["house"], "name": e["name"], "tier": e["tier"], "slug": e["slug"],
                    "p": [e["p"].get(s) for s in ("3", "10", "30")], "m": [e["m"].get(s) for s in ("3", "10", "30")],
                    "k": find(e["house"], e["name"])} for e in priced.values()]

    # ---------------- dupes
    def jacc(a, b):
        if a < 0 or b < 0: return None
        return round(jac(rows[a]["ids"], rows[b]["ids"]), 2)
    dupes = []
    for r in read_csv(paths["dupes"]):
        ao, ad = find(r["original_house"], r["original"]), find(r["dupe_house"], r["dupe"])
        dupes.append({"o": {"house": r["original_house"], "name": r["original"], "ppm": float(r["original_price_per_ml_eur"]), "price": float(r["original_price_eur"]), "ml": int(float(r["original_size_ml"])), "k": ao},
                      "d": {"house": r["dupe_house"], "name": r["dupe"], "ppm": float(r["dupe_price_per_ml_eur"]), "price": float(r["dupe_price_eur"]), "ml": int(float(r["dupe_size_ml"])), "k": ad, "seller": r.get("dupe_seller", "")},
                      "save": float(r["saving_pct"]), "sim": jacc(ao, ad)})

    # ---------------- demand
    dem = read_csv(paths["demand"])
    pk = {(nbrand(e["house"]), nname(e["name"])) for e in priced_list}

    def dlist(metric, period=None):
        out = []
        for r in dem:
            if r["metric"] != metric or (period and r["period"] != period): continue
            if not r["perfume"] and not r["house"]: continue
            kk = find(r["house"], r["perfume"]) if r["perfume"] else -1
            out.append({"rank": int(r["rank"]) if r["rank"] else 0, "perfume": r["perfume"], "house": r["house"],
                        "share": float(r["share"]) if r["share"] else None, "period": r["period"], "k": kk,
                        "priced": bool(r["perfume"] and (nbrand(r["house"]), nname(r["perfume"])) in pk)})
        return sorted(out, key=lambda x: x["rank"])
    periods = sorted({r["period"] for r in dem if r["metric"] == "quarterlyClimbers"})
    last = periods[-1] if periods else None
    demand = {"europe": dlist("topPerfumesEurope"), "fem": dlist("topFeminine"), "masc": dlist("topMasculine"),
              "uni": dlist("topUnisex"), "houses": dlist("topHouses"),
              "climbers": dlist("quarterlyClimbers", last), "fallers": dlist("quarterlyFallers", last), "period": last}
    stats = {"catalog": len(rows), "raw_records": n_raw, "merged": merged_n, "brand_aliases": len(merged_brands),
             "rated": sum(1 for r in rows if r["rating"]), "accords": sum(1 for r in rows if r["acc"]), "pyramids": sum(1 for r in rows if r["pyr"]),
             "priced": len(priced_list), "priced_matched": sum(1 for e in priced_list if e["k"] >= 0),
             "new_notes": len(extras), "sources": {s: sum(1 for r in rows if s in r["src"]) for s in ("main", "parfumo", "scento")}}
    return rows, priced_list, dupes, demand, stats, extras, merged_brands


# ------------------------------------------------------------------ new notes found in the new data
_BAD = re.compile(r"\d|\b(notes?|accords?|absolute|essence|extract|oil|oils|fresh|sweet|dry|soft|warm|dried|candied|natural|synthetic|accord)\b")


# the co-occurrence vote is a first pass; these are corrections where it picks a neighbour's family
FAMILY_FIX = {"Honey": "Sweet & Gourmand", "Styrax": "Amber & Resin", "Cumin": "Spicy", "Caraway": "Spicy", "Tagetes": "Green & Herbal",
              "Driftwood": "Woody", "Davana": "Green & Herbal", "Cyclamen": "Rose & Garden Floral", "Pine": "Woody", "Fir Balsam": "Woody",
              "Cypress": "Woody"}


def discover_extras(paths, notemap, fam_of_note, min_count=150):
    """Frequent notes in Parfumo/Scento that the fixed vocabulary lacks (basil, honey, cypress...).
    Each is assigned the family whose notes it co-occurs with most (PMI vote)."""
    import math
    from collections import Counter
    unm = Counter(); recs = []
    def sections(r):
        return (r.get("top_notes") or []) + (r.get("middle_notes") or []) + (r.get("base_notes") or [])
    srcs = [sections(json.loads(l)) for l in open(paths["parfumo"], encoding="utf-8")]
    srcs += [split(r["top_notes"]) + split(r["heart_notes"]) + split(r["base_notes"]) for r in read_csv(paths["scento"])]
    for ns in srcs:
        mapped, un = set(), set()
        for n in ns:
            m = notemap(n)
            if m: mapped.add(m)
            else:
                low = notemap.low(n)
                if low and not _BAD.search(low) and 3 <= len(low) <= 24: un.add(low)
        for u in un: unm[u] += 1
        recs.append((mapped, un))
    # fold plural/singular: keep the more frequent spelling
    fold = {}
    for low in list(unm):
        if low.endswith("s") and low[:-1] in unm and unm[low[:-1]] >= unm[low]: fold[low] = low[:-1]
        elif low.endswith("s") and low[:-1] in unm: fold[low[:-1]] = low
    chosen = {}
    for low, c in unm.items():
        if low in fold: continue
        c += sum(unm[k] for k, v in fold.items() if v == low)
        if c >= min_count: chosen[low] = c
    cnt_note = Counter(n for m, _ in recs for n in m)
    co = defaultdict(Counter)
    for m, un in recs:
        for u in un:
            u = fold.get(u, u)
            if u in chosen:
                for n in m: co[u][n] += 1
    total = len(recs); out = []
    for low, c in sorted(chosen.items(), key=lambda kv: -kv[1]):
        vote = Counter()
        scored = sorted(((math.log(v * total / (c * cnt_note[n])), n) for n, v in co[low].items() if v >= 8 and cnt_note[n] >= 50), reverse=True)[:8]
        for pmi, n in scored:
            if pmi > 0: vote[fam_of_note.get(n, "Other")] += pmi
        fam = vote.most_common(1)[0][0] if vote else "Sweet & Gourmand"
        name = " ".join(w.capitalize() for w in low.split())
        out.append((name, FAMILY_FIX.get(name, fam)))
    return out
