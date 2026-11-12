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
    return `<div class="fam"><h4>${esc(D.families[fi])}</h4><div class="g" style="grid-template-columns:repeat(${cols},4.7rem)">` +
      list.map((i) =>
        `<button class="tile" data-i="${i}" title="${esc(notes[i])}: ${fmt(F[i])} perfumes" aria-label="${esc(notes[i])}">` +
        `<span class="rk">${i + 1}</span><span class="lf"></span><b class="sy">${sym[i]}</b><span class="nm">${esc(notes[i])}</span></button>`
      ).join("") + "</div></div>";
  }).join("");
  const tiles = [...board.querySelectorAll(".tile")];
  const tileOf = new Map(tiles.map((t) => [+t.dataset.i, t]));

  let sel = [];
  const chip = (i, attr) => `<button class="chip" ${attr || `data-set="${esc(notes[i])}"`}>${esc(notes[i])}</button>`;
  const chipSet = (names) => names.map((n) => chip(ix.get(n), `data-set="${esc(names.join("|"))}"`));

  document.addEventListener("click", (e) => {
    const t = e.target.closest(".tile, [data-tog]");
    if (t) { toggle(+(t.dataset.i ?? t.dataset.tog)); if (t.classList.contains("tile")) $("panel").classList.remove("open"); return; }
    const s = e.target.closest("[data-set]");
    if (s) { setSel(s.dataset.set.split("|").map((n) => ix.get(n))); $("table").scrollIntoView({ behavior: "smooth" }); return; }
    if (e.target.closest(".phead") && mobile()) $("panel").classList.toggle("open");
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
      panel.classList.remove("open");
      panel.innerHTML = `<p class="empty">Nothing selected yet.<span>Tap any tile. The table relights, and this box fills with the notes that go with it, the ones that don’t, and example perfumes.</span></p>`;
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

    let h = `<div class="phead"><div class="sels">${sel.map((i) => chip(i, `data-tog="${i}"`)).join("")}</div>` +
      `<p class="count"><b>${fmt(M)}</b><span class="t-long">of ${fmt(N)} perfumes (${pct(M / N)}) contain ${sel.length > 1 ? "all of these" : "this note"}.</span><span class="t-short"> perfumes</span>` +
      (M ? `<small>Average formula: ${(sizeSum / M).toFixed(1)} notes (all perfumes: ${avgAll.toFixed(1)})</small>` : "") + `</p><span class="carat"></span></div><div class="pbody">`;
    if (!M) h += `<p class="hint">No perfume combines these. Remove one.</p>`;
    else {
      const often = cand.filter((d) => d.c > 0).sort((a, b) => b.share - a.share).slice(0, 7);
      const minC = Math.max(8, Math.round(M * 0.04));
      const distinct = cand.filter((d) => d.c >= minC && d.lift > 1.2).sort((a, b) => b.lift - a.lift).slice(0, 7);
      const seldom = cand.filter((d) => d.exp >= Math.max(6, M * 0.03) && F[d.i] >= 250).sort((a, b) => a.lift - b.lift).slice(0, 6);
      const list = (arr, bar, val) => arr.length
        ? `<ul class="plist">` + arr.map((d) => `<li>${chip(d.i, `data-tog="${d.i}"`)}<span class="bar"><i style="width:${bar(d)}%"></i></span><span class="v">${val(d)}</span></li>`).join("") + "</ul>"
        : `<p class="hint">Too few perfumes to say.</p>`;
      h += `<h5>Most often with</h5>` + list(often, (d) => (d.share / often[0].share) * 100, (d) => pct(d.share));
      h += `<h5>Unusually often with</h5>` + list(distinct, (d) => (d.lift / distinct[0].lift) * 100, (d) => times(d.lift));
      h += `<h5>Hardly ever with</h5>` + list(seldom, (d) => Math.max(2, (1 - d.lift) * 100), (d) => d.c + "/" + Math.round(d.exp));
      if (sel.length === 1 && D.similar[sel[0]].length) {
        h += `<h5>Possible stand-ins</h5><p class="hint">Similar partners, rarely used together</p><ul class="plist">` +
          D.similar[sel[0]].slice(0, 5).map(([j, s]) => `<li>${chip(j, `data-tog="${j}"`)}<span class="bar"><i style="width:${Math.round(s * 100)}%"></i></span><span class="v">${Math.round(s * 100)}%</span></li>`).join("") + "</ul>";
      }
      const ex = match.slice().sort((a, b) => P[a][4].length - P[b][4].length || P[b][2] - P[a][2]).slice(0, 12);
      h += `<h5>Cleanest examples</h5><p class="hint">Fewest other notes, so the combo is the main event.</p><ul class="plist plain">` +
        ex.map((k) => `<li><span class="y">${P[k][2] || ""}</span><span class="n">${esc(P[k][0])}</span><span class="b">${esc(P[k][1])}</span></li>`).join("") + "</ul>";
    }
    panel.innerHTML = h + "</div>";
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
    return `<span class="bars" title="${D.bins.join(" · ")}">` + d.share.map((s) => `<i style="height:${Math.max(6, (s / mx) * 100)}%"></i>`).join("") + "</span>";
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
    b.top.map((t) => `<button class="chip" data-set="${esc(t.note)}">${esc(t.note)}<i>${times(t.lift)}</i></button>`).join("") + "</div></div>").join("");

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
  const m = /[#&]n=([^&]*)/.exec(location.hash);
  setSel(m ? decodeURIComponent(m[1]).split(",").map((n) => ix.get(n)) : []);
})();
