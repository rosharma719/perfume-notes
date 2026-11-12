(function () {
  "use strict";
  const D = window.DATA, N = D.n, notes = D.notes, F = D.freq, P = D.perfumes, FO = D.family_of;
  const ix = new Map(notes.map((n, i) => [n, i]));
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => n.toLocaleString("en-US");
  const pct = (x) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + "%";
  const times = (x) => (x >= 10 ? x.toFixed(0) : x.toFixed(1)) + "×";

  // family colours: [background, text]
  const PAL = [
    ["#ffd60a", "#111"], // Citrus
    ["#ffb3c7", "#111"], // White Floral
    ["#e63946", "#fff"], // Rose & Garden Floral
    ["#6b4226", "#fff"], // Woody
    ["#f08a24", "#111"], // Amber & Resin
    ["#a59aa8", "#111"], // Musk & Animal
    ["#b5179e", "#fff"], // Sweet & Gourmand
    ["#7bd88f", "#111"], // Fruity
    ["#8f1d14", "#fff"], // Spicy
    ["#1d8a4c", "#fff"], // Green & Herbal
    ["#3a7bff", "#fff"], // Aquatic & Aldehydic
    ["#5d6b4a", "#fff"], // Earthy & Mossy
  ];
  const colOf = (i) => PAL[FO[i]];
  const style = (i) => `--c:${colOf(i)[0]};--f:${colOf(i)[1]}`;

  $("n-perf").textContent = fmt(N);
  $("n-notes").textContent = notes.length;
  $("strip").innerHTML = PAL.map((p) => `<i style="background:${p[0]}"></i>`).join("");

  // presence matrix
  const has = notes.map(() => new Uint8Array(N));
  P.forEach((p, k) => p[4].forEach((i) => (has[i][k] = 1)));

  /* ---------- two-letter symbols, most popular notes choose first ---------- */
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
    return `<div class="fam" style="--c:${PAL[fi][0]}"><h4>${esc(D.families[fi])}</h4><div class="g" style="grid-template-columns:repeat(${cols},4.7rem)">` +
      list.map((i) =>
        `<button class="tile" data-i="${i}" style="${style(i)}" title="${esc(notes[i])}: ${fmt(F[i])} perfumes">` +
        `<span class="rk">${i + 1}</span><span class="lf"></span><b class="sy">${sym[i]}</b><span class="nm">${esc(notes[i])}</span></button>`
      ).join("") + "</div></div>";
  }).join("");
  const tiles = [...board.querySelectorAll(".tile")];
  const tileOf = new Map(tiles.map((t) => [+t.dataset.i, t]));

  let sel = [];
  const chip = (i, attr) => `<button class="chip" ${attr || `data-set="${esc(notes[i])}"`} style="${style(i)}">${esc(notes[i])}</button>`;
  const chipSet = (names) => names.map((n) => chip(ix.get(n), `data-set="${esc(names.join("|"))}"`));

  document.addEventListener("click", (e) => {
    const t = e.target.closest(".tile, [data-tog]");
    if (t) { toggle(+(t.dataset.i ?? t.dataset.tog)); return; }
    const s = e.target.closest("[data-set]");
    if (s) { setSel(s.dataset.set.split("|").map((n) => ix.get(n))); $("table").scrollIntoView({ behavior: "smooth" }); return; }
    if (e.target.closest("[data-clear]")) setSel([]);
  });
  function toggle(i) { setSel(sel.includes(i) ? sel.filter((x) => x !== i) : sel.concat(i)); }
  function setSel(list) {
    sel = list.filter((i) => i !== undefined);
    try { history.replaceState(null, "", sel.length ? "#n=" + encodeURIComponent(sel.map((i) => notes[i]).join(",")) : location.pathname); } catch (e) {}
    render();
  }

  function render() {
    const panel = $("panel"), dock = $("dock");
    tiles.forEach((t) => { t.classList.remove("sel", "cold"); t.style.opacity = ""; t.querySelector(".lf").textContent = ""; });
    if (!sel.length) {
      panel.innerHTML = `<p class="empty">Pick a note.<span>The table will relight: bright tiles pair with it far more than chance, faded ones avoid it. Stack a second or third tile to narrow it down to the perfumes that contain all of them.</span></p>`;
      dock.classList.remove("on"); return;
    }
    const match = [];
    for (let k = 0; k < N; k++) { let ok = 1; for (const i of sel) if (!has[i][k]) { ok = 0; break; } if (ok) match.push(k); }
    const M = match.length;
    const cnt = new Int32Array(notes.length);
    for (const k of match) for (const i of P[k][4]) cnt[i]++;

    const cand = [];
    for (let i = 0; i < notes.length; i++) {
      if (sel.includes(i)) continue;
      const share = M ? cnt[i] / M : 0, base = F[i] / N;
      cand.push({ i, c: cnt[i], share, lift: share / base, exp: M * base });
    }
    // relight the table
    sel.forEach((i) => tileOf.get(i).classList.add("sel"));
    cand.forEach((d) => {
      const t = tileOf.get(d.i);
      if (!M || d.c === 0) { t.style.opacity = ".1"; t.classList.add("cold"); return; }
      const s = Math.max(0, Math.min(1, (d.lift - 0.7) / 2.3));
      t.style.opacity = (0.16 + 0.84 * s).toFixed(2);
      if (d.lift < 0.9) t.classList.add("cold");
      if (d.c >= 5) t.querySelector(".lf").textContent = times(d.lift);
    });

    const label = sel.map((i) => notes[i]).join(" + ");
    let h = `<div class="sels">${sel.map((i) => chip(i, `data-tog="${i}"`)).join("")}</div>`;
    h += `<p class="count"><b>${fmt(M)}</b>${M ? `of ${fmt(N)} perfumes (${pct(M / N)}) contain ${sel.length > 1 ? "all of these" : "this note"}.` : "perfumes combine these. Remove one."}</p>`;
    h += `<a class="clear" href="#" data-clear onclick="return false">Clear selection</a>`;
    if (M) {
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
      const ex = match.slice().sort((a, b) => P[a][4].length - P[b][4].length || P[b][2] - P[a][2]).slice(0, 12);
      h += `<h5>Cleanest examples</h5><p class="hint">Fewest other notes, so the combo is the main event.</p><ul class="plist plain">` +
        ex.map((k) => `<li><span class="y">${P[k][2] || ""}</span><span class="n">${esc(P[k][0])}</span><span class="b">${esc(P[k][1])}</span></li>`).join("") + "</ul>";
    }
    panel.innerHTML = h;
    $("dock-txt").textContent = `${label} · ${fmt(M)} perfumes`;
    dock.classList.add("on");
  }

  /* ---------- insight sections ---------- */
  const pairHTML = (names, big, meta, between) =>
    `<div class="pair"><div class="c">${chipSet(names).join(between || '<span class="x">+</span>')}</div><div class="n">${big}</div><div class="m">${meta}</div></div>`;
  $("t-surprising").innerHTML = D.surprising.slice(0, 16).map((d) => pairHTML([d.a, d.b], times(d.lift), fmt(d.n) + " perfumes")).join("");
  $("t-avoid").innerHTML = D.avoid.slice(0, 16).map((d) =>
    pairHTML([d.a, d.b], fmt(d.n), `seen · ${fmt(d.expected)} expected`, '<span class="x">&times;</span>')).join("");

  const rowTrio = (d) => `<div class="row"><div class="grow">${chipSet(d.notes).join(" ")}</div><span class="m">${fmt(d.n)}</span><span class="v">${times(d.lift)}</span></div>`;
  $("t-trios").innerHTML = D.trios.slice(0, 14).map(rowTrio).join("");
  $("t-common").innerHTML = D.trios_common.slice(0, 14).map(rowTrio).join("");

  const bars = (d) => {
    const mx = Math.max(...d.share);
    return `<span class="bars" style="${style(ix.get(d.note))}" title="${D.bins.join(" · ")}">` +
      d.share.map((s) => `<i style="height:${Math.max(6, (s / mx) * 100)}%"></i>`).join("") + "</span>";
  };
  const timeRow = (d) => `<div class="row">${chip(ix.get(d.note))}<span class="grow"></span>${bars(d)}<span class="v">${pct(d.share[d.share.length - 1])}</span><span class="m">from ${pct(d.share[0])}</span></div>`;
  const byDelta = D.time.slice().sort((a, b) => b.delta - a.delta);
  $("t-rise").innerHTML = byDelta.slice(0, 12).map(timeRow).join("");
  $("t-fall").innerHTML = byDelta.slice(-12).reverse().map(timeRow).join("");

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
