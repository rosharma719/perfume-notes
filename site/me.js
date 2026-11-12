(function () {
  "use strict";
  const A = window.APP;
  const { D, P, N, notes, ix, FO, FP, F, fs, chip, esc, fmt, pct, times, mobile, fragItem, mkTable, ratingScore, bestPpm, priceOf, rankOf } = A;
  const $ = (id) => document.getElementById(id);
  const GL = A.GL;

  /* ================================================================ state */
  const KEY = "wgww.me.v1";
  const blank = () => ({ love: [], avoid: [], famLove: [], famAvoid: [], aud: [], own: [], dis: [],
    shop: { fam: "all", since: "0", maxppm: "0", rated: false, hideDupes: true, showAvoid: false, learn: true, sort: "fit", shown: 20 } });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); S.shop = Object.assign(blank().shop, S.shop || {}); } catch (e) { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const pkey = (k) => P[k][0] + "|" + P[k][1] + "|" + P[k][2];
  let kmap = null;
  const km = () => kmap || (kmap = new Map(P.map((p, k) => [p[0] + "|" + p[1] + "|" + p[2], k])));
  const FAMS = D.fam_names;
  let ownK = [], disK = [], ownSet = new Set(), disSet = new Set(), dirty = true;
  function sync() {
    ownK = S.own.map((x) => km().get(x)).filter((k) => k !== undefined);
    disK = S.dis.map((x) => km().get(x)).filter((k) => k !== undefined);
    ownSet = new Set(ownK); disSet = new Set(disK); dirty = true;
  }
  sync();
  const idxSet = (names, map) => new Set(names.map((n) => map.get(n)).filter((x) => x !== undefined));

  A.me = {
    isOwn: (k) => ownSet.has(k), isDis: (k) => disSet.has(k),
    toggle(kind, k) {
      const key = pkey(k), other = kind === "own" ? "dis" : "own";
      const i = S[kind].indexOf(key);
      if (i >= 0) S[kind].splice(i, 1);
      else { S[kind].push(key); const j = S[other].indexOf(key); if (j >= 0) S[other].splice(j, 1); }
      save(); sync();
    },
  };

  /* ================================================================ taste */
  const cycle = (arr, avoid, name) => {
    const a = arr.indexOf(name), b = avoid.indexOf(name);
    if (a >= 0) { arr.splice(a, 1); avoid.push(name); }            // love -> avoid
    else if (b >= 0) avoid.splice(b, 1);                             // avoid -> off
    else arr.push(name);                                             // off -> love
  };
  const state = (love, avoid, name) => (love.includes(name) ? "love" : avoid.includes(name) ? "avoid" : "");

  function renderTaste() {
    const byFam = D.families.map(() => []);
    notes.forEach((n, i) => byFam[FO[i]].push(i));
    $("taste-board").innerHTML = byFam.map((list, fi) =>
      `<div class="fam"><h4>${esc(D.families[fi])}</h4><div class="g">` +
      list.map((i) => `<button class="ttile ${state(S.love, S.avoid, notes[i])}" data-tn="${i}" style="${fs(i)}">${esc(notes[i])}</button>`).join("") + "</div></div>").join("");
    $("taste-fams").innerHTML = FAMS.map((f, i) => `<button class="ttile ${state(S.famLove, S.famAvoid, f)}" data-tf="${i}">${esc(f)}</button>`).join("");
    $("taste-aud").innerHTML = ["Men’s", "Women’s", "Unisex"].map((l, i) => `<button class="ttile ${S.aud.includes(i) ? "love" : ""}" data-ta="${i}">${l}</button>`).join("") +
      `<span class="hint">${S.aud.length ? "Only these are suggested (unlabelled perfumes always show)." : "Any audience."}</span>`;
    $("taste-sum").innerHTML = `<b>${S.love.length}</b> loved · <b>${S.avoid.length}</b> avoided · <b>${S.own.length}</b> owned`;
  }

  /* ================================================================ collection */
  function listHTML(ks, ctx) { return ks.length ? ks.map((k) => fragItem(k, { ctx })).join("") : ""; }
  function renderCollection() {
    $("coll-n").textContent = ownK.length ? `(${ownK.length})` : "";
    $("coll-list").innerHTML = listHTML(ownK, "own") || `<li class="empty-li">Nothing yet. Search above, or tap “Own” on any fragrance.</li>`;
    $("coll-dis").innerHTML = listHTML(disK, "dis") || `<li class="empty-li">Nothing yet.</li>`;
    renderAnalysis();
  }
  function renderAnalysis() {
    const el = $("coll-an");
    if (!ownK.length) { el.innerHTML = ""; return; }
    const cnt = new Map(), fam = new Array(FAMS.length).fill(0);
    ownK.forEach((k) => { P[k][4].forEach((i) => cnt.set(i, (cnt.get(i) || 0) + 1)); if (P[k][5] >= 0) fam[P[k][5]]++; });
    const top = [...cnt].filter(([i]) => !/(Notes|Accord)$/.test(notes[i])).sort((a, b) => (b[1] / ownK.length) / (F[b[0]] / N) - (a[1] / ownK.length) / (F[a[0]] / N) || b[1] - a[1])
      .filter(([i, c]) => c >= Math.min(2, ownK.length) && (c / ownK.length) / (F[i] / N) > 1.2).slice(0, 10);
    const love = idxSet(S.love, ix);
    const missing = [...love].filter((i) => !cnt.has(i));
    const maxF = Math.max(1, ...fam);
    // redundant pairs inside the collection
    const dup = [];
    for (let a = 0; a < ownK.length; a++) for (let b = a + 1; b < ownK.length; b++) {
      const x = new Set(P[ownK[a]][4]), y = P[ownK[b]][4]; let inter = 0; y.forEach((i) => (inter += x.has(i) ? 1 : 0));
      const s = inter / (x.size + y.length - inter);
      if (s >= 0.5) dup.push([ownK[a], ownK[b], s]);
    }
    dup.sort((p, q) => q[2] - p[2]);
    el.innerHTML = `<div class="an-grid">` +
      `<div><h3>Family mix</h3>${FAMS.map((f, i) => `<div class="fbar${fam[i] ? "" : " zero"}"><span>${esc(f)}</span><i style="width:${(fam[i] / maxF) * 100}%"></i><b>${fam[i] || "none"}</b></div>`).join("")}<p class="hint">Only perfumes with a known family are counted.</p></div>` +
      `<div><h3>What you lean on</h3><div class="chiprow">${top.length ? top.map(([i, c]) => `${chip(i)}`).join("") : "<span class=hint>Add a few more perfumes.</span>"}</div>` +
      (missing.length ? `<h3>Loved but not in your collection</h3><div class="chiprow">${missing.map((i) => chip(i)).join("")}</div>` : "") +
      (dup.length ? `<h3>Overlapping pairs</h3>${dup.slice(0, 5).map(([a, b, s]) => `<div class="ovl"><b>${esc(P[a][0])}</b> and <b>${esc(P[b][0])}</b> <i>${Math.round(s * 100)}% same notes</i></div>`).join("")}` : "") +
      `</div></div>`;
  }
  function collSearch() {
    const q = $("coll-q").value.trim().toLowerCase();
    const el = $("coll-res");
    if (q.length < 2) { el.innerHTML = ""; return; }
    const toks = q.split(/\s+/), out = [];
    for (let k = 0; k < N && out.length < 8; k++) {
      if (ownSet.has(k)) continue;
      const s = (P[k][0] + " " + P[k][1]).toLowerCase();
      if (toks.every((t) => s.includes(t))) out.push(k);
    }
    // prefer popular (rated) matches
    out.sort((a, b) => ratingScore(b) - ratingScore(a));
    el.innerHTML = out.length ? out.map((k) => `<li class="res"><span><b>${esc(P[k][0])}</b> <i>${esc(P[k][1])}</i>${P[k][2] ? ` · ${P[k][2]}` : ""}</span><button class="act" data-own="${k}">Add</button></li>`).join("") : `<li class="empty-li">No match.</li>`;
  }

  /* ================================================================ shop */
  let ownMasks = [], disMasks = [], collNotes = new Set(), collFams = new Set(), implied = new Map(), builtFor = "";
  function prep() {
    const sig = S.own.join("~") + "#" + S.dis.join("~") + "#" + S.shop.learn;
    if (!dirty && builtFor === sig) return;
    const mask = (k) => { const m = new Uint8Array(notes.length); P[k][4].forEach((i) => (m[i] = 1)); return { k, m, n: P[k][4].length }; };
    ownMasks = ownK.map(mask); disMasks = disK.map(mask);
    collNotes = new Set(); collFams = new Set(); implied = new Map();
    const cnt = new Map();
    ownK.forEach((k) => { P[k][4].forEach((i) => { collNotes.add(i); cnt.set(i, (cnt.get(i) || 0) + 1); }); if (P[k][5] >= 0) collFams.add(P[k][5]); });
    if (S.shop.learn && ownK.length >= 2) cnt.forEach((c, i) => { const sh = c / ownK.length; if (sh >= 0.3 && sh / (F[i] / N) >= 1.25) implied.set(i, 0.5); });
    dirty = false; builtFor = sig;
  }
  const best = (masks, ids) => {
    let s = 0, who = -1;
    for (const o of masks) { let inter = 0; for (const i of ids) inter += o.m[i]; if (!inter) continue; const j = inter / (o.n + ids.length - inter); if (j > s) { s = j; who = o.k; } }
    return [s, who];
  };

  function shopCompute() {
    prep();
    const o = S.shop, love = idxSet(S.love, ix), avoid = idxSet(S.avoid, ix);
    const famLove = new Set(S.famLove.map((f) => FAMS.indexOf(f))), famAvoid = new Set(S.famAvoid.map((f) => FAMS.indexOf(f)));
    const aud = S.aud, since = +o.since, cap = +o.maxppm;
    const hasTaste = love.size || implied.size || famLove.size;
    const out = [];
    for (let k = 0; k < N; k++) {
      if (ownSet.has(k) || disSet.has(k)) continue;
      const p = P[k], ids = p[4];
      if (aud.length && p[3] >= 0 && !aud.includes(p[3])) continue;
      if (o.fam !== "all" && String(p[5]) !== o.fam) continue;
      if (since && (!p[2] || p[2] < since)) continue;
      if (o.rated && !(p[7] && p[8] >= 10)) continue;
      let ppm = null;
      if (cap || o.sort === "value") { const e = priceOf.get(k); if (!e) continue; ppm = bestPpm(e); if (cap && ppm > cap) continue; }
      let avoided = 0, w = 0, lovedHit = 0;
      for (const i of ids) { if (avoid.has(i)) avoided++; if (love.has(i)) { w += 1; lovedHit++; } else if (implied.has(i)) w += implied.get(i); }
      const famBad = p[5] >= 0 && famAvoid.has(p[5]);
      if ((avoided || famBad) && !o.showAvoid) continue;
      let sim = 0, simK = -1, dsim = 0, dsimK = -1;
      if (ownMasks.length) { [sim, simK] = best(ownMasks, ids); if (o.hideDupes && sim >= 0.7) continue; }
      if (disMasks.length) { [dsim, dsimK] = best(disMasks, ids); }
      let score = w / Math.sqrt(Math.max(4, ids.length)) - avoided * 1.2 - (famBad ? 1 : 0) + (p[5] >= 0 && famLove.has(p[5]) ? 0.5 : 0);
      if (p[7]) score += (p[7] / 10 - 7) * 0.3 * Math.min(1, p[8] / 20);
      let gaps = [];
      if (ownMasks.length) {
        gaps = ids.filter((i) => love.has(i) && !collNotes.has(i));
        score += Math.min(3, gaps.length) * 0.3;
        if (p[5] >= 0 && !collFams.has(p[5]) && !famBad) score += 0.35;
        score -= sim * 1.2;
      }
      if (dsim >= 0.6) score -= 1.2;
      if (rankOf.has(k)) score += 0.15;
      out.push({ k, score, lovedHit, avoided, gaps, sim, simK, dsim, dsimK, ppm, newFam: ownMasks.length && p[5] >= 0 && !collFams.has(p[5]) });
    }
    const sorts = {
      fit: (a, b) => b.score - a.score,
      rating: (a, b) => ratingScore(b.k) - ratingScore(a.k) || b.score - a.score,
      new: (a, b) => P[b.k][2] - P[a.k][2] || b.score - a.score,
      value: (a, b) => a.ppm - b.ppm || b.score - a.score,
    };
    out.sort(sorts[o.sort] || sorts.fit);
    return { out, hasTaste, love, avoid };
  }

  function renderShop() {
    const o = S.shop;
    const opt = (v, cur, l) => `<option value="${v}"${String(cur) === String(v) ? " selected" : ""}>${l}</option>`;
    $("shop-ctl").innerHTML =
      `<div class="sgrid">` +
      `<label>Family<select data-so="fam"><option value="all">Any</option>${FAMS.map((f, i) => opt(i, o.fam, esc(f))).join("")}</select></label>` +
      `<label>Released<select data-so="since">${opt(0, o.since, "Any year")}${opt(2015, o.since, "2015 or later")}${opt(2020, o.since, "2020 or later")}${opt(2023, o.since, "2023 or later")}</select></label>` +
      `<label>Max price<select data-so="maxppm">${opt(0, o.maxppm, "Any")}${opt(1, o.maxppm, "€1/ml (priced only)")}${opt(2, o.maxppm, "€2/ml")}${opt(3, o.maxppm, "€3/ml")}${opt(5, o.maxppm, "€5/ml")}</select></label>` +
      `<label>Sort<select data-so="sort">${opt("fit", o.sort, "Best fit")}${opt("rating", o.sort, "Highest rated")}${opt("new", o.sort, "Newest")}${opt("value", o.sort, "Cheapest per ml")}</select></label></div>` +
      `<div class="schk"><label><input type="checkbox" data-sc="rated"${o.rated ? " checked" : ""}> Rated only</label>` +
      `<label><input type="checkbox" data-sc="hideDupes"${o.hideDupes ? " checked" : ""}> Hide near-copies of what I own</label>` +
      `<label><input type="checkbox" data-sc="learn"${o.learn ? " checked" : ""}> Learn from my collection</label>` +
      `<label><input type="checkbox" data-sc="showAvoid"${o.showAvoid ? " checked" : ""}> Show perfumes with avoided notes</label></div>`;
    const { out, hasTaste } = shopCompute();
    const loveSet = idxSet(S.love, ix), avoidSet = idxSet(S.avoid, ix);
    const shown = out.slice(0, o.shown);
    const top = out.length ? Math.max(0.01, out[0].score) : 1;
    const noSignal = !S.love.length && !S.famLove.length && !S.own.length;
    $("shop-sum").innerHTML = noSignal
      ? `Nothing to match on yet, so this is ordered by rating. <button class="linkish" data-go="taste">Set your likes</button> or <button class="linkish" data-go="collection">add what you own</button>.`
      : `${fmt(out.length)} candidates · ${S.love.length} loved, ${S.avoid.length} avoided, ${S.own.length} owned.`;
    $("shop-list").innerHTML = shown.map((r) => {
      const why = [];
      if (r.lovedHit) why.push(`<span class="why love">Has ${P[r.k][4].filter((i) => loveSet.has(i)).slice(0, 3).map((i) => esc(notes[i])).join(", ")}</span>`);
      if (r.gaps.length) why.push(`<span class="why gap">New to you: ${r.gaps.slice(0, 3).map((i) => esc(notes[i])).join(", ")}</span>`);
      if (r.newFam) why.push(`<span class="why gap">First ${esc(FAMS[P[r.k][5]])}</span>`);
      if (r.sim >= 0.5) why.push(`<span class="why warn">${Math.round(r.sim * 100)}% like ${esc(P[r.simK][0])} (owned)</span>`);
      if (r.dsim >= 0.6) why.push(`<span class="why warn">Like ${esc(P[r.dsimK][0])}, which you disliked</span>`);
      if (r.avoided) why.push(`<span class="why bad">Has ${P[r.k][4].filter((i) => avoidSet.has(i)).slice(0, 3).map((i) => esc(notes[i])).join(", ")} (avoided)</span>`);
      const fit = noSignal ? "" : `<span class="fit" title="Fit relative to your best candidate">${Math.max(0, Math.min(99, Math.round((r.score / top) * 100)))}</span>`;
      return fragItem(r.k, { ctx: "shop", reasons: why.join("") }).replace('<li class="frag"', `<li class="frag" data-fit="${fit ? 1 : 0}"`).replace('<div class="ft">', `<div class="ft">${fit}`);
    }).join("") || `<li class="empty-li">No matches. Loosen a filter.</li>`;
    $("shop-more").hidden = out.length <= o.shown;
    $("shop-more").textContent = `Show ${Math.min(20, out.length - o.shown)} more`;
  }

  /* ================================================================ events */
  document.addEventListener("click", (e) => {
    const T = (s) => e.target.closest(s);
    let el;
    if ((el = T("[data-tn]"))) { cycle(S.love, S.avoid, notes[+el.dataset.tn]); save(); dirty = true; el.className = "ttile " + state(S.love, S.avoid, notes[+el.dataset.tn]); $("taste-sum").innerHTML = `<b>${S.love.length}</b> loved · <b>${S.avoid.length}</b> avoided · <b>${S.own.length}</b> owned`; return; }
    if ((el = T("[data-tf]"))) { const f = FAMS[+el.dataset.tf]; cycle(S.famLove, S.famAvoid, f); save(); el.className = "ttile " + state(S.famLove, S.famAvoid, f); return; }
    if ((el = T("[data-ta]"))) { const i = +el.dataset.ta, j = S.aud.indexOf(i); if (j >= 0) S.aud.splice(j, 1); else S.aud.push(i); save(); renderTaste(); return; }
    if (T("[data-clear-me]")) { if (confirm("Clear your likes, collection and dislikes from this browser?")) { S = blank(); save(); sync(); renderTaste(); renderCollection(); renderShop(); } return; }
    if (T("[data-export]")) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" }));
      a.download = "my-perfume-taste.json"; document.body.appendChild(a); a.click(); a.remove(); return;
    }
    if ((el = T("[data-go]")) && el.closest("#shop-sum")) { A.show(el.dataset.go, true); return; }
    if (T("#shop-more")) { S.shop.shown += 20; save(); renderShop(); return; }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "import" && t.files[0]) {
      const r = new FileReader();
      r.onload = () => { try { const j = JSON.parse(r.result); S = Object.assign(blank(), j); S.shop = Object.assign(blank().shop, j.shop || {}); save(); sync(); renderTaste(); renderCollection(); renderShop(); } catch (err) { alert("That file isn’t a taste export."); } };
      r.readAsText(t.files[0]); t.value = ""; return;
    }
    if (t.dataset.so) { S.shop[t.dataset.so] = t.value; S.shop.shown = 20; save(); renderShop(); return; }
    if (t.dataset.sc) { S.shop[t.dataset.sc] = t.checked; S.shop.shown = 20; save(); renderShop(); return; }
  });
  $("coll-q").addEventListener("input", collSearch);
  // own/dislike toggles re-render the collection views too
  const baseRefresh = A.refresh;
  A.refresh = () => { baseRefresh(); if (A.view() === "collection") { collSearch(); renderCollection(); } };

  A.hooks.taste = renderTaste;
  A.hooks.collection = () => { renderCollection(); collSearch(); };
  A.hooks.shop = renderShop;

  /* ================================================================ buy: prices, dupes, trending */
  const eur = (v) => (v == null ? "–" : "€" + v.toFixed(2));
  const num = (v) => (v == null ? -1 : v);
  const ratingOf = (k) => (k >= 0 && P[k][7] ? P[k][7] / 10 : 0);
  const noteChips = (k) => k < 0 ? "–" : P[k][4].filter((i) => !/(Notes|Accord)$/.test(notes[i]) && notes[i] !== "Musk").slice(0, 4).map((i) => chip(i)).join("");
  mkTable("t-prices", { sort: "m10", dir: 1, rows: D.priced, cols: [
    { key: "name", label: "Perfume", dir: 1, val: (r) => r.name, html: (r) => `<b>${esc(r.name)}</b> <span class="sub">${esc(r.house)}</span>` },
    { key: "tier", label: "Tier", dir: 1, m: 1, val: (r) => r.tier, html: (r) => r.tier },
    { key: "m3", label: "3 ml", num: 1, m: 1, val: (r) => num(r.m[0]), html: (r) => eur(r.m[0]) },
    { key: "m10", label: "10 ml", num: 1, dir: 1, val: (r) => (r.m[1] == null ? 1e9 : r.m[1]), html: (r) => eur(r.m[1]) },
    { key: "m30", label: "30 ml", num: 1, dir: 1, val: (r) => (r.m[2] == null ? 1e9 : r.m[2]), html: (r) => eur(r.m[2]) },
    { key: "rt", label: "Rating", num: 1, m: 1, val: (r) => ratingOf(r.k), html: (r) => (ratingOf(r.k) ? ratingOf(r.k).toFixed(1) : "–") },
    { key: "notes", label: "Notes", m: 1, html: (r) => noteChips(r.k) },
    { key: "go", label: "", html: (r) => r.slug ? `<a class="act" target="_blank" rel="noopener" href="https://10ml.com/perfumes/${esc(r.slug)}">10ml.com</a>` : "" }] });

  const sim = (v) => (v == null ? "–" : Math.round(v * 100) + "%");
  mkTable("t-dupes", { sort: "save", rows: D.dupes, cols: [
    { key: "o", label: "Original", dir: 1, val: (r) => r.o.name, html: (r) => `<b>${esc(r.o.name)}</b> <span class="sub">${esc(r.o.house)}</span>` },
    { key: "op", label: "€/ml", num: 1, m: 1, val: (r) => r.o.ppm, html: (r) => eur(r.o.ppm) },
    { key: "d", label: "Dupe", dir: 1, val: (r) => r.d.name, html: (r) => `<b>${esc(r.d.name)}</b> <span class="sub">${esc(r.d.house)}</span>` },
    { key: "dp", label: "€/ml", num: 1, val: (r) => r.d.ppm, html: (r) => eur(r.d.ppm) },
    { key: "save", label: "Saving", num: 1, val: (r) => r.save, html: (r) => Math.round(r.save) + "%" },
    { key: "sim", label: "Same notes", num: 1, m: 1, val: (r) => (r.sim == null ? -1 : r.sim), html: (r) => sim(r.sim) }] });

  const dRow = (r) => ({ ...r, ppm: r.k >= 0 && priceOf.has(r.k) ? bestPpm(priceOf.get(r.k)) : null });
  const rk = (id, list, extra) => mkTable(id, { sort: "rank", dir: 1, rows: list.map(dRow), cols: [
    { key: "rank", label: "#", dir: 1, val: (r) => r.rank, html: (r) => r.rank },
    { key: "p", label: "Perfume", dir: 1, val: (r) => r.perfume, html: (r) => `<b>${esc(r.perfume)}</b> <span class="sub">${esc(r.house)}</span>` },
    { key: "ppm", label: "From €/ml", num: 1, m: 1, val: (r) => (r.ppm == null ? 1e9 : r.ppm), dir: 1, html: (r) => eur(r.ppm) },
    { key: "rt", label: "Rating", num: 1, m: 1, val: (r) => ratingOf(r.k), html: (r) => (ratingOf(r.k) ? ratingOf(r.k).toFixed(1) : "–") },
    { key: "notes", label: "Notes", m: 1, html: (r) => noteChips(r.k) }] });
  rk("t-eu", D.demand.europe);
  rk("t-clm", D.demand.climbers);
  rk("t-fal", D.demand.fallers);
  mkTable("t-dh", { sort: "rank", dir: 1, rows: D.demand.houses, cols: [
    { key: "rank", label: "#", dir: 1, val: (r) => r.rank, html: (r) => r.rank },
    { key: "h", label: "House", dir: 1, val: (r) => r.house, html: (r) => `<b>${esc(r.house)}</b>` },
    { key: "s", label: "Share of decant sales", num: 1, val: (r) => r.share || 0, html: (r) => (r.share != null ? r.share + "%" : "–") }] });
  if ($("trend-period")) $("trend-period").textContent = D.demand.period || "";

  /* ================================================================ about: sources */
  mkTable("t-src", { sort: "as_of", rows: D.sources, cols: [
    { key: "name", label: "Source", dir: 1, val: (r) => r.name, html: (r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` },
    { key: "data", label: "Used for", html: (r) => esc(r.data) },
    { key: "license", label: "License", m: 1, val: (r) => r.license, dir: 1, html: (r) => esc(r.license) },
    { key: "as_of", label: "As of", val: (r) => r.as_of, html: (r) => esc(r.as_of) }] });
  const cs = D.cstats;
  if ($("cat-stats")) $("cat-stats").textContent = `${fmt(cs.catalog)} perfumes in the catalog, ${fmt(cs.rated)} with ratings, ${fmt(cs.pyramids)} with top/heart/base notes, ${fmt(cs.priced)} priced (${fmt(cs.priced_matched)} matched to notes).`;

  // first paint for whichever view was opened from the URL
  const v = A.view(); if (A.hooks[v]) A.hooks[v]();
})();
