(function () {
  const { $, $$, fmt, sim } = window.MAKO;
  const C = window.MAKO_CONFIG;

  if (C.contracts.token) {
    $("#caText").textContent = "CA: " + C.contracts.token;
    $("#caCopy").setAttribute("data-copy", C.contracts.token);
  }

  /* =======================================================
     Halftone dot fin (3D point cloud, perspective, depth shading)
     ======================================================= */
  const finCanvas = $("#finCanvas");
  const pts = [];
  (function buildFin() {
    const xL = y => 0.72 * Math.pow(y, 1.7);              // leading edge (convex, swept back)
    const xT = y => 1.0 - 0.28 * Math.pow(y, 0.45);       // trailing edge (concave notch)
    const ROWS = 44;
    for (let r = 0; r <= ROWS; r++) {
      const y = r / ROWS;
      const a = xL(y), b = xT(y);
      const chord = Math.max(0, b - a);
      const cols = Math.max(1, Math.round(chord * 46));
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const x = a + chord * u;
        const th = 0.11 * (1 - y * 0.9) * Math.pow(Math.sin(Math.PI * u), 0.55);
        pts.push({ x: x - 0.55, y: y * 1.05, z: th, kind: 1 });
        pts.push({ x: x - 0.55, y: y * 1.05, z: -th, kind: 1 });
      }
    }
    // water plane
    for (let i = -26; i <= 26; i++) {
      for (let j = -16; j <= 16; j++) {
        const x = i * 0.05, z = j * 0.05;
        const d = Math.hypot(x, z);
        if (d > 1.3) continue;
        pts.push({ x, y: 0, z, kind: 0, d });
      }
    }
  })();

  let finT = 0;
  function drawFin() {
    if (!finCanvas.offsetParent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = finCanvas.clientWidth, h = finCanvas.clientHeight;
    if (finCanvas.width !== w * dpr) { finCanvas.width = w * dpr; finCanvas.height = h * dpr; }
    const ctx = finCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const rot = Math.sin(finT * 0.35) * 0.75 + 0.35;
    const tilt = 0.32;
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    const scale = Math.min(w, h) * 0.66;
    const cx = w * 0.5, cy = h * 0.74;
    const bob = Math.sin(finT * 1.2) * 0.015;

    const proj = [];
    for (const p of pts) {
      let y = p.y;
      if (p.kind === 0) y = Math.sin(p.d * 9 - finT * 2.2) * 0.018 * (1.3 - p.d);
      else y += bob;
      // rotate around Y
      const x1 = p.x * cr + p.z * sr;
      const z1 = -p.x * sr + p.z * cr;
      // tilt around X
      const y2 = y * ct - z1 * st;
      const z2 = y * st + z1 * ct;
      const persp = 2.6 / (2.6 + z2);
      proj.push({ sx: cx + x1 * scale * persp, sy: cy - y2 * scale * persp, z: z2, p, persp, side: p.z });
    }
    proj.sort((a, b) => b.z - a.z);

    for (const q of proj) {
      const depth = Math.max(0, Math.min(1, (1.2 - q.z) / 2.2));
      if (q.p.kind === 0) {
        const fade = Math.max(0, 1 - q.p.d / 1.3);
        ctx.fillStyle = `rgba(52,183,221,${(0.12 + 0.5 * fade * depth).toFixed(3)})`;
        const r = 1.1 + 1.3 * fade * q.persp;
        ctx.fillRect(q.sx - r / 2, q.sy - r / 2, r, r);
      } else {
        // facing: side sign vs rotation gives a lit / shaded face
        const facing = (q.side >= 0 ? 1 : -1) * Math.cos(rot - 0.5);
        const light = 0.45 + 0.55 * Math.max(0, facing) * 0.9 + q.p.y * 0.25;
        const r = (1.4 + 2.1 * light) * q.persp;
        const c = light > 0.75 ? "255,255,255" : light > 0.55 ? "219,242,249" : "111,205,232";
        ctx.fillStyle = `rgba(${c},${(0.35 + 0.65 * depth).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(q.sx, q.sy, r / 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function loop() { finT += 0.016; drawFin(); if (!reduce) requestAnimationFrame(loop); })();
  window.addEventListener("resize", drawFin);

  /* =======================================================
     Ticker band
     ======================================================= */
  const band = $("#band");
  function bandHtml(S) {
    const ch = v => `<i class="${v >= 0 ? "up" : "down"}">${fmt.pct(v)}</i>`;
    const items = [
      ["$MAKO", fmt.usd(S.makoPrice, 6), ch(S.makoChange)],
      ["HYPE-PERP", fmt.usd(S.mid, 3), ch((S.mid / 38.42 - 1) * 100)],
      ["Funding 1h", (S.funding * 100).toFixed(4) + "%", ""],
      ["Burned", fmt.compact(S.burned) + " MAKO", ""],
      ["Desk PnL", fmt.usd(S.pnl.total, 0), ""],
      ["Mood", S.mood.label, ""],
      ["Block time", "100 ms", ""],
      ["Gas", "HYPE", ""],
    ];
    const one = items.map(([k, v, c]) => `<span>${k} <b>${v}</b>${c}</span>`).join("");
    return one + one;
  }

  /* =======================================================
     Widget: tabs, chart, mood
     ======================================================= */
  $$("#wTabs button").forEach(b => b.addEventListener("click", () => {
    $$("#wTabs button").forEach(x => x.classList.toggle("on", x === b));
    $("#wBook").hidden = b.dataset.t !== "book";
    $("#wMood").hidden = b.dataset.t !== "mood";
    drawChart();
  }));

  const moodPos = { feeding: 6, hunting: 28, cruising: 50, circling: 72, breach: 94 };
  const fRange = { feeding: "< -0.40%", hunting: "-0.40 to 0%", cruising: "0 to 0.60%", circling: "0.60 to 1.20%", breach: "> 1.20%" };
  $("#moodList").innerHTML = sim.MOODS.map(m => `<div data-k="${m.key}"><i style="background:${m.color}"></i><span>${m.label}</span><span>${fRange[m.key]}</span></div>`).join("");

  const hist = [];
  let fillsSession = 0, lastFill = null;
  const chart = $("#wChart");

  function drawChart() {
    if (!chart.offsetParent || hist.length < 3) return;
    const S = sim.state;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = chart.clientWidth, h = chart.clientHeight;
    chart.width = w * dpr; chart.height = h * dpr;
    const ctx = chart.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const bid = S.book.bids[0].px, ask = S.book.asks[0].px;
    const vals = hist.concat([bid - 0.02, ask + 0.02]);
    let min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.15 || 0.05; min -= pad; max += pad;
    const padR = 92, padB = 8, padT = 8;
    const plotW = w - padR;
    const plotLeftW = plotW * 0.58;
    const y = v => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
    const x = i => (i / (hist.length - 1)) * plotLeftW;

    // y-axis labels + grid
    ctx.font = "12px 'Geist Mono', monospace";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 5; i++) {
      const v = max - i * (max - min) / 5, gy = y(v);
      ctx.strokeStyle = "rgba(22,59,68,.7)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke();
      ctx.fillStyle = "#5f828b"; ctx.fillText(v.toFixed(3), plotW + 12, gy);
    }

    // future zone: desk quote bands (Omnibook-style)
    const zx = plotLeftW + 6, zw = plotW - zx;
    ctx.fillStyle = "rgba(62,230,168,.13)";
    ctx.fillRect(zx, y(bid), zw, h - padB - y(bid));
    ctx.fillStyle = "rgba(255,82,82,.13)";
    ctx.fillRect(zx, padT, zw, y(ask) - padT);
    ctx.strokeStyle = "rgba(62,230,168,.55)"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(zx, y(bid)); ctx.lineTo(plotW, y(bid)); ctx.stroke();
    ctx.strokeStyle = "rgba(255,82,82,.55)";
    ctx.beginPath(); ctx.moveTo(zx, y(ask)); ctx.lineTo(plotW, y(ask)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(147,179,187,.35)";
    ctx.beginPath(); ctx.moveTo(zx, padT); ctx.lineTo(zx, h - padB); ctx.stroke();

    // price line
    ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    hist.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.stroke();
    const lx = x(hist.length - 1), ly = y(hist[hist.length - 1]);
    ctx.fillStyle = "#34b7dd"; ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(52,183,221,.5)"; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(plotW, ly); ctx.stroke(); ctx.setLineDash([]);

    // right-edge tags
    const tag = (txt, ty, bg, fg) => {
      ctx.font = "600 12px 'Geist Mono', monospace";
      const tw = ctx.measureText(txt).width + 12;
      ctx.fillStyle = bg; ctx.fillRect(plotW + 4, ty - 10, tw, 20);
      ctx.fillStyle = fg; ctx.fillText(txt, plotW + 10, ty + 1);
    };
    // in-zone labels
    ctx.font = "600 12px 'DM Sans', sans-serif"; ctx.textAlign = "right";
    ctx.fillStyle = "#ff5252"; ctx.fillText("Desk ask " + ask.toFixed(3), plotW - 8, y(ask) - 12);
    ctx.fillStyle = "#3ee6a8"; ctx.fillText("Desk bid " + bid.toFixed(3), plotW - 8, y(bid) + 14);
    ctx.textAlign = "left";
    tag(hist[hist.length - 1].toFixed(3), ly, "#34b7dd", "#04181c");
  }
  window.addEventListener("resize", drawChart);

  /* =======================================================
     Code tabs
     ======================================================= */
  const CODE = {
    sol: `<span class="c">// Read Mako's live mood from your contract</span>
<span class="k">IMakoDesk</span> desk = <span class="k">IMakoDesk</span>(MAKO_DESK);
<span class="k">IMakoDesk.DeskState</span> <span class="k">memory</span> s = desk.state();

<span class="k">if</span> (s.mood == <span class="k">IMakoDesk.Mood</span>.Breach) {
    <span class="c">// wick bonus armed: the desk is buying the flush</span>
}`,
    viem: `<span class="k">const</span> mood = <span class="k">await</span> client.readContract({
  address: MAKO_DESK,
  abi: makoDeskAbi,
  functionName: <span class="s">"mood"</span>,
});
console.log(<span class="s">"Mako is"</span>, MOODS[mood]);`,
    cast: `cast call $MAKO_DESK <span class="s">"mood()(uint8)"</span> \\
  --rpc-url $ELYSIUM_RPC

cast logs --address $MAKO_DESK \\
  <span class="s">"Burned(uint256,bytes32,uint256)"</span>`,
  };
  const pre = $("#codePre");
  let codeKey = "sol";
  const setCode = k => { codeKey = k; pre.innerHTML = CODE[k]; $$("#codeTabs button").forEach(b => b.classList.toggle("on", b.dataset.c === k)); };
  $$("#codeTabs button").forEach(b => b.addEventListener("click", () => setCode(b.dataset.c)));
  $("#codeCopy").addEventListener("click", () => {
    navigator.clipboard && navigator.clipboard.writeText(pre.textContent).then(() => window.MAKO.toast("Copied to clipboard", "check"));
  });
  setCode("sol");

  /* =======================================================
     Live updates
     ======================================================= */
  let n = 0;
  sim.subscribe(S => {
    n++;
    if (n % 3 === 0 || hist.length < 3) { hist.push(S.mid); if (hist.length > 120) hist.shift(); }
    if (S.fills[0] && S.fills[0] !== lastFill) { lastFill = S.fills[0]; fillsSession++; }

    $("#wMid").textContent = fmt.usd(S.mid, 3);
    const chg = (S.mid / 38.42 - 1) * 100;
    const wc = $("#wChg"); wc.textContent = fmt.pct(chg) + " 24h"; wc.className = chg >= 0 ? "up" : "down";
    $("#wBid").textContent = S.book.bids[0].px.toFixed(3);
    $("#wAsk").textContent = S.book.asks[0].px.toFixed(3);
    $("#wSpr").textContent = (S.book.spread / S.mid * 10000).toFixed(1) + " bps";
    $("#wFills").textContent = fmt.num(fillsSession);
    $("#wLat").textContent = S.latency + " ms";
    $("#wFund").textContent = (S.funding * 100).toFixed(4) + "%";

    $("#moodName").textContent = S.mood.label;
    $("#moodName").style.color = S.mood.color;
    $("#moodFin").style.color = S.mood.color;
    $("#moodDesc").textContent = S.mood.desc;
    $("#moodDot").style.left = moodPos[S.mood.key] + "%";
    $$("#moodList div").forEach(d => d.classList.toggle("on", d.dataset.k === S.mood.key));

    $("#finTagA").textContent = "$MAKO " + fmt.usd(S.makoPrice, 6);
    $("#finTagB").textContent = "mood: " + S.mood.label.toLowerCase();

    if (n % 2 === 0) drawChart();
    if (n % 10 === 1) band.innerHTML = bandHtml(S);
  });
})();
