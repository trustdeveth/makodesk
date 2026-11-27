/* =========================================================
   Minimal, dependency-free EVM wallet layer (EIP-1193 + EIP-6963).
   Real: connect, chain add/switch, HYPE balance, $MAKO balance, watchAsset.
   ========================================================= */
(function () {
  const C = window.MAKO_CONFIG;
  const listeners = new Set();
  const state = { provider: null, address: null, chainId: null, hype: null, mako: null };
  const hexChain = "0x" + C.chain.chainId.toString(16);

  // EIP-6963 discovery — prefer an announced provider, fall back to window.ethereum
  const announced = [];
  window.addEventListener("eip6963:announceProvider", e => announced.push(e.detail));
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  function getProvider() {
    if (state.provider) return state.provider;
    const p = (announced[0] && announced[0].provider) || window.ethereum || null;
    if (p) bind(p);
    return p;
  }

  function bind(p) {
    state.provider = p;
    if (!p.on) return;
    p.on("accountsChanged", a => { state.address = a[0] || null; refresh(); });
    p.on("chainChanged", id => { state.chainId = parseInt(id, 16); refresh(); });
  }

  function emit() { listeners.forEach(fn => fn({ ...state, onElysium: state.chainId === C.chain.chainId })); }

  async function connect() {
    const p = getProvider();
    if (!p) { window.MAKO.toast("No wallet found — install Rabby or MetaMask"); return null; }
    const accts = await p.request({ method: "eth_requestAccounts" });
    state.address = accts[0] || null;
    state.chainId = parseInt(await p.request({ method: "eth_chainId" }), 16);
    await refresh();
    return state.address;
  }

  async function ensureNetwork() {
    const p = getProvider();
    if (!p) return connect();
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
    } catch (err) {
      if (err && (err.code === 4902 || err.code === -32603)) {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hexChain,
            chainName: C.chain.name,
            nativeCurrency: C.chain.nativeCurrency,
            rpcUrls: [C.chain.rpcUrl],
            blockExplorerUrls: [C.chain.explorer],
          }],
        });
      } else throw err;
    }
    state.chainId = parseInt(await p.request({ method: "eth_chainId" }), 16);
    await refresh();
  }

  async function watchToken() {
    const p = getProvider();
    if (!C.contracts.token) return window.MAKO.toast("$MAKO address is published at launch");
    if (!p) return window.MAKO.toast("Connect a wallet first");
    await p.request({
      method: "wallet_watchAsset",
      params: { type: "ERC20", options: { address: C.contracts.token, symbol: C.brand.ticker, decimals: 18, image: "https://" + C.brand.domain + "/assets/img/logo.svg" } },
    });
  }

  function fromWei(hex) {
    const v = BigInt(hex || "0x0");
    const whole = v / 10n ** 18n;
    const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
    return Number(whole.toString() + "." + frac);
  }

  async function refresh() {
    const p = state.provider;
    if (p && state.address && state.chainId === C.chain.chainId) {
      try {
        state.hype = fromWei(await p.request({ method: "eth_getBalance", params: [state.address, "latest"] }));
      } catch { state.hype = null; }
      if (C.contracts.token) {
        try {
          const data = "0x70a08231" + state.address.slice(2).toLowerCase().padStart(64, "0");
          state.mako = fromWei(await p.request({ method: "eth_call", params: [{ to: C.contracts.token, data }, "latest"] }));
        } catch { state.mako = null; }
      } else state.mako = null;
    } else { state.hype = null; state.mako = null; }
    emit();
  }

  // silent reconnect if already authorized
  setTimeout(async () => {
    const p = getProvider();
    if (!p) return emit();
    try {
      const a = await p.request({ method: "eth_accounts" });
      if (a && a[0]) {
        state.address = a[0];
        state.chainId = parseInt(await p.request({ method: "eth_chainId" }), 16);
      }
    } catch {}
    refresh();
  }, 50);

  window.MAKO = Object.assign(window.MAKO || {}, {
    wallet: { state, connect, ensureNetwork, watchToken, refresh, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
  });
})();
