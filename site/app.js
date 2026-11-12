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

  // soft family palette: [pale tint, mid tone, deep tone]
  const FP = [
    ["#fbf1c7", "#f1d66a", "#7a6100"], // Citrus
    ["#fbe5ed", "#f1b3c8", "#a03a5c"], // White Floral
    ["#fadbd7", "#ee9f98", "#a5352d"], // Rose & Garden Floral
    ["#ece1d4", "#cfb08c", "#6a4a2a"], // Woody
    ["#fbe4cb", "#f0b97c", "#97580f"], // Amber & Resin
    ["#e9e4ee", "#c6bad1", "#5e4e70"], // Musk & Animal
    ["#f4ddf0", "#dba6d3", "#86307a"], // Sweet & Gourmand
    ["#e0f3de", "#aadda6", "#2e7733"], // Fruity
    ["#f8dccf", "#e69f84", "#983b1d"], // Spicy
    ["#d9efe4", "#92d1b0", "#1e6844"], // Green & Herbal
    ["#dae8f8", "#9dc4ee", "#235a98"], // Aquatic & Aldehydic
    ["#e3e7d5", "#b5c093", "#54672b"], // Earthy & Mossy
  ];
  const fs = (i) => `--p:${FP[FO[i]][0]};--m:${FP[FO[i]][1]};--d:${FP[FO[i]][2]}`;

  $("n-perf").textContent = fmt(N);
  $("n-notes").textContent = notes.length;
  const avgAll = P.reduce((a, p) => a + p[4].length, 0) / N;
  $("avg-size").textContent = avgAll.toFixed(1);

  const has = notes.map(() => new Uint8Array(N));
  P.forEach((p, k) => p[4].forEach((i) => (has[i][k] = 1)));

  /* ---------- two-letter symbols; popular notes choose first ---------- */
  const sym = [], used = new Set();
  const cap = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();
  notes.forEach((name, i) => {
    const words = name.split(/[\s\/\-]+/).filter((w) => !/^(of|the)$/i.test(w) && /[a-z]/i.test(w));
    const w = words[0].replace(/[^a-z]/gi, "");
    const cands = [];
    if (words.length > 1) cands.push(words[0][0] + words[1][0]);
    for (let k = 1; k < w.length; k++) cands.push(w[0] + w[k]);
    for (let k = 1; k < w.length - 1; k++) cands.push(w[0] + w[k] + w[k + 1]);
    const pick = cands.map(cap).find((c) => !used.has(c)) || cap(w.slice(0, 3)) + i;
    used.add(pick); sym[i] = pick;
  });

  /* ---------- board ---------- */
  const board = $("board");
  const byFam = D.families.map(() => []);
  notes.forEach((n, i) => byFam[FO[i]].push(i));
  board.innerHTML = byFam.map((list, fi) => {
    const cols = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(list.length * 1.5))));
    return `<div class="fam" data-f="${fi}"><h4>${esc(D.families[fi])}</h4><div class="g" style="grid-template-columns:repeat(${cols},4.7rem)">` +
      list.map((i) =>
        `<button class="tile" data-i="${i}" style="${fs(i)}" title="${esc(notes[i])}: ${fmt(F[i])} perfumes" aria-label="${esc(notes[i])}">` +
        `<span class="rk">${i + 1}</span><span class="lf"></span><b class="sy">${sym[i]}</b><span class="nm">${esc(notes[i])}</span></button>`
      ).join("") + "</div></div>";
  }).join("");
  const tiles = [...board.querySelectorAll(".tile")];
  const tileOf = new Map(tiles.map((t) => [+t.dataset.i, t]));

  /* ---------- state ---------- */
  let sel = [], tab = "pairs", ctx = null, lastOut = [], lookupOpen = false, solo = null;
  const fo = { gender: "all", sort: "clean", near: false, q: "", shown: 15 };
  const chip = (i, attr) => `<button class="chip" ${attr || `data-set="${esc(notes[i])}"`} style="${fs(i)}">${esc(notes[i])}</button>`;
  const chips = (names, join) => names.map((n) => chip(ix.get(n))).join(join || " ");

  /* ---------- views (tabs) + url ---------- */
  const VIEWS = ["explore", "odd", "swap", "trios", "avoid", "trends", "houses", "formulas", "gender", "about"];
  let view = "explore";
  const tabbar = $("tabbar"), vts = [...tabbar.querySelectorAll(".vt")], panes = [...document.querySelectorAll(".pane")];
  function writeHash() {
    const p = [];
    if (view !== "explore") p.push("v=" + view);
    if (sel.length) p.push("n=" + encodeURIComponent(sel.map((i) => notes[i]).join(",")));
    if (sel.length && tab === "frags") p.push("t=frags");
    try { history.replaceState(null, "", location.pathname + location.search + (p.length ? "#" + p.join("&") : "")); } catch (e) {}
  }
  function show(v, scroll) {
    if (!VIEWS.includes(v)) v = "explore";
    view = v;
    panes.forEach((p) => (p.hidden = p.dataset.view !== v));
    vts.forEach((b) => { const on = b.dataset.view === v; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    document.body.dataset.view = v;
    if (v !== "explore") $("panel").classList.remove("open");
    writeHash();
    if (scroll) { const top = tabbar.offsetTop; if (window.scrollY > top) window.scrollTo(0, top); }
    const on = vts.find((b) => b.dataset.view === v);
    if (on && on.scrollIntoView) { try { on.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {} }
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
    if ((el = T(".vt"))) { show(el.dataset.view, true); return; }
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
    if ((el = T("[data-house]"))) { goHouse(el.dataset.house); return; }
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
  $("panel").addEventListener("input", (e) => { if (e.target.id === "fq") { fo.q = e.target.value; fo.shown = 15; renderFrags(); } });
  $("panel").addEventListener("change", (e) => {
    if (e.target.id === "fsort") { fo.sort = e.target.value; fo.shown = 15; renderFrags(); }
    if (e.target.id === "fnear") { fo.near = e.target.checked; fo.shown = 15; renderFrags(); }
  });
  document.addEventListener("input", (e) => {
    if (!e.target.classList || !e.target.classList.contains("tabfilter")) return;
    const v = e.target.value.trim().toLowerCase();
    e.target.dataset.filter.split(",").forEach((id) => [...$(id).children].forEach((ch) => (ch.hidden = !!v && !ch.textContent.toLowerCase().includes(v))));
  });

  function toggle(i) { setSel(sel.includes(i) ? sel.filter((x) => x !== i) : sel.concat(i)); }
  function setSel(list) {
    sel = list.filter((i) => i !== undefined);
    if (!sel.length) lookupOpen = lookupOpen && false;
    fo.shown = 15;
    render(); writeHash();
  }
  function openLookup() {
    setSel([]); lookupOpen = true; vis(); renderPanel(true);
    if (mobile()) $("panel").classList.add("open");
    setTimeout(() => { const f = $("fq"); if (f) f.focus(); }, 50);
  }
  function goHouse(brand) {
    setSel([]); lookupOpen = true; fo.q = brand; fo.gender = "all"; vis();
    show("explore", true); renderPanel(true);
    if (mobile()) $("panel").classList.add("open");
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
    if (e.key === "Escape") { q.value = ""; find(); }
  });

  /* ---------- family spotlight ---------- */
  $("fams").innerHTML = D.families.map((f, fi) => `<button class="fpill" data-fam="${fi}" style="--p:${FP[fi][0]};--m:${FP[fi][1]};--d:${FP[fi][2]}">${esc(f)}</button>`).join("");
  function applySolo() {
    board.classList.toggle("solo", solo !== null);
    board.querySelectorAll(".fam").forEach((el) => el.classList.toggle("on", +el.dataset.f === solo));
    $("fams").querySelectorAll(".fpill").forEach((el) => el.classList.toggle("on", +el.dataset.fam === solo));
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

    // colour = how strongly a note pairs *relative to the other notes for this selection*
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
    d_ctx(M, cand, sizeSum, match);
  }
  function d_ctx(M, cand, sizeSum, match) { ctx = { M, cand, sizeSum, match }; renderPanel(true); }

  function emptyHTML() {
    return `<div class="phead"><p class="empty-t">Look up a perfume</p><p class="hint">Search by name or brand, or tap a note in the table.</p></div><div class="pbody">${fragsHTML()}</div>`;
  }
  function renderPanel(top) {
    const panel = $("panel");
    if (!ctx) { panel.innerHTML = emptyHTML(); renderFrags(); if (top) panel.scrollTop = 0; return; }
    const { M, sizeSum } = ctx;
    let h = `<div class="phead"><div class="sels">${sel.map((i) => chip(i, `data-tog="${i}"`)).join("")}</div>` +
      `<p class="count"><b>${fmt(M)}</b>of ${fmt(N)} perfumes (${pct(M / N)}) contain ${sel.length > 1 ? "all of these" : "this note"}.` +
      (M ? `<small>Average formula: ${(sizeSum / M).toFixed(1)} notes (all perfumes: ${avgAll.toFixed(1)})</small>` : "") + `</p>` +
      `<div class="tabs" role="tablist"><button class="tab${tab === "pairs" ? " on" : ""}" role="tab" data-tab="pairs">Pairings</button>` +
      `<button class="tab${tab === "frags" ? " on" : ""}" role="tab" data-tab="frags">Fragrances <i>${fmt(M)}</i></button></div></div><div class="pbody">`;
    h += tab === "frags" ? fragsHTML() : pairsHTML();
    panel.innerHTML = h + "</div>";
    if (tab === "frags") renderFrags();
    if (top) panel.scrollTop = 0;
  }

  function pairsHTML() {
    const { M, cand } = ctx;
    if (!M) return `<p class="hint">No perfume combines all of these. Open the Fragrances tab to see near matches, or remove a note.</p>`;
    const often = cand.filter((d) => d.c > 0).sort((a, b) => b.share - a.share).slice(0, 7);
    const minC = Math.max(8, Math.round(M * 0.04));
    const distinct = cand.filter((d) => d.c >= minC && d.lift > 1.2).sort((a, b) => b.lift - a.lift).slice(0, 7);
    const seldom = cand.filter((d) => d.exp >= Math.max(6, M * 0.03) && F[d.i] >= 250).sort((a, b) => a.lift - b.lift).slice(0, 6);
    const list = (arr, bar, val) => arr.length
      ? `<ul class="plist">` + arr.map((d) => `<li style="${fs(d.i)}">${chip(d.i, `data-tog="${d.i}"`)}<span class="bar"><i style="width:${bar(d)}%"></i></span><span class="v">${val(d)}</span></li>`).join("") + "</ul>"
      : `<p class="hint">Too few perfumes to say.</p>`;
    let h = `<button class="cta" data-tab="frags">Find fragrances with ${sel.length > 1 ? "these notes" : "this note"} <b>${fmt(M)}</b></button>`;
    h += `<h5>Most often with</h5><p class="hint">Tap a note to add it to your combination.</p>` + list(often, (d) => (d.share / often[0].share) * 100, (d) => pct(d.share));
    h += `<h5>Unusually often with</h5>` + list(distinct, (d) => (d.lift / distinct[0].lift) * 100, (d) => times(d.lift));
    h += `<h5>Hardly ever with</h5>` + list(seldom, (d) => Math.max(2, (1 - d.lift) * 100), (d) => d.c + "/" + Math.round(d.exp));
    if (sel.length === 1 && D.similar[sel[0]].length) {
      h += `<h5>Possible stand-ins</h5><p class="hint">Similar partners, rarely used together</p><ul class="plist">` +
        D.similar[sel[0]].slice(0, 5).map(([j, s]) => `<li style="${fs(j)}">${chip(j, `data-tog="${j}"`)}<span class="bar"><i style="width:${Math.round(s * 100)}%"></i></span><span class="v">${Math.round(s * 100)}%</span></li>`).join("") + "</ul>";
    }
    return h;
  }

  /* ---------- fragrance finder ---------- */
  function fragsHTML() {
    const seg = (key, opts) => `<div class="seg">` + opts.map(([v, l]) => `<button data-fo="${key}:${v}" class="${fo[key] === v ? "on" : ""}">${l}</button>`).join("") + "</div>";
    return `<div class="fctl"><input id="fq" type="search" placeholder="${sel.length ? "Filter by name or brand" : "Name or brand, e.g. Guerlain"}" value="${esc(fo.q)}" autocomplete="off" spellcheck="false">` +
      seg("gender", [["all", "All"], ["0", "Men’s"], ["1", "Women’s"], ["2", "Unisex"]]) +
      `<label class="sort">Sort <select id="fsort">` +
      [["clean", "Simplest first"], ["new", "Newest first"], ["rich", "Most complex first"]].map(([v, l]) => `<option value="${v}"${fo.sort === v ? " selected" : ""}>${l}</option>`).join("") + `</select></label>` +
      (sel.length >= 2 ? `<label class="chk"><input type="checkbox" id="fnear"${fo.near || ctx.M === 0 ? " checked" : ""}${ctx.M === 0 ? " disabled" : ""}> Include perfumes missing one note</label>` : "") +
      `</div><p class="hint fline"><span id="fcount"></span><button class="linkish" data-csv>Download CSV</button></p><ul class="flist" id="fraglist"></ul><button class="more" id="fmore" data-more hidden></button>`;
  }

  function runFrags() {
    const need = sel.length, near = (fo.near || (ctx && ctx.M === 0)) && need >= 2;
    const qq = fo.q.trim().toLowerCase();
    if (need === 0 && qq.length < 2) return null;
    const out = [];
    for (let k = 0; k < N; k++) {
      let sc = 0; for (const i of sel) sc += has[i][k];
      if (need && (!sc || sc < (near ? need - 1 : need))) continue;
      const p = P[k];
      if (fo.gender !== "all" && String(p[3]) !== fo.gender) continue;
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
    if (!res) {
      lastOut = [];
      $("fcount").textContent = "Type at least two letters of a name or brand.";
      $("fraglist").innerHTML = ""; $("fmore").hidden = true; return;
    }
    const { out, near } = res; lastOut = out;
    const selSet = new Set(sel);
    $("fcount").textContent = out.length
      ? `${fmt(out.length)} ${out.length === 1 ? "fragrance" : "fragrances"}${near ? " (some are missing one note)" : ""}`
      : "Nothing matches. Loosen a filter or remove a note.";
    $("fraglist").innerHTML = out.slice(0, fo.shown).map(({ k }) => {
      const [name, brand, year, g, ids] = P[k];
      const mine = ids.filter((i) => selSet.has(i)), rest = ids.filter((i) => !selSet.has(i));
      const missing = sel.filter((i) => !ids.includes(i)).map((i) => notes[i]);
      return `<li class="frag"><div class="ft"><b>${esc(name)}</b> <span>${esc(brand)}</span></div>` +
        `<div class="fm">${year || "year unknown"} · ${GL[g]} · ${ids.length} ${ids.length === 1 ? "note" : "notes"}${missing.length ? ` · <u>missing ${esc(missing.join(", "))}</u>` : ""}</div>` +
        `<div class="fn">${mine.map((i) => `<span class="n hit" style="${fs(i)}">${esc(notes[i])}</span>`).join("")}` +
        rest.slice(0, 9).map((i) => `<span class="n">${esc(notes[i])}</span>`).join("") +
        (rest.length > 9 ? `<span class="n more">+${rest.length - 9}</span>` : "") + `</div>` +
        `<div class="facts"><button class="linkish" data-sim="${k}">Find similar</button>` +
        `<a class="fl" target="_blank" rel="noopener" href="https://duckduckgo.com/?q=${encodeURIComponent(name + " " + brand + " perfume")}">Look it up</a></div>` +
        `<div class="sim" id="sim-${k}" hidden></div></li>`;
    }).join("");
    const more = $("fmore");
    more.hidden = out.length <= fo.shown;
    more.textContent = `Show ${Math.min(15, out.length - fo.shown)} more`;
  }

  // most similar perfumes by note-list overlap (Jaccard)
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
      if (score < 0.2) continue;
      if (P[j][0] === P[k][0] && P[j][1] === P[k][1]) continue;
      scored.push({ j, score, inter });
    }
    scored.sort((a, b) => b.score - a.score || P[b.j][2] - P[a.j][2]);
    if (!scored.length) return `<p class="hint">Nothing with a similar note list.</p>`;
    return `<p class="hint">Closest by shared notes. Coloured notes are shared with this one.</p><ul class="simlist">` +
      scored.slice(0, 8).map(({ j, score, inter }) => {
        const ids = P[j][4];
        return `<li><div><b>${esc(P[j][0])}</b> <span>${esc(P[j][1])}</span> <em>${Math.round(score * 100)}% match</em></div>` +
          `<div class="fn">${ids.slice().sort((a, b) => mine[b] - mine[a]).slice(0, 10).map((i) => mine[i] ? `<span class="n hit" style="${fs(i)}">${esc(notes[i])}</span>` : `<span class="n">${esc(notes[i])}</span>`).join("")}${ids.length > 10 ? `<span class="n more">+${ids.length - 10}</span>` : ""}</div></li>`;
      }).join("") + "</ul>";
  }
  function toggleSim(k, btn) {
    const box = $("sim-" + k);
    if (box.hidden) { if (!box.innerHTML) box.innerHTML = simHTML(k); box.hidden = false; btn.textContent = "Hide similar"; }
    else { box.hidden = true; btn.textContent = "Find similar"; }
  }

  function downloadCsv() {
    if (!lastOut.length) return;
    const rows = [["name", "brand", "year", "audience", "note_count", "notes"]];
    lastOut.forEach(({ k }) => { const p = P[k]; rows.push([p[0], p[1], p[2] || "", GL[p[3]], p[4].length, p[4].map((i) => notes[i]).join("; ")]); });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "fragrances" + (sel.length ? "-" + sel.map((i) => notes[i].toLowerCase().replace(/\W+/g, "")).join("-") : "") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- the other tabs ---------- */
  const act = (names, label) => `<button class="act" data-set="${esc(names.join("|"))}" data-go="frags">${label}</button>`;
  const pairHTML = (names, big, meta, between, label) =>
    `<div class="pair"><div class="c">${chips(names, between || '<span class="x">+</span>')}</div><div class="n">${big}</div>` +
    (label ? act(names, label) : "<span></span>") + `<div class="m">${meta}</div></div>`;
  $("t-surprising").innerHTML = D.surprising.map((d) => pairHTML([d.a, d.b], times(d.lift), fmt(d.n) + " perfumes", null, "Find fragrances")).join("");
  $("t-swap").innerHTML = D.understudies.map((d) =>
    pairHTML([d.a, d.b], Math.round(d.sim * 100) + "%", `together ${times(d.lift)} as often as chance`, '<span class="x">~</span>')).join("");
  $("t-avoid").innerHTML = D.avoid.map((d) =>
    pairHTML([d.a, d.b], fmt(d.n), `seen · ${fmt(d.expected)} expected`, '<span class="x">&times;</span>', "Closest fragrances")).join("");

  const rowTrio = (d) => `<div class="row"><div class="grow">${chips(d.notes)}</div><span class="m">${fmt(d.n)}</span><span class="v">${times(d.lift)}</span>${act(d.notes, "Fragrances")}</div>`;
  $("t-trios").innerHTML = D.trios.map(rowTrio).join("");
  $("t-common").innerHTML = D.trios_common.map(rowTrio).join("");

  const bars = (d) => {
    const mx = Math.max(...d.share);
    return `<span class="bars" style="${fs(ix.get(d.note))}" title="${D.bins.join(" · ")}">` + d.share.map((s) => `<i style="height:${Math.max(6, (s / mx) * 100)}%"></i>`).join("") + "</span>";
  };
  const timeRow = (d) => `<div class="row">${chip(ix.get(d.note))}<span class="grow"></span>${bars(d)}<span class="v">${pct(d.share[d.share.length - 1])}</span><span class="m">was ${pct(d.share[0])}</span></div>`;
  const byDelta = D.time.slice().sort((a, b) => b.delta - a.delta);
  $("t-rise").innerHTML = byDelta.slice(0, 12).map(timeRow).join("");
  $("t-fall").innerHTML = byDelta.slice(-12).reverse().map(timeRow).join("");
  const pRow = (d) => `<div class="row"><div class="grow">${chips([d.a, d.b])}</div><span class="m">was ${pct(d.early)}</span><span class="v">${pct(d.late)}</span>${act([d.a, d.b], "Fragrances")}</div>`;
  $("t-prise").innerHTML = D.rising_pairs.slice(0, 12).map(pRow).join("");
  $("t-pfall").innerHTML = D.falling_pairs.slice(0, 12).map(pRow).join("");

  $("t-houses").innerHTML = D.house.map((b) => {
    const nm = b.brand.replace(/'S\b/g, "'s");
    return `<div class="house"><div class="hn">${esc(nm)}</div><div class="hm">${fmt(b.n)} perfumes · ${b.mean} notes each on average</div><div class="hc">` +
      b.top.map((t) => `<button class="chip" data-set="${esc(t.note)}" style="${fs(ix.get(t.note))}">${esc(t.note)}<i>${times(t.lift)}</i></button>`).join("") +
      `</div><button class="act" data-house="${esc(b.brand)}">Browse their fragrances</button></div>`;
  }).join("");

  const sizeRow = (d) => `<div class="row">${chip(ix.get(d.note))}<span class="grow"></span><span class="m">${fmt(d.n)} perfumes</span><span class="v">${d.mean}</span></div>`;
  $("t-small").innerHTML = D.size.small.map(sizeRow).join("");
  $("t-large").innerHTML = D.size.large.map(sizeRow).join("");

  const gMax = Math.max(...D.gender.map((d) => Math.max(d.share[0], d.share[1])));
  const gRow = (d) =>
    `<div class="row">${chip(ix.get(d.note))}<span class="sp"><span class="l"><i style="width:${(d.share[0] / gMax) * 100}%"></i></span><span class="r"><i style="width:${(d.share[1] / gMax) * 100}%"></i></span></span><span class="vs">${pct(d.share[0])} / ${pct(d.share[1])}</span></div>`;
  const byLean = D.gender.slice().sort((a, b) => b.lean - a.lean);
  $("t-men").innerHTML = byLean.slice(0, 12).map(gRow).join("");
  $("t-women").innerHTML = byLean.slice(-12).reverse().map(gRow).join("");

  /* ---------- boot ---------- */
  $("try").innerHTML = "<span>Try</span>" + ["Oud", "Vanilla", "Iris", "Vetiver", "Rose", "Tonka Bean"].map((n) => chip(ix.get(n))).join("");
  const hp = new URLSearchParams(location.hash.slice(1));
  tab = hp.get("t") === "frags" ? "frags" : "pairs";
  const names0 = (hp.get("n") || "").split(",").map((n) => ix.get(n)).filter((i) => i !== undefined);
  show(hp.get("v") || "explore", false);
  setSel(names0);
})();
