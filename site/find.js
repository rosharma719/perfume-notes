(function () {
  "use strict";
  const A = window.APP;
  const { P, N, notes, ix, F, has, fs, esc, fmt, fragItem, ratingScore } = A;
  const $ = (id) => document.getElementById(id);
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const hay = P.map((p) => norm(p[0] + " " + p[1]));
  const brandN = P.map((p) => norm(p[1]));
  const nameN = P.map((p) => norm(p[0]));
  const isGen = (i) => /(Notes|Accord)$/.test(notes[i]);

  let cur = null;                       // {k, example} for a perfume result, or null
  const picked = new Set();             // scent chips
  let same = false;                     // include other perfumes from the same house

  /* ---------- finding a perfume by name ---------- */
  function search(q) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length || norm(q).length < 2) return [];
    const out = [];
    for (let k = 0; k < N; k++) if (toks.every((t) => hay[k].includes(t))) { out.push(k); if (out.length > 400) break; }
    // what people mean: the exact name first, then names that start with it, then the most reviewed
    const nq = norm(q).trim();
    const tier = (k) => (nameN[k] === nq ? 2 : nameN[k].startsWith(nq) ? 1 : 0);
    out.sort((a, b) => tier(b) - tier(a) || P[b][8] - P[a][8] || nameN[a].length - nameN[b].length);
    return out.slice(0, 6);
  }
  function lookup(brand, name) {
    let best = -1, bs = -1;
    const bn = norm(brand), nn = norm(name);
    for (let k = 0; k < N; k++) {
      if (!brandN[k].includes(bn) || !nameN[k].startsWith(nn)) continue;
      const s = (nameN[k] === nn ? 1e6 : 0) + P[k][8];
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  }
  const EXAMPLES = [["Dior", "Sauvage"], ["Creed", "Aventus"], ["Yves Saint Laurent", "Black Opium"], ["Dolce", "Light Blue"],
    ["Chanel", "Bleu de Chanel"], ["Maison Francis Kurkdjian", "Baccarat Rouge 540"], ["Tom Ford", "Oud Wood"], ["Chanel", "Coco Mademoiselle"]];

  /* ---------- similar perfumes ---------- */
  // Rarity-weighted note overlap (a shared Ambergris says more than a shared Musk), blended with agreement on
  // accords (fresh, spicy, woody...) when both perfumes have them, then nudged toward perfumes people know.
  const idf = notes.map((n, i) => (isGen(i) ? 0 : Math.log(N / Math.max(F[i], 1))));
  const accN = (A.D.accords || []).length;
  const accDf = new Array(accN).fill(0); let accTotal = 0;
  P.forEach((p) => { if (p[9] && p[9].length) { accTotal++; p[9].forEach((x) => accDf[x]++); } });
  const accW = accDf.map((c) => (c ? Math.log(accTotal / c) : 0));
  const noteW = new Float32Array(N), accNorm = new Float32Array(N);
  for (let j = 0; j < N; j++) {
    let w = 0; for (const i of P[j][4]) w += idf[i]; noteW[j] = w;
    let n2 = 0; if (P[j][9]) for (const x of P[j][9]) n2 += accW[x] * accW[x]; accNorm[j] = Math.sqrt(n2);
  }
  function similarTo(k, withSameHouse) {
    const mine = new Uint8Array(notes.length), accMine = new Uint8Array(accN);
    P[k][4].forEach((i) => (mine[i] = 1));
    (P[k][9] || []).forEach((x) => (accMine[x] = 1));
    const out = [];
    for (let j = 0; j < N; j++) {
      if (j === k) continue;
      const ids = P[j][4];
      if (ids.length < 3) continue;
      let inter = 0, wInter = 0;
      for (const i of ids) if (mine[i]) { inter++; wInter += idf[i]; }
      if (inter < 2) continue;
      if (brandN[j] === brandN[k] && (nameN[j] === nameN[k] || !withSameHouse)) continue;
      let s = wInter / Math.max(noteW[k] + noteW[j] - wInter, 1e-9);
      const accs = P[j][9];
      if (accNorm[k] && accNorm[j] && accs) {
        let dot = 0; for (const x of accs) if (accMine[x]) dot += accW[x] * accW[x];
        s = 0.4 * s + 0.6 * (dot / (accNorm[k] * accNorm[j]));
      }
      if (s < 0.2) continue;
      const pop = Math.min(1, Math.log10(1 + P[j][8]) / 3);
      out.push({ j, s, inter, rank: s * (0.45 + 0.55 * pop) });
    }
    out.sort((a, b) => b.rank - a.rank);
    return out;
  }
  const rare = (list, n) => list.filter((i) => !isGen(i)).sort((a, b) => F[a] - F[b]).slice(0, n).map((i) => esc(notes[i])).join(", ");
  const sharedAcc = (k, j) => (P[k][9] || []).filter((x) => (P[j][9] || []).includes(x)).slice(0, 3).map((x) => A.D.accords[x]);

  function renderSimilar(k, example) {
    cur = { k, example: !!example };
    const [name, brand] = P[k];
    const sim = similarTo(k, same), mineSet = new Set(P[k][4]);
    const card = (r) => {
      const ids = P[r.j][4];
      const adds = rare(ids.filter((i) => !mineSet.has(i)), 3);
      const lacks = rare([...mineSet].filter((i) => !ids.includes(i)), 3);
      const both = sharedAcc(k, r.j);
      const reasons = `<span class="why love">${Math.round(r.s * 100)}% alike</span>` + (both.length >= 2 ? `<span class="why love">Both ${both.map(esc).join(", ")}</span>` : "") +
        (adds ? `<span class="why gap">Adds ${adds}</span>` : "") + (lacks ? `<span class="why warn">Without ${lacks}</span>` : "");
      return fragItem(r.j, { sel: mineSet, ctx: "find", reasons });
    };
    const top = sim.slice(0, 6), twist = sim.slice(6, 12);
    $("find-out").innerHTML =
      (example ? `<p class="eg-cap">Here’s an example: <b>if you like ${esc(name)}</b>. Type your own perfume above.</p>` : `<h3 class="res-h">If you like <b>${esc(name)}</b>, try</h3>`) +
      `<div class="tag">Your pick</div><ul class="flist pickcard">${fragItem(k, { ctx: "pick" })}</ul>` +
      `<label class="chk house"><input type="checkbox" id="same-house"${same ? " checked" : ""}> Include other ${esc(brand)} perfumes</label>` +
      (top.length ? `<h3 class="res-h">Closest matches</h3><ul class="flist">${top.map(card).join("")}</ul>` : `<p class="hint">No close matches in the catalog.</p>`) +
      (twist.length ? `<h3 class="res-h">Same feel, different twist</h3><ul class="flist">${twist.map(card).join("")}</ul>` : "") +
      (top.length ? `<p class="hint">Coloured pills are notes shared with ${esc(name)}. “Adds” and “Without” show what differs. Well-known perfumes are favoured.</p>` : "") +
      next();
  }

  /* ---------- from scents ---------- */
  function renderNotes() {
    const sel = [...picked].map((n) => ix.get(n)), need = sel.length;
    if (!need) { if (defaultK >= 0) renderSimilar(defaultK, true); return; }
    cur = null;
    const full = [], near = [];
    for (let k = 0; k < N; k++) {
      let sc = 0; for (const i of sel) sc += has[i][k];
      if (sc === need) full.push(k); else if (need >= 2 && sc === need - 1) near.push(k);
    }
    const rank = (a, b) => (ratingScore(b) - ratingScore(a)) || P[a][4].length - P[b][4].length;
    full.sort(rank); near.sort(rank);
    const shown = full.slice(0, 8).concat(full.length < 6 ? near.slice(0, 6) : []);
    const selSet = new Set(sel), names = [...picked];
    const item = (k) => fragItem(k, { sel: selSet, ctx: "find", missing: sel.filter((i) => !P[k][4].includes(i)).map((i) => notes[i]) });
    $("find-out").innerHTML =
      `<h3 class="res-h">Perfumes with <b>${names.map(esc).join(" + ")}</b> <span class="cnt">${fmt(full.length)}</span></h3>` +
      (shown.length ? `<ul class="flist">${shown.map(item).join("")}</ul>` : `<p class="hint">Nothing has all of these. Try fewer scents.</p>`) +
      (full.length > 8 ? `<p class="next"><button class="act" data-set="${esc(names.join("|"))}" data-go="frags">See all ${fmt(full.length)} with filters</button></p>` : "") +
      `<p class="hint">Best-rated first. Coloured pills are the scents you picked.</p>` + next();
  }
  const next = () => `<p class="next">Like these? <button class="act" data-view="collection">Add what you own</button> and <button class="act" data-view="shop">get picks tailored to you</button>.</p>`;

  /* ---------- wiring ---------- */
  const QUICK = ["Vanilla", "Rose", "Oud", "Vetiver", "Lavender", "Jasmine", "Sandalwood", "Tonka Bean", "Leather", "Coffee", "Iris", "Honey", "Bergamot", "Patchouli", "Amber", "Citrus"].filter((n) => ix.has(n));
  const paintChips = () => ($("fn-chips").innerHTML = QUICK.map((n) => `<button class="chip qn${picked.has(n) ? " on" : ""}" data-qn="${esc(n)}" style="${fs(ix.get(n))}">${esc(n)}</button>`).join(""));
  let defaultK = -1;
  const examples = EXAMPLES.map(([b, n]) => [lookup(b, n), n]).filter(([k]) => k >= 0).slice(0, 6);
  if (examples.length) defaultK = examples[0][0];
  $("fp-eg").innerHTML = examples.map(([k, n]) => `<button class="linkish" data-pick="${k}">${esc(n)}</button>`).join(" · ");
  paintChips();

  $("fp-q").addEventListener("input", (e) => {
    const r = search(e.target.value);
    $("fp-sugg").innerHTML = r.map((k) => `<li><button data-pick="${k}"><b>${esc(P[k][0])}</b> <span>${esc(P[k][1])}${P[k][2] ? " · " + P[k][2] : ""}</span>${P[k][7] ? `<i>★ ${(P[k][7] / 10).toFixed(1)}</i>` : ""}</button></li>`).join("");
  });
  $("fp-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const b = $("fp-sugg").querySelector("[data-pick]"); if (b) pick(+b.dataset.pick); }
    if (e.key === "Escape") { e.target.value = ""; $("fp-sugg").innerHTML = ""; }
  });
  function pick(k) {
    picked.clear(); paintChips();
    $("fp-q").value = P[k][0]; $("fp-sugg").innerHTML = ""; $("fp-q").blur();
    renderSimilar(k, false);
    $("find-out").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.addEventListener("click", (e) => {
    let el;
    if ((el = e.target.closest("#v-find [data-pick]"))) { pick(+el.dataset.pick); return; }
    if ((el = e.target.closest("#v-find [data-qn]"))) {
      const n = el.dataset.qn;
      if (picked.has(n)) picked.delete(n); else picked.add(n);
      el.classList.toggle("on", picked.has(n));
      $("fp-q").value = "";
      renderNotes();
      if (picked.size === 1) $("find-out").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  document.addEventListener("change", (e) => { if (e.target.id === "same-house" && cur) { same = e.target.checked; renderSimilar(cur.k, cur.example); } });

  // refresh after Own / Not for me
  A.hooks.find = () => { if (cur) renderSimilar(cur.k, cur.example); else if (picked.size) renderNotes(); };
  if (defaultK >= 0) renderSimilar(defaultK, true);
})();
