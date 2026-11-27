(function () {
  const { $, $$, fmt, sim, wallet, toast } = window.MAKO;
  const C = window.MAKO_CONFIG;

  /* ---------- routing ---------- */
  const TITLES = { overview: "Overview", desk: "Desk", swap: "Swap", mood: "Mood Engine", burns: "Burn log" };
  function route() {
    const v = (location.hash || "#overview").slice(1);
    const key = TITLES[v] ? v : "overview";
    $$(".view").forEach(el => el.classList.toggle("active", el.id === "v-" + key));
    $$("[data-view]").forEach(a => a.classList.toggle("active", a.dataset.view === key));
    $("#viewTitle").textContent = TITLES[key];
    window.scrollTo(0, 0);
    requestAnimationFrame(drawCharts);
  }
  window.addEventListener("hashchange", route);

  if (!C.previewMode) { $("#previewBanner").remove(); $("#modePill").remove(); }
  if (C.contracts.token) $("#swCa").textContent = fmt.short(C.contracts.token);

  /* ---------- canvas line chart ---------- */
  function lineChart(canvas, data, opts = {}) {
    if (!canvas || !canvas.offsetParent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const padL = 8, padR = 64, padT = 12, padB = 20;
    const min = Math.min(...data), max = Math.max(...data);
    const span = (max - min) || 1;
    const x = i => padL + (i / (data.length - 1)) * (w - padL - padR);
    const y = v => padT + (1 - (v - min) / span) * (h - padT - padB);

    // grid + labels
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = "#4d5a6b";
    ctx.strokeStyle = "rgba(26,37,51,.8)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = padT + i * (h - padT - padB) / 4;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR + 8, gy); ctx.stroke();
      const val = max - i * span / 4;
      ctx.fillText(opts.fmt ? opts.fmt(val) : val.toFixed(2), w - padR + 14, gy + 4);
    }

    const color = opts.color || "#34b7dd";
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, color + "40"); grad.addColorStop(1, color + "00");
    ctx.beginPath();
    data.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.lineTo(x(data.length - 1), h - padB); ctx.lineTo(x(0), h - padB); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    data.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();

    // last point
    const lx = x(data.length - 1), ly = y(data[data.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2); ctx.fillStyle = color + "33"; ctx.fill();
  }

  const midHist = [];
  function drawCharts() {
    const S = sim.state;
    lineChart($("#pnlChart"), S.pnl.history, { fmt: v => "$" + fmt.compact(v) });
    if (midHist.length > 2) lineChart($("#midChart"), midHist, { color: "#93d9ee", fmt: v => v.toFixed(2) });
  }
  window.addEventListener("resize", () => requestAnimationFrame(drawCharts));
  $$("#pnlSeg button").forEach(b => b.addEventListener("click", () => {
    $$("#pnlSeg button").forEach(x => x.classList.remove("on")); b.classList.add("on");
  }));

  /* ---------- mood helpers ---------- */
  const moodPos = { feeding: 6, hunting: 28, cruising: 50, circling: 72, breach: 94 };
  const moodSpread = { feeding: "1.5 bps", hunting: "2 bps", cruising: "3 bps", circling: "6 bps", breach: "12 bps" };
  const moodBurn = { feeding: "1.5×", hunting: "1.2×", cruising: "1.0×", circling: "0.8×", breach: "2.0× bonus" };
  const fRange = { feeding: "< −0.40%", hunting: "−0.40–0%", cruising: "0–0.60%", circling: "0.60–1.20%", breach: "> 1.20%" };
  $("#moodTbl").innerHTML = sim.MOODS.map(m => `<tr data-k="${m.key}"><td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${m.color};margin-right:8px"></span>${m.label}</td><td>${fRange[m.key]}</td><td class="r">${moodSpread[m.key]}</td><td class="r">${moodBurn[m.key]}</td></tr>`).join("");

  function paintMood(root, S) {
    if (!root) return;
    root.style.setProperty("--c", S.mood.color);
    root.querySelector(".mood-name").textContent = S.mood.label;
    root.querySelector(".mood-name").style.color = S.mood.color;
    root.querySelector(".mood-desc").textContent = S.mood.desc;
    const dot = root.parentElement.querySelector(".mood-dot");
    if (dot) dot.style.left = moodPos[S.mood.key] + "%";
  }

  /* ---------- renderers ---------- */
  const fillRow = f => `<tr><td>${fmt.time(f.t)}</td><td>${f.market}</td><td class="${f.side === "buy" ? "up" : "down"}">${f.side.toUpperCase()}</td><td class="r">${f.sz}</td><td class="r hide-xs">${f.px.toFixed(3)}</td><td class="r up">+$${f.edge.toFixed(2)}</td></tr>`;
  const ago = t => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };
  const txLink = h => C.chain.explorer && !C.previewMode ? `<a href="${C.chain.explorer}/tx/${h}" target="_blank" rel="noopener">${fmt.short(h)} <svg class="ico ico-sm" style="display:inline;vertical-align:-2px"><use href="#i-external-link"/></svg></a>` : `<span class="muted">${fmt.short(h)}</span>`;

  let tick = 0, lastFill = null, lastBurn = null;
  let W = { address: null, onElysium: false, hype: null, mako: null };
  let dir = "buy"; // buy = HYPE -> MAKO
  let slip = 1;
  const amtIn = $("#amtIn");

  sim.subscribe(S => {
    tick++;
    const circ = S.supply - S.burned;
    const priceStr = fmt.usd(S.makoPrice, 6);

    // top + side
    $("#topPrice").textContent = "$MAKO " + priceStr;
    $("#sideLat").textContent = S.latency + " ms";
    $("#sideEly").textContent = "#" + fmt.num(S.elyBlock);
    $("#sideCore").textContent = "#" + fmt.num(S.coreBlock);

    // overview tiles
    $("#tPrice").textContent = priceStr;
    $("#tChange").textContent = fmt.pct(S.makoChange) + " 24h";
    $("#tMcap").textContent = "$" + fmt.compact(circ * S.makoPrice);
    $("#tBurn").textContent = fmt.compact(S.burned);
    $("#tBurnPct").textContent = (S.burned / S.supply * 100).toFixed(2) + "% of supply";
    $("#tTreas").textContent = "$" + fmt.compact(S.treasury.usd);
    $("#tPnl").textContent = fmt.usd(S.pnl.total, 0);
    $("#tPnlDay").textContent = "+" + fmt.usd(S.pnl.day, 2) + " session";
    $("#tHolders").textContent = fmt.num(S.holders);

    paintMood($("#ovMood"), S);
    paintMood($("#mdMood"), S);
    $$("#moodTbl tr").forEach(tr => tr.style.background = tr.dataset.k === S.mood.key ? "rgba(94,242,200,.05)" : "");
    $("#mFund").textContent = (S.funding * 100).toFixed(4) + "%";
    $("#mMid").textContent = fmt.usd(S.mid, 3);
    $("#mLat").textContent = S.latency + " ms";
    $("#moodUpd").textContent = "core #" + fmt.num(S.coreBlock);

    if (S.fills[0] !== lastFill) {
      lastFill = S.fills[0];
      const rows = S.fills.slice(0, 8).map(fillRow).join("") || `<tr><td colspan="6" class="empty">Waiting for fills…</td></tr>`;
      $("#ovFills").innerHTML = rows;
      $("#deskFills").innerHTML = S.fills.slice(0, 10).map(fillRow).join("");
    }
    if (S.burns[0] !== lastBurn) {
      lastBurn = S.burns[0];
      $("#ovBurns").innerHTML = S.burns.slice(0, 7).map(b => `<tr><td>${ago(b.t)}</td><td><span class="tag ${b.reason === "Wick bonus" ? "hot" : "ok"}">${b.reason}</span></td><td class="r">${fmt.num(b.amount)}</td></tr>`).join("");
      $("#burnTbl").innerHTML = S.burns.map(b => `<tr><td>${fmt.time(b.t)}</td><td><span class="tag ${b.reason === "Wick bonus" ? "hot" : "ok"}">${b.reason}</span></td><td class="r">${fmt.num(b.amount)} MAKO</td><td class="r hide-xs">${txLink(b.tx)}</td></tr>`).join("");
      if (tick > 3) toast(fmt.num(lastBurn.amount) + " MAKO burned · " + lastBurn.reason, "flame");
    }
    $("#bTotal").textContent = fmt.num(S.burned);
    $("#bPct").textContent = (S.burned / S.supply * 100).toFixed(3) + "%";
    $("#bCirc").textContent = fmt.compact(circ);
    $("#bCount").textContent = fmt.num(S.burns.length);

    // desk view
    const asks = S.book.asks.slice(0, 12).reverse(), bids = S.book.bids.slice(0, 12);
    const max = Math.max(...asks.map(l => l.cum), ...bids.map(l => l.cum));
    const lv = (l, s) => `<div class="lv ${s}${l.desk ? " desk" : ""}"><i style="width:${(l.cum / max * 100).toFixed(1)}%"></i><span class="px">${l.px.toFixed(3)}</span><span class="sz">${fmt.num(l.sz, 0)}</span><span>${fmt.compact(l.cum)}</span></div>`;
    $("#deskBook").innerHTML = `<div class="hd"><span>Price</span><span>Size</span><span>Total</span></div>` +
      asks.map(l => lv(l, "ask")).join("") +
      `<div class="spread"><b>${S.mid.toFixed(3)}</b><span class="muted">${(S.book.spread / S.mid * 10000).toFixed(1)} bps</span></div>` +
      bids.map(l => lv(l, "bid")).join("");
    $("#tape").innerHTML = S.trades.slice(0, 16).map(t => `<div><span class="${t.side === "buy" ? "up" : "down"}">${t.px.toFixed(3)}</span><span>${t.sz}</span><span>${fmt.time(t.t)}</span></div>`).join("");
    $("#pSpread").textContent = moodSpread[S.mood.key];

    const pos = 30 + Math.sin(tick / 40) * 18 + Math.random() * 4;
    const loss = Math.max(2, 14 + Math.cos(tick / 55) * 10);
    const skew = 50 + Math.sin(tick / 30) * 22;
    $("#gPos").textContent = pos.toFixed(0) + "%"; $("#gPosBar").style.width = pos + "%";
    $("#gLoss").textContent = loss.toFixed(0) + "%"; $("#gLossBar").style.width = loss + "%";
    $("#gSkew").textContent = (skew > 50 ? "long " : "short ") + Math.abs(skew - 50).toFixed(0) + "%";
    $("#gSkewBar").style.width = skew + "%"; $("#gSkewBar").classList.toggle("w", Math.abs(skew - 50) > 18);
    const ds = $("#deskState");
    const paused = S.mood.key === "breach";
    ds.className = "pill " + (paused ? "warn" : "mint") + " live";
    ds.innerHTML = `<span class="dot"></span>${paused ? "Wick mode" : "Quoting"}`;

    if (tick % 3 === 0) { midHist.push(S.mid); if (midHist.length > 160) midHist.shift(); }
    if (tick % 6 === 0) drawCharts();

    updateQuote();
  });

  /* ---------- wallet UI ---------- */
  const btn = $("#connectBtn");
  wallet.subscribe(s => {
    W = s;
    if (s.address) {
      btn.classList.remove("btn-primary");
      btn.innerHTML = `<span class="av"></span><span class="addr">${fmt.short(s.address)}</span>`;
    } else {
      btn.classList.add("btn-primary");
      btn.innerHTML = `<svg class="ico ico-sm"><use href="#i-wallet"/></svg>Connect wallet`;
    }
    $("#wrongNet").style.display = s.address && !s.onElysium ? "" : "none";
    $("#ob1").classList.toggle("done", !!s.address);
    $("#ob2").classList.toggle("done", !!s.onElysium);
    updateBalances();
    updateQuote();
  });

  btn.addEventListener("click", async () => {
    if (W.address) { navigator.clipboard && navigator.clipboard.writeText(W.address); return toast("Address copied", "check"); }
    try { await wallet.connect(); } catch (e) { toast(e && e.message ? e.message.slice(0, 80) : "Connection rejected"); }
  });
  $("#wrongNet").addEventListener("click", () => wallet.ensureNetwork().catch(e => toast(e.message || "Network switch rejected")));
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    const run = act === "connect" ? wallet.connect : act === "network" ? wallet.ensureNetwork : wallet.watchToken;
    run().catch(err => toast((err && err.message) || "Request rejected"));
  });

  /* ---------- swap ---------- */
  $$("#slip button").forEach(b => b.addEventListener("click", () => {
    $$("#slip button").forEach(x => x.classList.remove("on")); b.classList.add("on");
    slip = parseFloat(b.textContent); updateQuote();
  }));

  amtIn.addEventListener("input", () => {
    amtIn.value = amtIn.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    updateQuote();
  });

  $("#flipBtn").addEventListener("click", () => {
    dir = dir === "buy" ? "sell" : "buy";
    const a = $("#tokIn").innerHTML; $("#tokIn").innerHTML = $("#tokOut").innerHTML; $("#tokOut").innerHTML = a;
    amtIn.value = ""; updateBalances(); updateQuote();
  });

  $("#maxBtn").addEventListener("click", () => {
    const bal = dir === "buy" ? W.hype : W.mako;
    if (bal == null) return toast("Connect on Elysium to load balance");
    amtIn.value = String(dir === "buy" ? Math.max(0, bal - 0.001).toFixed(4) : bal);
    updateQuote();
  });

  function updateBalances() {
    const h = W.hype == null ? "—" : fmt.num(W.hype, 4);
    const m = W.mako == null ? "—" : fmt.num(W.mako, 0);
    $("#balIn").textContent = dir === "buy" ? h : m;
    $("#balOut").textContent = dir === "buy" ? m : h;
  }

  function updateQuote() {
    const S = sim.state;
    const x = parseFloat(amtIn.value) || 0;
    const hypePerMako = S.makoPrice / S.mid;
    const poolHype = 420_000 / S.mid * 10; // illustrative depth
    const impact = Math.min(25, (dir === "buy" ? x : x * hypePerMako) / poolHype * 100);
    const out = dir === "buy" ? (x / hypePerMako) * (1 - impact / 100) : (x * hypePerMako) * (1 - impact / 100);
    $("#amtOut").value = x ? (dir === "buy" ? fmt.num(out, 0) : fmt.num(out, 6)) : "";
    const usdIn = dir === "buy" ? x * S.mid : x * S.makoPrice;
    $("#usdIn").textContent = fmt.usd(usdIn);
    $("#usdOut").textContent = fmt.usd(usdIn * (1 - impact / 100));
    $("#rate").textContent = `1 HYPE = ${fmt.num(1 / hypePerMako, 0)} MAKO`;
    $("#minOut").textContent = x ? (dir === "buy" ? fmt.num(out * (1 - slip / 100), 0) + " MAKO" : fmt.num(out * (1 - slip / 100), 6) + " HYPE") : "—";
    const imp = $("#impact"); imp.textContent = x ? impact.toFixed(2) + "%" : "—"; imp.className = impact > 3 ? "down" : "";

    const sb = $("#swapBtn");
    const bal = dir === "buy" ? W.hype : W.mako;
    if (!W.address) { sb.textContent = "Connect wallet"; sb.disabled = false; sb.dataset.state = "connect"; }
    else if (!W.onElysium) { sb.textContent = "Switch to Elysium"; sb.disabled = false; sb.dataset.state = "network"; }
    else if (!C.contracts.token) { sb.textContent = "Trading opens at launch"; sb.disabled = true; sb.dataset.state = ""; }
    else if (!x) { sb.textContent = "Enter an amount"; sb.disabled = true; sb.dataset.state = ""; }
    else if (bal != null && x > bal) { sb.textContent = "Insufficient balance"; sb.disabled = true; sb.dataset.state = ""; }
    else { sb.textContent = dir === "buy" ? "Buy $MAKO" : "Sell $MAKO"; sb.disabled = false; sb.dataset.state = "swap"; }
  }

  $("#swapBtn").addEventListener("click", () => {
    const st = $("#swapBtn").dataset.state;
    if (st === "connect") return wallet.connect().catch(() => {});
    if (st === "network") return wallet.ensureNetwork().catch(e => toast(e.message || "Rejected"));
    if (st === "swap") {
      if (C.links.swap) window.open(C.links.swap, "_blank", "noopener");
      else toast("Set links.swap in config.js to the official pool");
    }
  });

  route();
})();
