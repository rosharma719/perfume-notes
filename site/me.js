(function () {
  "use strict";
  const A = window.APP;
  const { D, P, N, notes, ix, FO, FP, F, fs, chip, esc, fmt, pct, times, mobile, fragItem, mkTable, ratingScore, bestPpm, priceOf, rankOf } = A;
  const $ = (id) => document.getElementById(id);
  const GL = A.GL;

  /* ================================================================ state (saved in this browser) */
  const FAMS = D.fam_names;
  const KEY = "wgww.me.v1";
  const blank = () => ({ love: [], avoid: [], famLove: [], famAvoid: [], aud: [], own: [], dis: [],
    shop: { fam: "all", since: "0", maxppm: "0", rated: false, hideDupes: true, showAvoid: false, learn: true, sort: "fit", shown: 20 } });
  // perfumes are stored as {n: name, b: brand, y: year}; older saves used "name|brand|year" strings
  const asEntry = (x) => (typeof x === "string" ? (([n, b, y]) => ({ n: n || "", b: b || "", y: +y || 0 }))(x.split("|")) : x);
  const entryOf = (k) => ({ n: P[k][0], b: P[k][1], y: P[k][2] });
  let needSave = false;
  const normalize = (s) => {
    needSave = needSave || [].concat(s.own || [], s.dis || []).some((x) => typeof x === "string");   // old format: rewrite it once
    s.own = (s.own || []).map(asEntry); s.dis = (s.dis || []).map(asEntry); s.shop = Object.assign(blank().shop, s.shop || {}); return s;
  };
  let S, saveOK = true;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = blank(); }
  normalize(S);
  const status = () => document.querySelectorAll(".save-status").forEach((el) => {
    el.textContent = saveOK ? `Saved on this device · ${S.own.length} owned, ${S.love.length} loved` : "Can’t save in this browser (private mode?). Download a backup to keep your data.";
    el.classList.toggle("bad", !saveOK);
  });
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); saveOK = true; if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); }
    catch (e) { saveOK = false; }
    status(); if (A.ribbon) A.ribbon();
  };

  // match a saved entry to the current catalog: exact, then normalised, then same house + similar words
  const nrm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const GENERIC = new Set(["eau", "de", "du", "la", "le", "les", "the", "of", "and", "parfum", "toilette", "cologne", "edp", "edt", "extrait", "pour"]);
  const wordsOf = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !GENERIC.has(w) && !/^(19|20)\d\d$/.test(w));
  let idx = null;
  function buildIdx() {
    idx = { exact: new Map(), norm: new Map(), brand: new Map() };
    const push = (m, key, k) => { const l = m.get(key); if (l) l.push(k); else m.set(key, [k]); };
    P.forEach((p, k) => { idx.exact.set(p[0] + "|" + p[1] + "|" + p[2], k); push(idx.norm, nrm(p[1]) + "|" + nrm(p[0]), k); push(idx.brand, nrm(p[1]), k); });
  }
  function resolve(e) {
    if (!idx) buildIdx();
    const hit = idx.exact.get(e.n + "|" + e.b + "|" + e.y);
    if (hit !== undefined) return hit;
    const c = idx.norm.get(nrm(e.b) + "|" + nrm(e.n));
    if (c) return c.reduce((a, b) => (Math.abs(P[b][2] - e.y) < Math.abs(P[a][2] - e.y) ? b : a));
    const eb = nrm(e.b);
    const pool = idx.brand.get(eb) || [...idx.brand].filter(([bk]) => bk && eb && (bk.includes(eb) || eb.includes(bk))).flatMap(([, v]) => v);
    const want = new Set(wordsOf(e.n)); let best, bs = 0;
    for (const j of pool) {
      if (e.y && P[j][2] && Math.abs(P[j][2] - e.y) > 1) continue;
      const w = new Set(wordsOf(P[j][0])); let inter = 0; want.forEach((x) => { if (w.has(x)) inter++; });
      const s = inter / (want.size + w.size - inter || 1);
      if (s > bs) { bs = s; best = j; }
    }
    return bs >= 0.6 ? best : undefined;
  }

  let ownK = [], disK = [], ownSet = new Set(), disSet = new Set(), dirty = true, unres = [];
  function sync() {
    unres = []; let healed = false;
    const res = (kind) => {
      const out = [];
      S[kind].forEach((e, i) => {
        const k = resolve(e);
        if (k === undefined) { unres.push({ kind, e }); return; }
        if (!out.includes(k)) out.push(k);
        const ne = entryOf(k);
        if (ne.n !== e.n || ne.b !== e.b || ne.y !== e.y) { S[kind][i] = ne; healed = true; }   // follow the catalog's current spelling
      });
      return out;
    };
    ownK = res("own"); disK = res("dis");
    ownSet = new Set(ownK); disSet = new Set(disK); dirty = true;
    if (healed || needSave) { needSave = false; save(); } else { status(); if (A.ribbon) A.ribbon(); }
  }
  sync();
  // palette for the top ribbon: your collection, else the notes you love
  A.palette = () => {
    const w = D.families.map(() => 0);
    if (ownK.length) { ownK.forEach((k) => A.famMix(k).forEach((v, i) => (w[i] += v))); return { w, cap: "Your collection" }; }
    const love = idxSet(S.love, ix);
    if (love.size) { love.forEach((i) => (w[FO[i]] += A.wNote[i])); return { w, cap: "Notes you love" }; }
    return null;
  };
  const idxSet = (names, map) => new Set(names.map((n) => map.get(n)).filter((x) => x !== undefined));

  A.me = {
    isOwn: (k) => ownSet.has(k), isDis: (k) => disSet.has(k),
    toggle(kind, k) {
      const other = kind === "own" ? "dis" : "own";
      const without = (list) => list.filter((e) => resolve(e) !== k);
      const rest = without(S[kind]);
      if (rest.length !== S[kind].length) S[kind] = rest;
      else { S[kind].push(entryOf(k)); S[other] = without(S[other]); }
      save(); sync();
    },
  };

  // backup: a file, or a link that carries the profile so it opens on another device
  const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
  const packed = () => ({ l: S.love, a: S.avoid, fl: S.famLove, fa: S.famAvoid, au: S.aud, o: S.own.map((e) => [e.n, e.b, e.y]), d: S.dis.map((e) => [e.n, e.b, e.y]) });
  const backupLink = () => location.href.split("#")[0] + "#me=" + b64(JSON.stringify(packed()));
  function loadPacked(c) {
    const keepShop = S.shop;
    S = Object.assign(blank(), { love: c.l || [], avoid: c.a || [], famLove: c.fl || [], famAvoid: c.fa || [], aud: c.au || [],
      own: (c.o || []).map(([n, b, y]) => ({ n, b, y })), dis: (c.d || []).map(([n, b, y]) => ({ n, b, y })), shop: keepShop });
    normalize(S); save(); sync();
  }
  const rerenderAll = () => { renderTaste(); renderCollection(); renderShop(); };
  function copyText(text, btn, label) {
    const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = label), 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt("Copy this link", text));
    else window.prompt("Copy this link", text);
  }

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
    $("coll-unres").innerHTML = unres.length
      ? `<p class="unres"><b>${unres.length} saved ${unres.length === 1 ? "perfume" : "perfumes"} couldn’t be matched</b> after a data update. They’re kept; search above to re-add, or remove them.</p>` +
        unres.map((u, i) => `<div class="unres-row"><span>${esc(u.e.n)} <i>${esc(u.e.b)}${u.e.y ? " · " + u.e.y : ""} · ${u.kind === "own" ? "owned" : "disliked"}</i></span><button class="act" data-unres="${i}">Remove</button></div>`).join("")
      : "";
    status();
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
    const pal = new Array(D.families.length).fill(0);
    ownK.forEach((k) => A.famMix(k).forEach((v, i) => (pal[i] += v / ownK.length)));
    const palTop = pal.map((v, i) => [v, i]).filter((x) => x[0] >= 0.05).sort((x, y) => y[0] - x[0]);
    const palette = `<div class="palette"><h3>Your palette</h3><span class="mix big">${palTop.map(([v, i]) => `<i style="width:${v * 100}%;background:${FP[i][1]}"></i>`).join("")}</span>` +
      `<div class="pal-key">${palTop.slice(0, 5).map(([v, i]) => `<span><i style="background:${FP[i][1]}"></i>${esc(D.families[i])} ${Math.round(v * 100)}%</span>`).join("")}</div></div>`;
    el.innerHTML = palette + `<div class="an-grid">` +
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
    const sig = ownK.join(",") + "#" + disK.join(",") + "#" + S.shop.learn;
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
      if (p[7]) score += (ratingScore(k) - 7.2) * 0.5;
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
    if (T("[data-clear-me]")) { if (confirm("Clear your likes, collection and dislikes from this browser?")) { S = blank(); save(); sync(); rerenderAll(); } return; }
    if ((el = T("[data-backup-link]"))) { copyText(backupLink(), el, "Copy backup link"); return; }
    if ((el = T("[data-unres]"))) { const u = unres[+el.dataset.unres]; if (u) { S[u.kind].splice(S[u.kind].indexOf(u.e), 1); save(); sync(); renderCollection(); } return; }
    if (T("[data-export]")) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" }));
      a.download = "my-perfume-collection.json"; document.body.appendChild(a); a.click(); a.remove(); return;
    }
    if ((el = T("[data-go]")) && el.closest("#shop-sum")) { A.show(el.dataset.go, true); return; }
    if (T("#shop-more")) { S.shop.shown += 20; save(); renderShop(); return; }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if ((t.id === "import" || t.id === "import2") && t.files[0]) {
      const r = new FileReader();
      r.onload = () => { try { S = Object.assign(blank(), JSON.parse(r.result)); normalize(S); save(); sync(); rerenderAll(); } catch (err) { alert("That file isn’t a taste export."); } };
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
    { key: "mix", label: "Profile", m: 1, html: (r) => A.mixBar(r.k) },
    { key: "notes", label: "Notes", m: 1, html: (r) => noteChips(r.k) },
    { key: "go", label: "", html: (r) => r.slug ? `<a class="act" target="_blank" rel="noopener" href="https://10ml.com/perfumes/${esc(r.slug)}">10ml.com</a>` : "" }] });

  const sim = (v) => (v == null ? "–" : Math.round(v * 100) + "%");
  mkTable("t-dupes", { sort: "save", rows: D.dupes, cols: [
    { key: "o", label: "Original", dir: 1, val: (r) => r.o.name, html: (r) => `<b>${esc(r.o.name)}</b> <span class="sub">${esc(r.o.house)}</span>` },
    { key: "op", label: "€/ml", num: 1, m: 1, val: (r) => r.o.ppm, html: (r) => eur(r.o.ppm) },
    { key: "d", label: "Dupe", dir: 1, val: (r) => r.d.name, html: (r) => `<b>${esc(r.d.name)}</b> <span class="sub">${esc(r.d.house)}</span>` },
    { key: "dp", label: "€/ml", num: 1, val: (r) => r.d.ppm, html: (r) => eur(r.d.ppm) },
    { key: "save", label: "Saving", num: 1, val: (r) => r.save, html: (r) => Math.round(r.save) + "%" },
    { key: "sim", label: "Same notes", num: 1, m: 1, val: (r) => (r.sim == null ? -1 : r.sim), html: (r) => sim(r.sim) },
    { key: "mix", label: "Original / dupe profile", m: 1, html: (r) => `<span class="mix2">${A.mixBar(r.o.k)}${A.mixBar(r.d.k)}</span>` }] });

  const dRow = (r) => ({ ...r, ppm: r.k >= 0 && priceOf.has(r.k) ? bestPpm(priceOf.get(r.k)) : null });
  const rk = (id, list, extra) => mkTable(id, { sort: "rank", dir: 1, rows: list.map(dRow), cols: [
    { key: "rank", label: "#", dir: 1, val: (r) => r.rank, html: (r) => r.rank },
    { key: "p", label: "Perfume", dir: 1, val: (r) => r.perfume, html: (r) => `<b>${esc(r.perfume)}</b> <span class="sub">${esc(r.house)}</span>` },
    { key: "ppm", label: "From €/ml", num: 1, m: 1, val: (r) => (r.ppm == null ? 1e9 : r.ppm), dir: 1, html: (r) => eur(r.ppm) },
    { key: "rt", label: "Rating", num: 1, m: 1, val: (r) => ratingOf(r.k), html: (r) => (ratingOf(r.k) ? ratingOf(r.k).toFixed(1) : "–") },
    { key: "mix", label: "Profile", m: 1, html: (r) => A.mixBar(r.k) },
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
  if ($("build-stamp")) $("build-stamp").textContent = window.BUILD || "unknown";
  const cs = D.cstats;
  if ($("cat-stats")) $("cat-stats").textContent = `${fmt(cs.raw_records)} source records were merged into ${fmt(cs.catalog)} perfumes (${fmt(cs.merged)} duplicates folded together, ${cs.brand_aliases} brand spellings unified, ${cs.new_notes} notes added). ${fmt(cs.rated)} have ratings, ${fmt(cs.pyramids)} have top/heart/base notes, ${fmt(cs.priced)} are priced (${fmt(cs.priced_matched)} matched to notes).`;

  if (A.pendingMe) {
    try {
      const c = JSON.parse(unb64(A.pendingMe));
      if (confirm(`Load the profile in this link (${(c.o || []).length} owned, ${(c.l || []).length} loved notes)? It replaces what’s saved on this device.`)) { loadPacked(c); A.show("collection", true); }
    } catch (err) { alert("That link doesn’t contain a saved profile."); }
  }
  status();
  // first paint for whichever view was opened from the URL
  const v = A.view(); if (A.hooks[v]) A.hooks[v]();
})();
