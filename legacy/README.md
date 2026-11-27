# Mako Desk ($MAKO)

> The memecoin that makes markets. Native to Elysium, powered by HyperCore.

## Identity

| Field | Value |
|---|---|
| Project | **Mako Desk** |
| Token name | **Mako** |
| Ticker | **$MAKO** |
| Domain | **makodesk.xyz** (backups: makodesk.trade, makodesk.fun) |
| X | **@makodesk** |
| Telegram | t.me/makodesk |
| Tagline | The memecoin that makes markets. |

## What's in this repo

```
index.html          Landing page
app.html            Desk app: overview, desk, swap, mood, burn log
docs.html           Documentation site
assets/css/         base.css (design system) + landing/app/docs styles
assets/js/config.js Brand, chain, contract addresses: the one file to edit
assets/js/wallet.js Wallet layer: EIP-1193/6963 connect, add/switch chain, balances, add token
assets/js/sim.js    Preview market engine (simulated until the precompile ships)
assets/img/logo.svg Logo / favicon
```

It's a static site with no build step and no dependencies. To preview it:

```bash
npx serve .        # or: python -m http.server 8080
```

You can deploy it to Vercel, Netlify, Cloudflare Pages or GitHub Pages.

## Launch checklist

1. [ ] Register `makodesk.xyz`, claim `@makodesk` on X and `t.me/makodesk`.
2. [ ] Get the official Elysium chain ID, RPC and explorer from Kinetiq's docs and put them in `config.js` → `chain`.
3. [ ] Deploy the $MAKO ERC-20 (fixed 1B, no owner functions), verify the source, renounce ownership.
4. [ ] Verify the token on the Elysium explorer (100 KNTQ).
5. [ ] Seed MAKO/HYPE liquidity (70%), lock the LP, and add the lock tx to the docs.
6. [ ] Fill `contracts.token`, `contracts.lp`, `links.swap`, `links.bridge`, `links.chart`.
7. [ ] Phase 2: build and audit `MakoDesk.sol` against the final precompile/CoreWriter ABI, then set `contracts.desk` and `previewMode: false`.

## Notes

- Preview mode labels all simulated data. Wallet connection, network switching and balances are real.
- `previewMode: false` hides the banners. The live data reader (`MAKO.live`) still needs to be written against the deployed desk contract.
