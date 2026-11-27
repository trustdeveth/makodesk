/* =========================================================
   Mako Desk — single source of truth for brand + chain config.
   Fill the TODOs before launch. Everything in the UI reads from here.
   ========================================================= */
window.MAKO_CONFIG = {
  brand: {
    project: "Mako Desk",
    token: "Mako",
    ticker: "MAKO",
    tagline: "The memecoin that makes markets.",
    domain: "makodesk.xyz",
    x: "makodesk",
    xUrl: "https://x.com/makodesk",
    telegram: "https://t.me/makodesk",
    github: "https://github.com/makodesk",
  },

  chain: {
    // TODO: confirm against Kinetiq's official Elysium docs before launch.
    // Third-party docs list mainnet chain ID 99901 (testnet 99801). Not yet verified.
    chainId: 99901,
    name: "Elysium",
    rpcUrl: "https://rpc.elysium.example",          // TODO: official RPC
    explorer: "https://explorer.elysium.example",   // TODO: official explorer
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  },

  contracts: {
    token: "",      // TODO: $MAKO ERC-20 address (leave "" until deployed)
    desk: "",       // TODO: MakoDesk treasury contract
    burnLog: "",    // TODO: optional event indexer / subgraph
    lp: "",         // TODO: locked LP position
  },

  links: {
    swap: "",       // TODO: deep link to the DEX pair once live
    bridge: "",     // TODO: official HYPE bridge (HyperEVM -> Elysium)
    chart: "",      // TODO: DexScreener / GeckoTerminal pair
  },

  tokenomics: {
    supply: 1_000_000_000,
    split: [
      { label: "Fair-launch liquidity", pct: 70, note: "Paired with HYPE, LP locked" },
      { label: "Desk treasury",          pct: 20, note: "Inventory for the HyperCore desk, vested to the contract" },
      { label: "Community & ecosystem",  pct: 10, note: "Builders, listings, campaigns — 12-month linear unlock" },
    ],
    team: 0,
    tax: 0,
  },

  // When true, the app shows simulated preview data with a clear badge.
  // Flip to false once the HyperCore precompile + desk contract are live.
  previewMode: true,
};
