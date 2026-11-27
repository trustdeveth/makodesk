/* =========================================================
   Preview market engine.
   Simulates what the HyperCore precompile + desk contract will expose,
   so the UI can be built, demoed and tested before Phase 2 ships.
   Replace with live reads by setting MAKO_CONFIG.previewMode = false
   and implementing MAKO.live (see docs > Integration).
   ========================================================= */
(function () {
  const listeners = new Set();
  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  const MOODS = [
    { key: "feeding",  label: "Feeding Frenzy", desc: "Funding is deeply negative and shorts are paying. The desk leans bid and burns faster.", color: "#3ee6a8", min: -Infinity, max: -0.004 },
    { key: "hunting",  label: "Hunting",        desc: "Funding is mildly negative. The desk quotes tight and fills often.",                     color: "#34b7dd", min: -0.004, max: 0 },
    { key: "cruising", label: "Cruising",       desc: "Funding is neutral. Normal two-sided quoting and steady burns.",                          color: "#93d9ee", min: 0, max: 0.006 },
    { key: "circling", label: "Circling",       desc: "Longs are crowded. The desk widens its quotes and waits for a wick.",                    color: "#ffc247", min: 0.006, max: 0.012 },
    { key: "breach",   label: "Breach",         desc: "Liquidation cascade detected. Wick bonus armed: the desk buys back into the flush.",     color: "#ff5252", min: 0.012, max: Infinity },
  ];

  const S = {
    t: Date.now(),
    mid: 38.42,          // HYPE perp mid (USD)
    funding: 0.0011,     // hourly funding, %
    oi: 1.42e9,
    vol24: 3.8e9,
    makoPrice: 0.004182,
    makoChange: 6.4,
    supply: 1_000_000_000,
    burned: 18_442_903,
    holders: 4128,
    treasury: { hype: 61_240, mako: 196_800_000, usd: 0 },
    pnl: { day: 0, total: 41_820, history: [] },
    fills: [],
    burns: [],
    book: { bids: [], asks: [] },
    trades: [],
    mood: MOODS[2],
    latency: 212,
    coreBlock: 512_884_210,
    elyBlock: 18_221_904,
    wickArmed: false,
  };

  // seed pnl history (last 48 points ~ 30 min buckets)
  let acc = S.pnl.total - 4000;
  for (let i = 0; i < 96; i++) { acc += gauss() * 180 + 45; S.pnl.history.push(acc); }
  S.pnl.total = acc;

  // seed burns
  for (let i = 0; i < 8; i++) {
    S.burns.push({ t: Date.now() - (i + 1) * rand(9, 25) * 60_000, amount: Math.round(rand(40_000, 420_000)), reason: Math.random() < 0.25 ? "Wick bonus" : "Desk profit", tx: fakeHash() });
  }

  function fakeHash() { let h = "0x"; for (let i = 0; i < 64; i++) h += "0123456789abcdef"[Math.floor(Math.random() * 16)]; return h; }

  function buildBook() {
    const tick = 0.001;
    const spread = S.mood.key === "circling" ? 0.006 : S.mood.key === "breach" ? 0.012 : 0.002;
    const bestBid = +(S.mid - spread / 2).toFixed(3);
    const bestAsk = +(S.mid + spread / 2).toFixed(3);
    const bids = [], asks = [];
    let cb = 0, ca = 0;
    for (let i = 0; i < 18; i++) {
      const sb = Math.max(20, Math.abs(gauss()) * 900 + i * 120 + (Math.random() < .08 ? 4000 : 0));
      const sa = Math.max(20, Math.abs(gauss()) * 900 + i * 120 + (Math.random() < .08 ? 4000 : 0));
      cb += sb; ca += sa;
      bids.push({ px: +(bestBid - i * tick * (1 + i * 0.15)).toFixed(3), sz: sb, cum: cb, desk: i === 0 || i === 3 });
      asks.push({ px: +(bestAsk + i * tick * (1 + i * 0.15)).toFixed(3), sz: sa, cum: ca, desk: i === 0 || i === 3 });
    }
    S.book = { bids, asks, spread: bestAsk - bestBid, max: Math.max(cb, ca) };
  }

  function step() {
    const now = Date.now();
    S.t = now;
    // price walk with occasional wick
    let shock = gauss() * 0.018;
    if (Math.random() < 0.004) { shock = -rand(0.35, 0.9); S.wickArmed = true; }
    S.mid = Math.max(5, S.mid + shock + (38.4 - S.mid) * 0.002);

    S.funding += gauss() * 0.00025 + (0.0012 - S.funding) * 0.01;
    if (S.wickArmed) S.funding = Math.max(S.funding, 0.013);
    S.mood = MOODS.find(m => S.funding >= m.min && S.funding < m.max) || MOODS[2];

    S.makoPrice = Math.max(0.0001, S.makoPrice * (1 + gauss() * 0.0012 + 0.00008));
    S.latency = Math.round(150 + Math.abs(gauss()) * 90);
    S.coreBlock += 2 + Math.round(Math.random());
    S.elyBlock += 2;

    // trades tape
    const side = Math.random() < 0.5 ? "buy" : "sell";
    S.trades.unshift({ t: now, px: +(S.mid + (side === "buy" ? 0.001 : -0.001)).toFixed(3), sz: +(Math.abs(gauss()) * 140 + 2).toFixed(1), side });
    S.trades.length = Math.min(S.trades.length, 40);

    // desk fills
    if (Math.random() < 0.22) {
      const fs = Math.random() < 0.5 ? "buy" : "sell";
      const edge = rand(0.4, 2.2); // USD captured
      S.fills.unshift({ t: now, market: Math.random() < .8 ? "HYPE-PERP" : "MAKO/HYPE", side: fs, px: +S.mid.toFixed(3), sz: +(rand(8, 120)).toFixed(1), edge });
      S.fills.length = Math.min(S.fills.length, 30);
      S.pnl.total += edge;
      S.pnl.day += edge;
    }
    if (Math.random() < 0.05) {
      S.pnl.history.push(S.pnl.total);
      if (S.pnl.history.length > 120) S.pnl.history.shift();
    }

    // burn events
    if (Math.random() < 0.012 || S.wickArmed) {
      const amt = Math.round(S.wickArmed ? rand(500_000, 1_400_000) : rand(30_000, 260_000));
      S.burned += amt;
      S.burns.unshift({ t: now, amount: amt, reason: S.wickArmed ? "Wick bonus" : "Desk profit", tx: fakeHash() });
      S.burns.length = Math.min(S.burns.length, 25);
      S.wickArmed = false;
    }

    S.treasury.usd = S.treasury.hype * S.mid + S.treasury.mako * S.makoPrice;
    buildBook();
    listeners.forEach(fn => { try { fn(S); } catch (e) { console.error(e); } });
  }

  buildBook();
  S.treasury.usd = S.treasury.hype * S.mid + S.treasury.mako * S.makoPrice;

  let timer = null;
  window.MAKO = Object.assign(window.MAKO || {}, {
    sim: {
      state: S,
      MOODS,
      subscribe(fn) { listeners.add(fn); fn(S); if (!timer) timer = setInterval(step, 350); return () => listeners.delete(fn); },
    },
  });
})();
