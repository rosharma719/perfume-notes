#!/usr/bin/env python3
"""Build site/data.js (perfumes + precomputed insights) for the pairings site."""
import argparse, itertools, json, os
import numpy as np
from collections import Counter
from math import log
from build_graph import load, normalise_note, FAMILY, FAMILY_OF, _build_family_lookup
import catalog

GENDER = {"Male": 0, "Female": 1, "Unisex": 2}
BINS = [(0, 2004, "before 2005"), (2005, 2009, "2005–09"), (2010, 2014, "2010–14"),
        (2015, 2019, "2015–19"), (2020, 9999, "2020 on")]


def yr(p):
    try:
        return int(p["year"])
    except ValueError:
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw"); ap.add_argument("--out", default="site")
    ap.add_argument("--refresh", action="store_true", help="re-download every source before building")
    a = ap.parse_args()
    rows = load(a.raw); N = len(rows)
    cpaths = catalog.fetch(a.raw, a.refresh)
    freq = Counter(n for r in rows for n in r["notes"])
    notes = [n for n, _ in freq.most_common()]
    ix = {n: i for i, n in enumerate(notes)}
    nid = [[ix[n] for n in r["notes"]] for r in rows]
    f = [freq[n] for n in notes]
    _build_family_lookup(notes)
    fams = list(FAMILY)
    generic = {i for i, n in enumerate(notes) if n.endswith(("Notes", "Accord"))}  # vague buckets: skip in insight tables

    pc = Counter()
    for ids in nid:
        for p in itertools.combinations(sorted(ids), 2): pc[p] += 1
    lift = lambda c, i, j: (c / N) / ((f[i] / N) * (f[j] / N))
    pair = lambda i, j, c: {"a": notes[i], "b": notes[j], "n": c, "lift": round(lift(c, i, j), 2)}

    surprising = sorted((pair(i, j, c) for (i, j), c in pc.items() if c >= 40 and min(f[i], f[j]) >= 60 and not {i, j} & generic),
                        key=lambda d: -d["lift"])[:30]
    avoid = sorted((pair(i, j, pc.get((i, j), 0)) for i in range(len(notes)) for j in range(i + 1, len(notes))
                    if f[i] >= 400 and f[j] >= 400 and not {i, j} & generic), key=lambda d: d["lift"])[:30]
    for d in avoid: d["expected"] = round(f[ix[d["a"]]] * f[ix[d["b"]]] / N)

    common = {i for i in range(len(notes)) if f[i] >= 250 and i not in generic}
    tc = Counter()
    for ids in nid:
        for t in itertools.combinations(sorted(set(ids) & common), 3): tc[t] += 1
    tl = lambda k, c: round(c / (f[k[0]] * f[k[1]] * f[k[2]] / N ** 2), 2)
    trio = lambda k, c: {"notes": [notes[i] for i in k], "n": c, "lift": tl(k, c)}
    trios = sorted((trio(k, c) for k, c in tc.items() if c >= 120), key=lambda d: -d["lift"])[:30]
    trios_common = [trio(k, c) for k, c in tc.most_common(30)]

    counts = [[0] * len(notes) for _ in BINS]; tot = [0] * len(BINS)
    gc = [[0] * len(notes) for _ in range(3)]; gt = [0, 0, 0]
    for r, ids in zip(rows, nid):
        g = GENDER[r["gender"]]; gt[g] += 1
        for i in ids: gc[g][i] += 1
        y = yr(r)
        if not y: continue
        b = next(k for k, (lo, hi, _) in enumerate(BINS) if lo <= y <= hi)
        tot[b] += 1
        for i in ids: counts[b][i] += 1

    time_rows, gender_rows = [], []
    for i in range(len(notes)):
        if f[i] < 300 or i in generic: continue
        share = [counts[b][i] / tot[b] for b in range(len(BINS))]
        time_rows.append({"note": notes[i], "share": [round(s, 4) for s in share],
                          "delta": round(share[-1] - share[0], 4)})
        sh = [gc[g][i] / gt[g] for g in range(3)]
        gender_rows.append({"note": notes[i], "share": [round(s, 4) for s in sh],
                            "lean": round(log((sh[0] + 1e-4) / (sh[1] + 1e-4)), 3)})

    # ------------------------------------------------ perfumer-oriented extras
    X = np.zeros((N, len(notes)), dtype=np.float32)
    for k, ids in enumerate(nid): X[k, ids] = 1
    C = X.T @ X
    fv = np.diag(C).copy()
    L = C * N / np.outer(fv, fv)
    ok = np.array([i not in generic for i in range(len(notes))])

    # understudies: notes with similar partner profiles (cosine on positive PMI)
    LL = np.clip(np.log(np.maximum(L, 1e-9)), -2, 2)
    V = np.where(C >= 5, LL, -0.5)               # unseen pairs count as mildly negative
    np.fill_diagonal(V, 0)
    keep = (fv >= 120) & ok                       # profiles are only trustworthy for reasonably common notes
    V[:, ~keep] = 0
    V = V - V.mean(1, keepdims=True)              # centre: only a note's *distinctive* preferences count
    nv = np.linalg.norm(V, axis=1) + 1e-9
    S = (V @ V.T) / np.outer(nv, nv); np.fill_diagonal(S, -1)
    similar = []
    for i in range(len(notes)):
        order = [j for j in np.argsort(-S[i]) if keep[j] and keep[i] and L[i, j] < 1.3][:6]
        similar.append([[int(j), round(float(S[i, j]), 3)] for j in order] if keep[i] else [])
    under = sorted(
        ({"a": notes[i], "b": notes[j], "sim": round(float(S[i, j]), 3), "lift": round(float(L[i, j]), 2), "n": int(C[i, j])}
         for i in range(len(notes)) for j in range(i + 1, len(notes))
         if keep[i] and keep[j] and fv[i] >= 150 and fv[j] >= 150 and L[i, j] < 1.15), key=lambda d: -d["sim"])[:20]

    # formula size
    sz = X.sum(1)
    mean_sz = (X.T @ sz) / np.maximum(fv, 1)
    pick = [i for i in range(len(notes)) if ok[i] and fv[i] >= 300]
    size_rows = [{"note": notes[i], "mean": round(float(mean_sz[i]), 1), "n": int(fv[i])} for i in pick]
    size_rows.sort(key=lambda d: d["mean"])
    size = {"mean": round(float(sz.mean()), 1), "median": float(np.median(sz)),
            "small": size_rows[:10], "large": size_rows[::-1][:10], "all": size_rows}

    # pairs rising / fading: 2020+ vs up to 2014
    years = np.array([yr(r) for r in rows])
    em, lm = (years >= 1) & (years <= 2014), years >= 2020
    Ne, Nl = int(em.sum()), int(lm.sum())
    Ce, Cl = X[em].T @ X[em], X[lm].T @ X[lm]
    cands = []
    for i in range(len(notes)):
        if not ok[i] or fv[i] < 100: continue
        for j in range(i + 1, len(notes)):
            if not ok[j] or fv[j] < 100: continue
            ce, cl = float(Ce[i, j]), float(Cl[i, j])
            if cl < 60 and ce < 60: continue
            cands.append((((cl + 1) / Nl) / ((ce + 1) / Ne), i, j, ce / Ne, cl / Nl, ce, cl))
    mk = lambda t: {"a": notes[t[1]], "b": notes[t[2]], "early": round(t[3], 4), "late": round(t[4], 4)}
    rising_pairs = [mk(t) for t in sorted((t for t in cands if t[6] >= 60), key=lambda t: -t[0])[:14]]
    falling_pairs = [mk(t) for t in sorted((t for t in cands if t[5] >= 60), key=lambda t: t[0])[:14]]

    # house styles
    brands = {}
    for k, r in enumerate(rows): brands.setdefault(r["brand"], []).append(k)
    house = []
    for b, idx in sorted(brands.items(), key=lambda kv: -len(kv[1])):
        n = len(idx)
        if n < 50 or len(house) >= 30: continue
        cnt = X[idx].sum(0)
        share = cnt / n
        lf = share / (fv / N)
        cand = [i for i in range(len(notes)) if ok[i] and cnt[i] >= max(8, 0.1 * n) and lf[i] >= 1.2]
        cand.sort(key=lambda i: -lf[i])
        if not cand: continue
        house.append({"brand": b, "n": n, "mean": round(float(sz[idx].mean()), 1),
                      "top": [{"note": notes[i], "lift": round(float(lf[i]), 1), "share": round(float(share[i]), 3)} for i in cand[:3]]})

    # ------------------------------------------------ styles: families, regions, market
    def nice(t):
        t = t.title().replace("Fougere", "Fougère").replace(" Of ", " of ")
        return t
    def names_of(key, minn):
        c = Counter(r[key] for r in rows if r[key])
        return [k for k, v in c.most_common() if v >= minn]
    fam_names = names_of("family", 1)
    sub_names = names_of("subfamily", 100)
    org_names = names_of("origin", 60)
    fidx = {k: i for i, k in enumerate(fam_names)}
    sidx = {k: i for i, k in enumerate(sub_names)}
    oidx = {k: i for i, k in enumerate(org_names)}

    binidx = np.full(N, -1)
    for b, (lo, hi, _) in enumerate(BINS):
        binidx[(years >= max(lo, 1)) & (years <= hi)] = b
    gend = np.array([GENDER[r["gender"]] for r in rows])
    tot_arr = np.array(tot, dtype=float)

    def profile(idx):
        idx = np.array(idx); n = len(idx)
        cnt = X[idx].sum(0); share = cnt / n; lf = share / (fv / N)
        okn = [i for i in range(len(notes)) if ok[i]]
        core = [i for i in sorted(okn, key=lambda i: -share[i]) if lf[i] >= 1.12][:4]
        sig = [i for i in sorted(okn, key=lambda i: -lf[i]) if cnt[i] >= max(6, 0.04 * n) and lf[i] >= 1.25][:4]
        yrs = years[idx]; yrs = yrs[yrs > 0]
        per = [round(float((binidx[idx] == b).sum() / tot_arr[b]), 4) for b in range(len(BINS))]
        aud = [round(float((gend[idx] == g).mean()), 3) for g in range(3)]
        mk = lambda i: {"note": notes[i], "lift": round(float(lf[i]), 1)}
        return {"n": n, "mean": round(float(sz[idx].mean()), 1), "aud": aud,
                "med": int(np.median(yrs)) if len(yrs) else 0, "per": per,
                "core": [mk(i) for i in core], "sig": [mk(i) for i in sig]}

    def group(key, names):
        out = []
        for nm in names:
            idx = [k for k, r in enumerate(rows) if r[key] == nm]
            p = profile(idx); p["name"] = nice(nm); out.append(p)
        return out
    families = group("family", fam_names)
    subfamilies = group("subfamily", sub_names)
    regions = group("origin", org_names)

    market = []
    for y in range(2000, int(years.max()) + 1):
        idx = np.where(years == y)[0]
        if len(idx) < 30: continue
        market.append({"year": y, "n": int(len(idx)), "aud": [round(float((gend[idx] == g).mean()), 3) for g in range(3)],
                       "mean": round(float(sz[idx].mean()), 1)})
    for h in house:
        idx = np.array(brands[h["brand"]]); yy = years[idx]; yy = yy[yy > 0]
        h["aud"] = [round(float((gend[idx] == g).mean()), 3) for g in range(3)]
        h["med"] = int(np.median(yy)) if len(yy) else 0
        h["per"] = [round(float((binidx[idx] == b).sum() / max(1, (binidx == b).sum())), 4) for b in range(len(BINS))]

    # ------------------------------------------------ merged catalog + buying feeds
    cat_rows, priced, dupes, demand, cstats, extras, bmerged = catalog.build(rows, notes, normalise_note, FAMILY_OF, cpaths)
    notes_out = notes + [n for n, _ in extras]
    family_out = [fams.index(FAMILY_OF[n]) for n in notes] + [fams.index(f) for _, f in extras]
    perfumes = [[c["name"], c["brand"], c["year"], c["gender"], c["ids"], fidx.get(c["family"], -1), oidx.get(c["origin"], -1),
                 int(round(c["rating"] * 10)) if c["rating"] else 0, c["reviews"]] for c in cat_rows]
    pyr = {i: c["pyr"] for i, c in enumerate(cat_rows) if c["pyr"]}
    meta = {i: c["meta"] + [c["rank"]] for i, c in enumerate(cat_rows) if c["meta"]}
    print("catalog:", cstats)
    print("new notes:", [(n, f) for n, f in extras])
    print("brand aliases learned:", [(a, b, c) for a, b, c in bmerged][:30])

    data = {
        "n": N, "notes": notes_out, "n_stat_notes": len(notes), "freq": f, "families": fams, "family_of": family_out,
        "perfumes": perfumes, "pyr": pyr, "meta": meta, "priced": priced, "dupes": dupes, "demand": demand,
        "sources": catalog.SOURCE_INFO, "cstats": cstats,
        "fam_names": [nice(x) for x in fam_names], "org_names": [nice(x) if x.isupper() else x for x in org_names],
        "olf": families, "olf_sub": subfamilies, "regions": regions, "market": market,
        "surprising": surprising, "avoid": avoid, "trios": trios, "trios_common": trios_common,
        "bins": [b[2] for b in BINS], "bin_totals": tot, "time": time_rows,
        "gender_totals": gt, "gender": gender_rows,
        "similar": similar, "understudies": under, "size": size,
        "rising_pairs": rising_pairs, "falling_pairs": falling_pairs, "house": house,
    }
    os.makedirs(a.out, exist_ok=True)
    with open(f"{a.out}/data.js", "w", encoding="utf-8") as fh:
        fh.write("window.DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";")
    print(N, "perfumes;", len(notes), "notes; data.js", os.path.getsize(f"{a.out}/data.js") // 1024, "KB")
    nm = lambda d: d["a"] + "+" + d["b"] if "a" in d else "+".join(d["notes"])
    for k in ("surprising", "avoid", "trios", "trios_common"):
        print(k, [(nm(d), d["n"], d["lift"]) for d in data[k][:6]])
    t = sorted(time_rows, key=lambda d: d["delta"])
    print("fell", [(d["note"], d["delta"]) for d in t[:5]], "rose", [(d["note"], d["delta"]) for d in t[-5:]])
    g = sorted(gender_rows, key=lambda d: d["lean"])
    print("under", [(d["a"], d["b"], d["sim"], d["lift"]) for d in under[:6]])
    print("size", size["mean"], [d["note"] for d in size["small"][:5]], [d["note"] for d in size["large"][:5]])
    print("rp", [(d["a"], d["b"]) for d in rising_pairs[:5]], "fp", [(d["a"], d["b"]) for d in falling_pairs[:5]])
    print("house", [(h["brand"], [t["note"] for t in h["top"]]) for h in house[:6]])
    print("fem", [d["note"] for d in g[:6]], "masc", [d["note"] for d in g[-6:]])


main()
