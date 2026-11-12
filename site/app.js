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

  // presence matrix
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

  let sel = [];
  const chip = (i, attr) => `<button class="chip" ${attr || `data-set="${esc(notes[i])}"`} style="${fs(i)}">${esc(notes[i])}</button>`;
  const chipSet = (names) => names.map((n) => chip(ix.get(n), `data-set="${esc(names.join("|"))}"`));

  let tab = "pairs", ctx = null;
  const fo = { gender: "all", sort: "clean", near: false, q: "", shown: 15 };
  const GL = ["men’s", "women’s", "unisex"];
  document.addEventListener("click", (e) => {
    const panel = $("panel");
    if (mobile() && panel.classList.contains("open") && !e.target.closest("#panel")) panel.classList.remove("open");
    const tb = e.target.closest("[data-tab]");
    if (tb) {
      const same = tab === tb.dataset.tab;
      tab = tb.dataset.tab;
      if (mobile()) panel.classList.toggle("open", !(same && panel.classList.contains("open")));
      renderPanel(true); return;
    }
    const f = e.target.closest("[data-fo]");
    if (f) { const [k, v] = f.dataset.fo.split(":"); fo[k] = v; fo.shown = 15; renderPanel(); return; }
    if (e.target.closest("[data-more]")) { fo.shown += 15; renderFrags(); return; }
    const t = e.target.closest(".tile, [data-tog]");
    if (t) { toggle(+(t.dataset.i ?? t.dataset.tog)); if (t.classList.contains("tile")) panel.classList.remove("open"); return; }
    const s = e.target.closest("[data-set]");
    if (s) { setSel(s.dataset.set.split("|").map((n) => ix.get(n))); $("table").scrollIntoView({ behavior: "smooth" }); return; }
    if (e.target.closest(".phead") && mobile()) panel.classList.toggle("open");
  });
  $("panel").addEventListener("input", (e) => { if (e.target.id === "fq") { fo.q = e.target.value; fo.shown = 15; renderFrags(); } });
  $("panel").addEventListener("change", (e) => {
    if (e.target.id === "fsort") { fo.sort = e.target.value; fo.shown = 15; renderFrags(); }
    if (e.target.id === "fnear") { fo.near = e.target.checked; fo.shown = 15; renderFrags(); }
  });
  $("clear").addEventListener("click", () => setSel([]));
  function toggle(i) { setSel(sel.includes(i) ? sel.filter((x) => x !== i) : sel.concat(i)); }
  function setSel(list) {
    sel = list.filter((i) => i !== undefined);
    try { history.replaceState(null, "", sel.length ? "#n=" + encodeURIComponent(sel.map((i) => notes[i]).join(",")) : location.pathname + location.search); } catch (e) {}
    render();
  }

  /* ---------- find ---------- */
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

  /* ---------- panel + relight ---------- */
  function render() {
    const panel = $("panel");
    document.body.classList.toggle("has-sel", sel.length > 0);
    $("clear").hidden = !sel.length;
    tiles.forEach((t) => { t.classList.remove("sel", "cold"); t.style.removeProperty("--s"); t.querySelector(".lf").textContent = ""; });
    if (!sel.length) {
      ctx = null; panel.classList.remove("open");
      panel.innerHTML = `<p class="empty">Nothing selected yet.<span>Tap any tile. The table relights, and this box fills with the notes that go with it and the fragrances that fit.</span></p>`;
      return;
    }
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
    sel.forEach((i) => tileOf.get(i).classList.add("sel"));
    cand.forEach((d) => {
      const t = tileOf.get(d.i);
      if (!M || d.c === 0 || d.lift < 0.8) { t.classList.add("cold"); return; }
      t.style.setProperty("--s", Math.max(0, Math.min(1, (d.lift - 1.05) / 1.0)).toFixed(2));
      if (d.c >= 5 && d.lift >= 1.3) t.querySelector(".lf").textContent = times(d.lift);
    });
    ctx = { M, cand, sizeSum, match };
    fo.shown = 15;
    renderPanel(true);
  }

  function renderPanel(top) {
    const panel = $("panel");
    if (!ctx) return;
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

  function fragsHTML() {
    const seg = (key, opts) => `<div class="seg">` + opts.map(([v, l]) => `<button data-fo="${key}:${v}" class="${fo[key] === v ? "on" : ""}">${l}</button>`).join("") + "</div>";
    return `<div class="fctl"><input id="fq" type="search" placeholder="Filter by name or brand" value="${esc(fo.q)}" autocomplete="off" spellcheck="false">` +
      seg("gender", [["all", "All"], ["0", "Men’s"], ["1", "Women’s"], ["2", "Unisex"]]) +
      `<label class="sort">Sort <select id="fsort">` +
      [["clean", "Simplest first"], ["new", "Newest first"], ["rich", "Most complex first"]].map(([v, l]) => `<option value="${v}"${fo.sort === v ? " selected" : ""}>${l}</option>`).join("") + `</select></label>` +
      (sel.length >= 2 ? `<label class="chk"><input type="checkbox" id="fnear"${fo.near || ctx.M === 0 ? " checked" : ""}${ctx.M === 0 ? " disabled" : ""}> Include perfumes missing one note</label>` : "") +
      `</div><p class="hint" id="fcount"></p><ul class="flist" id="fraglist"></ul><button class="more" id="fmore" data-more hidden></button>`;
  }

  function renderFrags() {
    const need = sel.length, near = (fo.near || ctx.M === 0) && need >= 2;
    const q = fo.q.trim().toLowerCase();
    const out = [];
    for (let k = 0; k < N; k++) {
      let sc = 0; for (const i of sel) sc += has[i][k];
      if (!sc || sc < (near ? need - 1 : need)) continue;
      const p = P[k];
      if (fo.gender !== "all" && String(p[3]) !== fo.gender) continue;
      if (q && !(p[0] + " " + p[1]).toLowerCase().includes(q)) continue;
      out.push({ k, sc });
    }
    const len = (o) => P[o.k][4].length;
    const by = {
      clean: (a, b) => b.sc - a.sc || len(a) - len(b) || P[b.k][2] - P[a.k][2],
      new: (a, b) => b.sc - a.sc || P[b.k][2] - P[a.k][2] || len(a) - len(b),
      rich: (a, b) => b.sc - a.sc || len(b) - len(a) || P[b.k][2] - P[a.k][2],
    };
    out.sort(by[fo.sort]);
    const selSet = new Set(sel);
    $("fcount").textContent = out.length
      ? `${fmt(out.length)} ${out.length === 1 ? "fragrance" : "fragrances"}${near ? " (some are missing one note)" : ""}`
      : "Nothing matches. Loosen a filter or remove a note.";
    $("fraglist").innerHTML = out.slice(0, fo.shown).map(({ k, sc }) => {
      const [name, brand, year, g, ids] = P[k];
      const mine = ids.filter((i) => selSet.has(i)), rest = ids.filter((i) => !selSet.has(i));
      const missing = sel.filter((i) => !ids.includes(i)).map((i) => notes[i]);
      return `<li class="frag"><div class="ft"><b>${esc(name)}</b> <span>${esc(brand)}</span></div>` +
        `<div class="fm">${year || "year unknown"} · ${GL[g]} · ${ids.length} ${ids.length === 1 ? "note" : "notes"}${missing.length ? ` · <u>missing ${esc(missing.join(", "))}</u>` : ""}</div>` +
        `<div class="fn">${mine.map((i) => `<span class="n hit" style="${fs(i)}">${esc(notes[i])}</span>`).join("")}` +
        rest.slice(0, 9).map((i) => `<span class="n">${esc(notes[i])}</span>`).join("") +
        (rest.length > 9 ? `<span class="n more">+${rest.length - 9}</span>` : "") + `</div>` +
        `<a class="fl" target="_blank" rel="noopener" href="https://duckduckgo.com/?q=${encodeURIComponent(name + " " + brand + " perfume")}">Look it up</a></li>`;
    }).join("");
    const more = $("fmore");
    more.hidden = out.length <= fo.shown;
    more.textContent = `Show ${Math.min(15, out.length - fo.shown)} more`;
  }

  /* ---------- insight sections ---------- */
  const pairHTML = (names, big, meta, between) =>
    `<div class="pair"><div class="c">${chipSet(names).join(between || '<span class="x">+</span>')}</div><div class="n">${big}</div><div class="m">${meta}</div></div>`;
  $("t-surprising").innerHTML = D.surprising.slice(0, 16).map((d) => pairHTML([d.a, d.b], times(d.lift), fmt(d.n) + " perfumes")).join("");
  $("t-swap").innerHTML = D.understudies.slice(0, 14).map((d) =>
    pairHTML([d.a, d.b], Math.round(d.sim * 100) + "%", `together ${times(d.lift)} as often as chance`, '<span class="x">~</span>')).join("");
  $("t-avoid").innerHTML = D.avoid.slice(0, 16).map((d) =>
    pairHTML([d.a, d.b], fmt(d.n), `seen · ${fmt(d.expected)} expected`, '<span class="x">&times;</span>')).join("");

  const rowTrio = (d) => `<div class="row"><div class="grow">${chipSet(d.notes).join(" ")}</div><span class="m">${fmt(d.n)}</span><span class="v">${times(d.lift)}</span></div>`;
  $("t-trios").innerHTML = D.trios.slice(0, 14).map(rowTrio).join("");
  $("t-common").innerHTML = D.trios_common.slice(0, 14).map(rowTrio).join("");

  const bars = (d) => {
    const mx = Math.max(...d.share);
    return `<span class="bars" style="${fs(ix.get(d.note))}" title="${D.bins.join(" · ")}">` + d.share.map((s) => `<i style="height:${Math.max(6, (s / mx) * 100)}%"></i>`).join("") + "</span>";
  };
  const timeRow = (d) => `<div class="row">${chip(ix.get(d.note))}<span class="grow"></span>${bars(d)}<span class="v">${pct(d.share[d.share.length - 1])}</span><span class="m">was ${pct(d.share[0])}</span></div>`;
  const byDelta = D.time.slice().sort((a, b) => b.delta - a.delta);
  $("t-rise").innerHTML = byDelta.slice(0, 12).map(timeRow).join("");
  $("t-fall").innerHTML = byDelta.slice(-12).reverse().map(timeRow).join("");

  const pRow = (d) => `<div class="row"><div class="grow">${chipSet([d.a, d.b]).join('<span class="x"> + </span>')}</div><span class="m">was ${pct(d.early)}</span><span class="v">${pct(d.late)}</span></div>`;
  $("t-prise").innerHTML = D.rising_pairs.slice(0, 10).map(pRow).join("");
  $("t-pfall").innerHTML = D.falling_pairs.slice(0, 10).map(pRow).join("");

  $("t-houses").innerHTML = D.house.slice(0, 24).map((b) =>
    `<div class="house"><div class="hn">${esc(b.brand.replace(/'S\b/g, "'s"))}</div><div class="hm">${fmt(b.n)} perfumes · ${b.mean} notes each on average</div><div class="hc">` +
    b.top.map((t) => `<button class="chip" data-set="${esc(t.note)}" style="${fs(ix.get(t.note))}">${esc(t.note)}<i>${times(t.lift)}</i></button>`).join("") + "</div></div>").join("");

  const sizeRow = (d) => `<div class="row">${chip(ix.get(d.note))}<span class="grow"></span><span class="m">${fmt(d.n)} perfumes</span><span class="v">${d.mean}</span></div>`;
  $("t-small").innerHTML = D.size.small.map(sizeRow).join("");
  $("t-large").innerHTML = D.size.large.map(sizeRow).join("");

  const gMax = Math.max(...D.gender.map((d) => Math.max(d.share[0], d.share[1])));
  const gRow = (d) =>
    `<div class="row">${chip(ix.get(d.note))}<span class="sp"><span class="l"><i style="width:${(d.share[0] / gMax) * 100}%"></i></span><span class="r"><i style="width:${(d.share[1] / gMax) * 100}%"></i></span></span><span class="vs">${pct(d.share[0])} / ${pct(d.share[1])}</span></div>`;
  const byLean = D.gender.slice().sort((a, b) => b.lean - a.lean);
  $("t-men").innerHTML = byLean.slice(0, 12).map(gRow).join("");
  $("t-women").innerHTML = byLean.slice(-12).reverse().map(gRow).join("");

  /* ---------- family legend / spotlight ---------- */
  let solo = null;
  $("fams").innerHTML = D.families.map((f, fi) => `<button class="fpill" data-fam="${fi}" style="--p:${FP[fi][0]};--m:${FP[fi][1]};--d:${FP[fi][2]}">${esc(f)}</button>`).join("");
  function applySolo() {
    board.classList.toggle("solo", solo !== null);
    board.querySelectorAll(".fam").forEach((el) => el.classList.toggle("on", +el.dataset.f === solo));
    $("fams").querySelectorAll(".fpill").forEach((el) => el.classList.toggle("on", +el.dataset.fam === solo));
  }
  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fam]");
    if (!f) return;
    const v = +f.dataset.fam;
    solo = solo === v ? null : v;
    applySolo();
  });

  /* ---------- boot ---------- */
  $("try").innerHTML = "<span>Try</span>" + ["Oud", "Vanilla", "Iris", "Vetiver", "Rose", "Tonka Bean"].map((n) => chip(ix.get(n))).join("");
  const m = /[#&]n=([^&]*)/.exec(location.hash);
  setSel(m ? decodeURIComponent(m[1]).split(",").map((n) => ix.get(n)) : []);
})();
