(function () {
  "use strict";
  const D = window.DATA, N = D.n, notes = D.notes, F = D.freq, P = D.perfumes, FO = D.family_of;
  const ix = new Map(notes.map((n, i) => [n, i]));
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => n.toLocaleString("en-US");
  const pct = (x) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + "%";
  const times = (x) => (x >= 10 ? x.toFixed(0) : x.toFixed(1)) + "×";
  const mobile = () => window.matchMedia("(max-width:980px)").matches;
  const GL = ["men’s", "women’s", "unisex"];

  // family palette: [pale tint, mid tone, deep tone]
  const FP = [
    ["#fbf1c7", "#f1d66a", "#7a6100"], ["#fbe5ed", "#f1b3c8", "#a03a5c"], ["#fadbd7", "#ee9f98", "#a5352d"],
    ["#ece1d4", "#cfb08c", "#6a4a2a"], ["#fbe4cb", "#f0b97c", "#97580f"], ["#e9e4ee", "#c6bad1", "#5e4e70"],
    ["#f4ddf0", "#dba6d3", "#86307a"], ["#e0f3de", "#aadda6", "#2e7733"], ["#f8dccf", "#e69f84", "#983b1d"],
    ["#d9efe4", "#92d1b0", "#1e6844"], ["#dae8f8", "#9dc4ee", "#235a98"], ["#e3e7d5", "#b5c093", "#54672b"],
  ];
  const fs = (i) => `--p:${FP[FO[i]][0]};--m:${FP[FO[i]][1]};--d:${FP[FO[i]][2]}`;

  $("n-perf").textContent = fmt(N);
  $("n-notes").textContent = notes.length;
  const avgAll = P.reduce((a, p) => a + p[4].length, 0) / N;
  $("avg-size").textContent = avgAll.toFixed(1);

  const has = notes.map(() => new Uint8Array(N));
  P.forEach((p, k) => p[4].forEach((i) => (has[i][k] = 1)));

  /* ---------- board ---------- */
  const board = $("board");
  const byFam = D.families.map(() => []);
  notes.forEach((n, i) => byFam[FO[i]].push(i));
  board.innerHTML = byFam.map((list, fi) =>
    `<div class="fam" data-f="${fi}"><h4><button data-fam="${fi}">${esc(D.families[fi])}</button></h4><div class="g">` +
    list.map((i) => `<button class="tile" data-i="${i}" style="${fs(i)}" title="${fmt(F[i])} perfumes"><span class="nm">${esc(notes[i])}</span><span class="lf"></span></button>`).join("") +
    "</div></div>").join("");
  const tiles = [...board.querySelectorAll(".tile")];
  const tileOf = new Map(tiles.map((t) => [+t.dataset.i, t]));

  /* ---------- state ---------- */
  let sel = [], tab = "pairs", ctx = null, lastOut = [], lookupOpen = false, solo = null;
  const fo = { gender: "all", family: "all", origin: "all", sort: "clean", near: false, q: "", shown: 15 };
  const chip = (i, attr) => `<button class="chip" ${attr || `data-set="${esc(notes[i])}"`} style="${fs(i)}">${esc(notes[i])}</button>`;
  const chips = (names) => names.map((n) => chip(ix.get(n))).join("");
  const act = (names, label) => `<button class="act" data-set="${esc(names.join("|"))}" data-go="frags">${label}</button>`;

  /* ---------- views + url ---------- */
  const GROUPS = [
    { id: "explore", label: "Explore", views: [["explore", "Explore"]] },
    { id: "combos", label: "Combos", views: [["pairs", "Pairs"], ["trios", "Trios"], ["swap", "Stand-ins"], ["avoid", "Avoided"]] },
    { id: "notes", label: "Notes", views: [["trends", "Trends"], ["formulas", "Formula size"], ["audience", "Audience"]] },
    { id: "styles", label: "Styles", views: [["families", "Families"], ["regions", "Regions"], ["houses", "Houses"]] },
    { id: "market", label: "Market", views: [["market", "By year"]] },
    { id: "about", label: "About", views: [["about", "About"]] },
  ];
  const VIEWS = GROUPS.flatMap((g) => g.views.map((v) => v[0]));
  const groupOf = (v) => GROUPS.find((g) => g.views.some((x) => x[0] === v));
  const lastIn = {};
  let view = "explore";
  const tabbar = $("tabbar"), panes = [...document.querySelectorAll(".pane")];
  $("ptabs").innerHTML = GROUPS.map((g) => `<button class="pt" role="tab" data-group="${g.id}">${g.label}</button>`).join("");
  function writeHash() {
    const p = [];
    if (view !== "explore") p.push("v=" + view);
    if (sel.length) p.push("n=" + encodeURIComponent(sel.map((i) => notes[i]).join(",")));
    if (sel.length && tab === "frags") p.push("t=frags");
    try { history.replaceState(null, "", location.pathname + location.search + (p.length ? "#" + p.join("&") : "")); } catch (e) {}
  }
  function syncTabH() { document.documentElement.style.setProperty("--tabh", tabbar.offsetHeight + "px"); }
  window.addEventListener("resize", syncTabH);
  function show(v, scroll) {
    if (!VIEWS.includes(v)) v = "explore";
    view = v;
    const g = groupOf(v); lastIn[g.id] = v;
    panes.forEach((p) => (p.hidden = p.dataset.view !== v));
    document.querySelectorAll(".pt").forEach((b) => { const on = b.dataset.group === g.id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $("sbar").hidden = g.views.length < 2;
    $("stabs").innerHTML = g.views.length < 2 ? "" : g.views.map(([id, label]) => `<button class="st${id === v ? " on" : ""}" role="tab" data-view="${id}">${label}</button>`).join("");
    document.body.dataset.view = v;
    if (v !== "explore") $("panel").classList.remove("open");
    writeHash(); syncTabH();
    if (scroll) { const top = tabbar.offsetTop; if (window.scrollY > top) window.scrollTo(0, top); }
  }
  const vis = () => document.body.classList.toggle("has-sel", sel.length > 0 || lookupOpen);

  /* ---------- clicks ---------- */
  document.addEventListener("click", (e) => {
    const panel = $("panel"), T = (s) => e.target.closest(s);
    if (mobile() && panel.classList.contains("open") && !T("#panel")) {
      panel.classList.remove("open");
      if (!sel.length) { lookupOpen = false; vis(); }
    }
    let el;
    if ((el = T(".pt"))) { const g = GROUPS.find((x) => x.id === el.dataset.group); show(lastIn[g.id] || g.views[0][0], true); return; }
    if ((el = T(".st"))) { show(el.dataset.view, true); return; }
    if ((el = T("[data-sort]"))) { sortBy(...el.dataset.sort.split(":")); return; }
    if ((el = T("[data-tab]"))) {
      const same = tab === el.dataset.tab;
      tab = el.dataset.tab;
      if (mobile()) panel.classList.toggle("open", !(same && panel.classList.contains("open")));
      writeHash(); renderPanel(true); return;
    }
    if ((el = T("[data-fo]"))) { const [k, v] = el.dataset.fo.split(":"); fo[k] = v; fo.shown = 15; renderPanel(); return; }
    if (T("[data-more]")) { fo.shown += 15; renderFrags(); return; }
    if ((el = T("[data-sim]"))) { toggleSim(+el.dataset.sim, el); return; }
    if (T("[data-csv]")) { downloadCsv(); return; }
    if ((el = T("[data-copy]"))) { copyLink(el); return; }
    if ((el = T("[data-house]"))) { goHouse(el.dataset.house); return; }
    if ((el = T("[data-filt]"))) { goFilter(...el.dataset.filt.split(":")); return; }
    if (T("#lookup")) { openLookup(); return; }
    if (T("#clear")) { setSel([]); return; }
    if ((el = T("[data-fam]"))) { const v = +el.dataset.fam; solo = solo === v ? null : v; applySolo(); return; }
    if ((el = T(".tile, [data-tog]"))) {
      toggle(+(el.dataset.i ?? el.dataset.tog));
      if (el.classList.contains("tile")) panel.classList.remove("open");
      return;
    }
    if ((el = T("[data-set]"))) {
      tab = el.dataset.go === "frags" ? "frags" : "pairs";
      setSel(el.dataset.set.split("|").map((n) => ix.get(n)));
      if (view !== "explore") show("explore", true); else $("table").scrollIntoView({ behavior: "smooth" });
      if (mobile() && tab === "frags") panel.classList.add("open");
      return;
    }
    if (T(".phead") && mobile()) panel.classList.toggle("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); if (view !== "explore") show("explore", true); $("q").focus();
    }
  });
  $("panel").addEventListener("input", (e) => { if (e.target.id === "fq") { fo.q = e.target.value; fo.shown = 15; renderFrags(); } });
  $("panel").addEventListener("change", (e) => {
    if (e.target.id === "fsort") { fo.sort = e.target.value; fo.shown = 15; renderFrags(); }
    if (e.target.id === "ffam") { fo.family = e.target.value; fo.shown = 15; renderFrags(); }
    if (e.target.id === "forg") { fo.origin = e.target.value; fo.shown = 15; renderFrags(); }
    if (e.target.id === "fnear") { fo.near = e.target.checked; fo.shown = 15; renderFrags(); }
  });
  function applyFilter(input) {
    const v = input.value.trim().toLowerCase();
    input.dataset.filter.split(",").forEach((id) => [...$(id).tBodies[0].rows].forEach((r) => (r.hidden = !!v && !r.textContent.toLowerCase().includes(v))));
  }
  document.addEventListener("input", (e) => { if (e.target.classList && e.target.classList.contains("tabfilter")) applyFilter(e.target); });

  function toggle(i) { setSel(sel.includes(i) ? sel.filter((x) => x !== i) : sel.concat(i)); }
  function setSel(list) {
    const was = sel.length;
    sel = list.filter((i) => i !== undefined);
    if (!was && sel.length) fo.sort = "clean";
    if (!sel.length) lookupOpen = false;
    fo.shown = 15;
    render(); writeHash();
  }
  function openLookup() {
    setSel([]); lookupOpen = true; fo.sort = "new"; vis(); renderPanel(true);
    if (mobile()) $("panel").classList.add("open");
    setTimeout(() => { const f = $("fq"); if (f) f.focus(); }, 50);
  }
  function goHouse(brand) {
    setSel([]); lookupOpen = true; fo.sort = "new"; fo.q = brand; fo.gender = "all"; fo.family = "all"; fo.origin = "all"; vis();
    show("explore", true); renderPanel(true);
    if (mobile()) $("panel").classList.add("open");
  }
  function goFilter(kind, idx) {
    setSel([]); lookupOpen = true; fo.sort = "new"; fo.q = ""; fo.gender = "all"; fo.family = kind === "fam" ? idx : "all"; fo.origin = kind === "reg" ? idx : "all"; vis();
    show("explore", true); renderPanel(true);
    if (mobile()) $("panel").classList.add("open");
  }
  function copyLink(btn) {
    const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy link"), 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, () => window.prompt("Copy link", location.href));
    else window.prompt("Copy link", location.href);
  }

  /* ---------- find a note ---------- */
  const q = $("q");
  function find() {
    const v = q.value.trim().toLowerCase();
    board.classList.toggle("searching", !!v);
    tiles.forEach((t) => t.classList.toggle("hit", !!v && notes[+t.dataset.i].toLowerCase().includes(v)));
  }
  q.addEventListener("input", find);
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const h = board.querySelector(".tile.hit"); if (h) { toggle(+h.dataset.i); q.value = ""; find(); q.blur(); } }
    if (e.key === "Escape") { q.value = ""; find(); q.blur(); }
  });
  function applySolo() {
    board.classList.toggle("solo", solo !== null);
    board.querySelectorAll(".fam").forEach((el) => el.classList.toggle("on", +el.dataset.f === solo));
  }

  /* ---------- relight + panel ---------- */
  function render() {
    vis();
    $("clear").hidden = !sel.length;
    board.classList.toggle("rel", sel.length > 0);
    tiles.forEach((t) => { t.classList.remove("sel", "cold"); t.style.removeProperty("--s"); t.querySelector(".lf").textContent = ""; });
    if (!sel.length) { ctx = null; $("panel").classList.remove("open"); renderPanel(true); return; }

    const match = [];
    for (let k = 0; k < N; k++) { let ok = 1; for (const i of sel) if (!has[i][k]) { ok = 0; break; } if (ok) match.push(k); }
    const M = match.length;
    const cnt = new Int32Array(notes.length);
    let sizeSum = 0;
    for (const k of match) { sizeSum += P[k][4].length; for (const i of P[k][4]) cnt[i]++; }
    const cand = [];
    for (let i = 0; i < notes.length; i++) {
      if (sel.includes(i)) continue;
      const share = M ? cnt[i] / M : 0, base = F[i] / N;
      cand.push({ i, c: cnt[i], share, lift: share / base, exp: M * base });
    }
    // colour = how strongly a note pairs relative to the other notes for this selection
    const ls = cand.filter((d) => d.c >= 3).map((d) => d.lift).sort((a, b) => a - b);
    const at = (p) => (ls.length ? ls[Math.min(ls.length - 1, Math.floor(p * (ls.length - 1)))] : 1);
    const lo = Math.max(1, at(0.5)), hi = Math.max(at(0.93), lo + 0.4);
    sel.forEach((i) => tileOf.get(i).classList.add("sel"));
    cand.forEach((d) => {
      const t = tileOf.get(d.i);
      const s = !M || d.c < 3 ? 0 : Math.max(0, Math.min(1, (d.lift - lo) / (hi - lo)));
      t.style.setProperty("--s", s.toFixed(2));
      if (!M || d.c === 0) t.classList.add("cold");
      if (s >= 0.35 && d.c >= 5) t.querySelector(".lf").textContent = times(d.lift);
    });
    ctx = { M, cand, sizeSum, match };
    renderPanel(true);
  }

  function renderPanel(top) {
    const panel = $("panel");
    if (!ctx) {
      panel.innerHTML = `<div class="phead"><p class="empty-t">Browse fragrances</p></div><div class="pbody">${fragsHTML()}</div>`;
      renderFrags(); if (top) panel.scrollTop = 0; return;
    }
    const { M, sizeSum } = ctx;
    let h = `<div class="phead"><div class="sels">${sel.map((i) => chip(i, `data-tog="${i}"`)).join("")}</div>` +
      `<p class="count"><b>${fmt(M)}</b> perfumes <small>${pct(M / N)}${M ? ` · avg ${(sizeSum / M).toFixed(1)} notes` : ""}</small></p>` +
      `<div class="tabs" role="tablist"><button class="tab${tab === "pairs" ? " on" : ""}" role="tab" data-tab="pairs">Pairings</button>` +
      `<button class="tab${tab === "frags" ? " on" : ""}" role="tab" data-tab="frags">Fragrances <i>${fmt(M)}</i></button></div></div><div class="pbody">`;
    h += tab === "frags" ? fragsHTML() : pairsHTML();
    panel.innerHTML = h + "</div>";
    if (tab === "frags") renderFrags();
    if (top) panel.scrollTop = 0;
  }

  function pairsHTML() {
    const { M, cand } = ctx;
    if (!M) return `<p class="hint">No perfume has all of these. The Fragrances tab shows near matches.</p>`;
    const often = cand.filter((d) => d.c > 0).sort((a, b) => b.share - a.share).slice(0, 7);
    const minC = Math.max(8, Math.round(M * 0.04));
    const distinct = cand.filter((d) => d.c >= minC && d.lift > 1.2).sort((a, b) => b.lift - a.lift).slice(0, 7);
    const seldom = cand.filter((d) => d.exp >= Math.max(6, M * 0.03) && F[d.i] >= 250).sort((a, b) => a.lift - b.lift).slice(0, 6);
    const list = (arr, bar, val) => arr.length
      ? `<ul class="plist">` + arr.map((d) => `<li style="${fs(d.i)}">${chip(d.i, `data-tog="${d.i}"`)}<span class="bar"><i style="width:${bar(d)}%"></i></span><span class="v">${val(d)}</span></li>`).join("") + "</ul>"
      : `<p class="hint">Too few perfumes.</p>`;
    let h = `<button class="cta" data-tab="frags">Fragrances <b>${fmt(M)}</b></button>`;
    h += `<h5>Most often with</h5>` + list(often, (d) => (d.share / often[0].share) * 100, (d) => pct(d.share));
    h += `<h5>Unusually often with</h5>` + list(distinct, (d) => (d.lift / distinct[0].lift) * 100, (d) => times(d.lift));
    h += `<h5>Rarely with <span>seen / expected</span></h5>` + list(seldom, (d) => Math.max(2, (1 - d.lift) * 100), (d) => d.c + "/" + Math.round(d.exp));
    if (sel.length === 1 && D.similar[sel[0]].length) {
      h += `<h5>Stand-ins <span>similar partners</span></h5><ul class="plist">` +
        D.similar[sel[0]].slice(0, 5).map(([j, s]) => `<li style="${fs(j)}">${chip(j, `data-tog="${j}"`)}<span class="bar"><i style="width:${Math.round(s * 100)}%"></i></span><span class="v">${Math.round(s * 100)}%</span></li>`).join("") + "</ul>";
    }
    return h;
  }

  /* ---------- fragrance finder ---------- */
  function fragsHTML() {
    const seg = (key, opts) => `<div class="seg">` + opts.map(([v, l]) => `<button data-fo="${key}:${v}" class="${fo[key] === v ? "on" : ""}">${l}</button>`).join("") + "</div>";
    return `<div class="fctl"><input id="fq" type="search" placeholder="${sel.length ? "Filter by name or brand" : "Name or brand"}" value="${esc(fo.q)}" autocomplete="off" spellcheck="false" aria-label="Name or brand">` +
      seg("gender", [["all", "All"], ["0", "Men’s"], ["1", "Women’s"], ["2", "Unisex"]]) +
      `<div class="fsel"><label>Family <select id="ffam"><option value="all">Any</option>${D.fam_names.map((n, i) => `<option value="${i}"${fo.family === String(i) ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>` +
      `<label>Country <select id="forg"><option value="all">Any</option>${D.org_names.map((n, i) => `<option value="${i}"${fo.origin === String(i) ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label></div>` +
      `<label class="sort">Sort <select id="fsort">` +
      [["clean", "Simplest first"], ["new", "Newest first"], ["rich", "Most complex first"]].map(([v, l]) => `<option value="${v}"${fo.sort === v ? " selected" : ""}>${l}</option>`).join("") + `</select></label>` +
      (sel.length >= 2 ? `<label class="chk"><input type="checkbox" id="fnear"${fo.near || ctx.M === 0 ? " checked" : ""}${ctx.M === 0 ? " disabled" : ""}> Include perfumes missing one note</label>` : "") +
      `</div><p class="fline"><span id="fcount"></span><span>${sel.length ? `<button class="linkish" data-copy>Copy link</button>` : ""}<button class="linkish" data-csv>CSV</button></span></p>` +
      `<ul class="flist" id="fraglist"></ul><button class="more" id="fmore" data-more hidden></button>`;
  }

  function runFrags() {
    const need = sel.length, near = (fo.near || (ctx && ctx.M === 0)) && need >= 2;
    const qq = fo.q.trim().toLowerCase();
    if (need === 0 && qq.length < 2 && fo.family === "all" && fo.origin === "all") return null;
    const out = [];
    for (let k = 0; k < N; k++) {
      let sc = 0; for (const i of sel) sc += has[i][k];
      if (need && (!sc || sc < (near ? need - 1 : need))) continue;
      const p = P[k];
      if (fo.gender !== "all" && String(p[3]) !== fo.gender) continue;
      if (fo.family !== "all" && String(p[5]) !== fo.family) continue;
      if (fo.origin !== "all" && String(p[6]) !== fo.origin) continue;
      if (qq && !(p[0] + " " + p[1]).toLowerCase().includes(qq)) continue;
      out.push({ k, sc });
    }
    const len = (o) => P[o.k][4].length;
    const by = {
      clean: (a, b) => b.sc - a.sc || len(a) - len(b) || P[b.k][2] - P[a.k][2],
      new: (a, b) => b.sc - a.sc || P[b.k][2] - P[a.k][2] || len(a) - len(b),
      rich: (a, b) => b.sc - a.sc || len(b) - len(a) || P[b.k][2] - P[a.k][2],
    };
    out.sort(by[fo.sort]);
    return { out, near };
  }

  function renderFrags() {
    const res = runFrags();
    if (!res) { lastOut = []; $("fcount").textContent = "Type 2+ letters, or pick a family or country"; $("fraglist").innerHTML = ""; $("fmore").hidden = true; return; }
    const { out, near } = res; lastOut = out;
    const selSet = new Set(sel);
    $("fcount").textContent = out.length ? `${fmt(out.length)} ${out.length === 1 ? "fragrance" : "fragrances"}${near ? " (some missing a note)" : ""}` : "No matches";
    $("fraglist").innerHTML = out.slice(0, fo.shown).map(({ k }) => {
      const [name, brand, year, g, ids, fi, oi] = P[k];
      const mine = ids.filter((i) => selSet.has(i)), rest = ids.filter((i) => !selSet.has(i));
      const missing = sel.filter((i) => !ids.includes(i)).map((i) => notes[i]);
      return `<li class="frag"><div class="ft"><b>${esc(name)}</b> <span>${esc(brand)}</span></div>` +
        `<div class="fm">${year || "n/a"} · ${GL[g]}${fi >= 0 ? " · " + esc(D.fam_names[fi]) : ""}${oi >= 0 ? " · " + esc(D.org_names[oi]) : ""} · ${ids.length} ${ids.length === 1 ? "note" : "notes"}${missing.length ? ` · <u>missing ${esc(missing.join(", "))}</u>` : ""}</div>` +
        `<div class="fn">${mine.map((i) => `<span class="n hit" style="${fs(i)}">${esc(notes[i])}</span>`).join("")}` +
        rest.slice(0, 9).map((i) => `<span class="n">${esc(notes[i])}</span>`).join("") +
        (rest.length > 9 ? `<span class="n more">+${rest.length - 9}</span>` : "") + `</div>` +
        `<div class="facts"><button class="linkish" data-sim="${k}">Similar</button>` +
        `<a class="linkish" target="_blank" rel="noopener" href="https://duckduckgo.com/?q=${encodeURIComponent(name + " " + brand + " perfume")}">Search</a></div>` +
        `<div class="sim" id="sim-${k}" hidden></div></li>`;
    }).join("");
    const more = $("fmore");
    more.hidden = out.length <= fo.shown;
    more.textContent = `Show ${Math.min(15, out.length - fo.shown)} more`;
  }

  // closest perfumes by note-list overlap (Jaccard)
  function simHTML(k) {
    const mine = new Uint8Array(notes.length);
    P[k][4].forEach((i) => (mine[i] = 1));
    const lk = P[k][4].length, scored = [];
    for (let j = 0; j < N; j++) {
      if (j === k) continue;
      const ids = P[j][4]; let inter = 0;
      for (const i of ids) inter += mine[i];
      if (!inter) continue;
      const score = inter / (lk + ids.length - inter);
      if (score < 0.2 || (P[j][0] === P[k][0] && P[j][1] === P[k][1])) continue;
      scored.push({ j, score });
    }
    scored.sort((a, b) => b.score - a.score || P[b.j][2] - P[a.j][2]);
    if (!scored.length) return `<p class="hint">No close matches.</p>`;
    return `<ul class="simlist">` + scored.slice(0, 8).map(({ j, score }) => {
      const ids = P[j][4];
      return `<li><div><b>${esc(P[j][0])}</b> <span>${esc(P[j][1])}</span> <em>${Math.round(score * 100)}%</em></div>` +
        `<div class="fn">${ids.slice().sort((a, b) => mine[b] - mine[a]).slice(0, 10).map((i) => mine[i] ? `<span class="n hit" style="${fs(i)}">${esc(notes[i])}</span>` : `<span class="n">${esc(notes[i])}</span>`).join("")}${ids.length > 10 ? `<span class="n more">+${ids.length - 10}</span>` : ""}</div></li>`;
    }).join("") + "</ul>";
  }
  function toggleSim(k, btn) {
    const box = $("sim-" + k);
    if (box.hidden) { if (!box.innerHTML) box.innerHTML = simHTML(k); box.hidden = false; btn.textContent = "Hide"; }
    else { box.hidden = true; btn.textContent = "Similar"; }
  }
  function downloadCsv() {
    if (!lastOut.length) return;
    const rows = [["name", "brand", "year", "audience", "family", "country", "note_count", "notes"]];
    lastOut.forEach(({ k }) => { const p = P[k]; rows.push([p[0], p[1], p[2] || "", GL[p[3]], p[5] >= 0 ? D.fam_names[p[5]] : "", p[6] >= 0 ? D.org_names[p[6]] : "", p[4].length, p[4].map((i) => notes[i]).join("; ")]); });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "fragrances" + (sel.length ? "-" + sel.map((i) => notes[i].toLowerCase().replace(/\W+/g, "")).join("-") : "") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- sortable tables ---------- */
  const tables = {};
  function mkTable(id, spec) { tables[id] = { spec, sort: spec.sort, dir: spec.dir || -1 }; drawTable(id); }
  function drawTable(id) {
    const t = tables[id], { cols, rows } = t.spec, c0 = cols.find((c) => c.key === t.sort);
    const data = rows.slice().sort((a, b) => { const x = c0.val(a), y = c0.val(b); return t.dir * (x > y ? 1 : x < y ? -1 : 0); });
    $(id).innerHTML =
      `<thead><tr>${cols.map((c) => `<th class="${c.num ? "num" : ""}${c.m ? " hide-m" : ""}">${c.val ? `<button data-sort="${id}:${c.key}"${t.sort === c.key ? ' class="on"' : ""}>${c.label}${t.sort === c.key ? (t.dir < 0 ? " ↓" : " ↑") : ""}</button>` : c.label}</th>`).join("")}</tr></thead>` +
      `<tbody>${data.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}${c.m ? " hide-m" : ""}">${c.html(r)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    const f = document.querySelector(`.tabfilter[data-filter*="${id}"]`);
    if (f && f.value) applyFilter(f);
  }
  function sortBy(id, key) {
    const t = tables[id], c = t.spec.cols.find((x) => x.key === key);
    if (t.sort === key) t.dir = -t.dir; else { t.sort = key; t.dir = c.dir || -1; }
    drawTable(id);
  }
  const go = (names, label) => ({ key: "go", label: "", html: (r) => act(names(r), label) });
  const sgn = (x, d) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

  mkTable("t-pairs", { sort: "lift", rows: D.surprising, cols: [
    { key: "pair", label: "Pair", dir: 1, val: (r) => r.a, html: (r) => chips([r.a, r.b]) },
    { key: "lift", label: "Lift", num: 1, val: (r) => r.lift, html: (r) => times(r.lift) },
    { key: "n", label: "Perfumes", num: 1, m: 1, val: (r) => r.n, html: (r) => fmt(r.n) },
    go((r) => [r.a, r.b], "Fragrances")] });

  const tm = new Map(); [...D.trios, ...D.trios_common].forEach((d) => tm.set(d.notes.join("|"), d));
  mkTable("t-trios", { sort: "lift", rows: [...tm.values()], cols: [
    { key: "notes", label: "Notes", dir: 1, val: (r) => r.notes[0], html: (r) => chips(r.notes) },
    { key: "lift", label: "Lift", num: 1, val: (r) => r.lift, html: (r) => times(r.lift) },
    { key: "n", label: "Perfumes", num: 1, m: 1, val: (r) => r.n, html: (r) => fmt(r.n) },
    go((r) => r.notes, "Fragrances")] });

  mkTable("t-swap", { sort: "sim", rows: D.understudies, cols: [
    { key: "pair", label: "Pair", dir: 1, val: (r) => r.a, html: (r) => chips([r.a, r.b]) },
    { key: "sim", label: "Similarity", num: 1, val: (r) => r.sim, html: (r) => Math.round(r.sim * 100) + "%" },
    { key: "lift", label: "Lift together", num: 1, m: 1, val: (r) => r.lift, html: (r) => times(r.lift) }] });

  mkTable("t-avoid", { sort: "exp", rows: D.avoid, cols: [
    { key: "pair", label: "Pair", dir: 1, val: (r) => r.a, html: (r) => chips([r.a, r.b]) },
    { key: "n", label: "Seen", num: 1, val: (r) => r.n, dir: 1, html: (r) => fmt(r.n) },
    { key: "exp", label: "Expected", num: 1, m: 1, val: (r) => r.expected, html: (r) => fmt(r.expected) },
    go((r) => [r.a, r.b], "Closest")] });

  const bars = (d) => {
    const mx = Math.max(...d.share);
    return `<span class="bars" style="${fs(ix.get(d.note))}" title="${D.bins.join(" · ")}">` + d.share.map((s) => `<i style="height:${Math.max(6, (s / mx) * 100)}%"></i>`).join("") + "</span>";
  };
  mkTable("t-time", { sort: "delta", rows: D.time, cols: [
    { key: "note", label: "Note", dir: 1, val: (r) => r.note, html: (r) => chip(ix.get(r.note)) },
    { key: "trend", label: "Before 2005 to now", html: bars },
    { key: "a", label: "Before 2005", num: 1, m: 1, val: (r) => r.share[0], html: (r) => pct(r.share[0]) },
    { key: "b", label: "2020 on", num: 1, val: (r) => r.share[4], html: (r) => pct(r.share[4]) },
    { key: "delta", label: "Change", num: 1, val: (r) => r.delta, html: (r) => sgn(r.delta * 100, 1) + " pts" }] });

  const prow = [...D.rising_pairs, ...D.falling_pairs].map((d) => ({ ...d, ratio: (d.late + 0.0005) / (d.early + 0.0005) }));
  mkTable("t-ptime", { sort: "ratio", rows: prow, cols: [
    { key: "pair", label: "Pair", dir: 1, val: (r) => r.a, html: (r) => chips([r.a, r.b]) },
    { key: "e", label: "To 2014", num: 1, m: 1, val: (r) => r.early, html: (r) => pct(r.early) },
    { key: "l", label: "2020 on", num: 1, val: (r) => r.late, html: (r) => pct(r.late) },
    { key: "ratio", label: "Change", num: 1, val: (r) => r.ratio, html: (r) => (r.ratio >= 1 ? times(r.ratio) + " up" : times(1 / r.ratio) + " down") },
    go((r) => [r.a, r.b], "Fragrances")] });

  const stk = (a) => `<span class="stk" title="men’s ${pct(a[0])} · women’s ${pct(a[1])} · unisex ${pct(a[2])}"><i class="m" style="width:${a[0] * 100}%"></i><i class="w" style="width:${a[1] * 100}%"></i><i class="u" style="width:${a[2] * 100}%"></i></span>`;
  const perBars = (per) => { const mx = Math.max(...per); return `<span class="bars" title="${D.bins.join(" · ")}">` + per.map((s) => `<i style="height:${Math.max(6, (s / mx) * 100)}%"></i>`).join("") + "</span>"; };
  const noteChips = (list, lift) => list.length ? list.map((t) => `<button class="chip" data-set="${esc(t.note)}" style="${fs(ix.get(t.note))}">${esc(t.note)}${lift ? ` <i>${times(t.lift)}</i>` : ""}</button>`).join("") : "–";
  const styleCols = (label, kind) => [
    { key: "name", label, dir: 1, val: (r) => r.name, html: (r) => `<b>${esc(r.name)}</b>` },
    { key: "n", label: "Perfumes", num: 1, m: 1, val: (r) => r.n, html: (r) => fmt(r.n) },
    { key: "trend", label: "Share of releases", m: 1, html: (r) => perBars(r.per) },
    { key: "now", label: "Share now", num: 1, m: 1, val: (r) => r.per[4], html: (r) => pct(r.per[4]) },
    { key: "chg", label: "Change", num: 1, val: (r) => r.per[4] - r.per[0], html: (r) => sgn((r.per[4] - r.per[0]) * 100, 1) + " pts" },
    { key: "mean", label: "Avg notes", num: 1, m: 1, val: (r) => r.mean, html: (r) => r.mean },
    { key: "aud", label: "Audience", m: 1, html: (r) => stk(r.aud) },
    { key: "core", label: "Core notes", m: 1, html: (r) => noteChips(r.core, false) },
    { key: "sig", label: "Signature notes", html: (r) => noteChips(r.sig, true) },
    ...(kind ? [{ key: "go", label: "", html: (r) => `<button class="act" data-filt="${kind}:${r.idx}">Browse</button>` }] : []),
  ];
  mkTable("t-fam", { sort: "n", rows: D.olf.map((r, idx) => ({ ...r, idx })), cols: styleCols("Family", "fam") });
  mkTable("t-sub", { sort: "n", rows: D.olf_sub, cols: styleCols("Subfamily", null) });
  mkTable("t-reg", { sort: "n", rows: D.regions.map((r, idx) => ({ ...r, idx })), cols: styleCols("Country", "reg") });
  const mxN = Math.max(...D.market.map((r) => r.n));
  mkTable("t-market", { sort: "year", rows: D.market, cols: [
    { key: "year", label: "Year", val: (r) => r.year, html: (r) => `<b>${r.year}</b>` },
    { key: "n", label: "Releases", val: (r) => r.n, html: (r) => `<span class="hb"><i style="width:${(r.n / mxN) * 100}%"></i></span> ${fmt(r.n)}` },
    { key: "m", label: "Men’s", num: 1, val: (r) => r.aud[0], html: (r) => pct(r.aud[0]) },
    { key: "w", label: "Women’s", num: 1, val: (r) => r.aud[1], html: (r) => pct(r.aud[1]) },
    { key: "u", label: "Unisex", num: 1, val: (r) => r.aud[2], html: (r) => pct(r.aud[2]) },
    { key: "s", label: "Mix", m: 1, html: (r) => stk(r.aud) },
    { key: "mean", label: "Avg notes", num: 1, val: (r) => r.mean, html: (r) => r.mean }] });

  mkTable("t-houses", { sort: "n", rows: D.house, cols: [
    { key: "brand", label: "House", dir: 1, val: (r) => r.brand, html: (r) => `<b>${esc(r.brand.replace(/'S\b/g, "'s"))}</b>` },
    { key: "n", label: "Perfumes", num: 1, m: 1, val: (r) => r.n, html: (r) => fmt(r.n) },
    { key: "mean", label: "Avg notes", num: 1, m: 1, val: (r) => r.mean, html: (r) => r.mean },
    { key: "med", label: "Median year", num: 1, m: 1, val: (r) => r.med, html: (r) => r.med },
    { key: "aud", label: "Audience", m: 1, html: (r) => stk(r.aud) },
    { key: "sig", label: "Signature notes", html: (r) => r.top.map((t) => `<button class="chip" data-set="${esc(t.note)}" style="${fs(ix.get(t.note))}">${esc(t.note)} <i>${times(t.lift)}</i></button>`).join("") },
    { key: "go", label: "", html: (r) => `<button class="act" data-house="${esc(r.brand)}">Browse</button>` }] });

  mkTable("t-size", { sort: "mean", rows: D.size.all, cols: [
    { key: "note", label: "Note", dir: 1, val: (r) => r.note, html: (r) => chip(ix.get(r.note)) },
    { key: "n", label: "Perfumes", num: 1, val: (r) => r.n, html: (r) => fmt(r.n) },
    { key: "mean", label: "Avg notes", num: 1, val: (r) => r.mean, html: (r) => r.mean }] });

  const gMax = Math.max(...D.gender.map((d) => Math.max(d.share[0], d.share[1])));
  mkTable("t-aud", { sort: "lean", rows: D.gender, cols: [
    { key: "note", label: "Note", dir: 1, val: (r) => r.note, html: (r) => chip(ix.get(r.note)) },
    { key: "m", label: "Men’s", num: 1, val: (r) => r.share[0], html: (r) => pct(r.share[0]) },
    { key: "w", label: "Women’s", num: 1, val: (r) => r.share[1], html: (r) => pct(r.share[1]) },
    { key: "u", label: "Unisex", num: 1, m: 1, val: (r) => r.share[2], html: (r) => pct(r.share[2]) },
    { key: "lean", label: "Men’s ↔ women’s", val: (r) => r.lean, html: (r) => `<span class="sp"><span class="l"><i style="width:${(r.share[0] / gMax) * 100}%"></i></span><span class="r"><i style="width:${(r.share[1] / gMax) * 100}%"></i></span></span>` }] });

  /* ---------- boot ---------- */
  const hp = new URLSearchParams(location.hash.slice(1));
  tab = hp.get("t") === "frags" ? "frags" : "pairs";
  const names0 = (hp.get("n") || "").split(",").map((n) => ix.get(n)).filter((i) => i !== undefined);
  show(hp.get("v") || "explore", false);
  setSel(names0);
})();
