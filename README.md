# Mako Desk ($MAKO)

> The memecoin that makes markets. Native to Elysium, powered by HyperCore.

| | |
|---|---|
| Project | **Mako Desk** |
| Token / Ticker | **Mako / $MAKO** |
| Domain | **makodesk.xyz** |
| X | **@makodeskapp** |

A Next.js 16 app (App Router, TypeScript) with both the frontend and backend in one server.

## Structure

```
src/
  app/
    page.tsx                 Landing page
    app/                     Desk app: /app, /app/terminal, /app/chat, /app/desk, /app/swap, /app/mood, /app/burns
    docs/page.tsx            Documentation
    api/                     Backend (route handlers)
      desk/state             GET  full desk snapshot
      desk/stream            GET  Server-Sent Events live stream (desk + both terminal markets)
      candles                GET  OHLCV candles ?market=HYPE-PERP|MAKO-USD&tf=1m|5m|15m|1h|4h|1D
      auth/nonce|verify      GET/POST  wallet sign-in (personal_sign, nonce, signed httpOnly cookie)
      auth/session|logout    GET/POST  current identity / sign out
      auth/guest             POST guest chat name
      chat/stream            GET  Server-Sent Events: init, msg, del, room, presence
      chat/send              POST post a message (rate limited, slow mode, anti-scam filters)
      chat/history           GET  older messages
      chat/moderate          POST delete own; admins: delete any, mute+purge, pin, slow mode
      desk/fills             GET  latest fills
      burns                  GET  burn log + totals
      quote                  GET  swap quote
      token/[metric]         GET  total | circulating | burned (plain numbers, for CoinGecko/CMC)
      config                 GET  public runtime config
      health                 GET  liveness
  components/
    experience/              Cinematic landing: three.js ocean scene (scene.ts), particle
                             shapes (shapes.ts), generated ocean audio (audio.ts), intro gate,
                             scroll chapters and HUD (Experience.tsx)
    terminal/                Trading terminal: canvas candle chart, book, tape, order entry,
                             account tabs, paper-trading engine (paper.ts)
    chat/                    Chat provider (shared SSE) and chat UI (full page + terminal dock)
    landing/ app/ docs/      Page UI
    providers/               Config, live SSE data, toasts
  lib/
    config.ts                Runtime config from .env
    server/engine.ts         Preview market engine (one per process): desk + HYPE-PERP / MAKO-USD
                             markets with 7d of 1m and 180d of 1h candles
    server/chat.ts           Chat hub: rooms, history (persisted to DATA_DIR/chat.json), moderation
    server/session.ts        Wallet signature verification + HMAC-signed session cookies
    server/ratelimit.ts      Token-bucket rate limits, per-IP stream caps
    markets.ts               Market specs (ticks, fees, leverage), timeframes, chat rooms
    server/source.ts         Single switch point for preview / live data
    server/chain.ts          Minimal Elysium JSON-RPC reader
  styles/                    Design system (Elysium palette)
deploy/                      nginx, PM2, build script
legacy/                      Previous static HTML version (reference only)
```

## Local development

```bash
cp .env.example .env
npm install
npm run dev            # http://localhost:3000 (also on your LAN IP)
```

## Configuration

Everything is in `.env` and read **at runtime**. Edit it and restart the process; no rebuild is needed. See `.env.example`.

- `MAKO_PREVIEW_MODE=true`: the server runs the preview engine, and the UI labels the data as simulated.
- Fill in `ELYSIUM_*` from Kinetiq's official docs (the chain ID `99901` is unconfirmed).
- Set `MAKO_TOKEN_ADDRESS` after deployment. The `/api/token/*` endpoints then read supply from the chain.

## Terminal and chat

**Terminal** (`/app/terminal`) has live candles (1m to 1D, MA20/50, zoom and pan, crosshair), a grouped order book (click a level to set a limit price), a trade tape, and order entry: market and limit orders, 1-20x leverage on HYPE-PERP, reduce-only, % sizing, plus slippage, fee and liquidation estimates. Below are positions, open orders, order history and fills, with one-click close. Entry, liquidation and resting-order prices are drawn on the chart.

In preview mode, orders are **paper trades**: the browser's `paper.ts` matches them against the live server book (market orders walk the book, limits fill when the touch trades through). Each wallet (or "local") gets a $10,000 account stored in localStorage. Nothing is sent on-chain. On-chain $MAKO trades go through `/app/swap`.

**Chat** (`/app/chat`, also docked in the terminal) has #general, #trading, #alpha and #support channels with real-time delivery over SSE, replies, mentions, $TICKER highlights, unread counts and history paging.
- **Identity:** sign in with a wallet (free, gasless `personal_sign`, checked server-side). This gives a verified badge and lets you post links. Guests can pick a name if `CHAT_ALLOW_GUESTS=true`; they get stricter limits and can't post links.
- **Safety:** rate limits per identity and per IP, duplicate suppression, and slow mode. Messages that look like a private key are blocked. Names like admin, mako or team are reserved. Admin messages carry a TEAM badge.
- **Moderation:** addresses in `CHAT_ADMINS` can delete messages, mute (with purge), pin, and set slow mode.

## Phase 2 (Sense) and Phase 3 (Strike)

**Phase 2: live now (off-chain).** The server keeps one WebSocket to Hyperliquid's public API (`src/lib/server/hyperliquid.ts`) for the HYPE-PERP book, trades and funding/mark context, and REST for candles. Mood is computed from real funding. The wick detector looks for a ≥1.5% drop within 3 s backed by ≥$1M of trade flow, and the dashboard reports which sources are live. If the feed is down for more than 6 s, the market falls back to the engine. Set `MARKET_DATA=preview` to work offline.

**Phase 2/3 on-chain: contracts ready, waiting for Elysium's ArbOS upgrade.** `contracts/` (Foundry) holds `MakoDesk` (mood, wick detector, post-only quoting under caps, fill accounting, daily-loss pause, drawdown kill-switch, epoch settlement, buyback & burn, 48h timelock), its tests (unit, fuzz and invariant), deploy scripts and the audit package. The desk talks to Elysium through two adapters. Those stay unimplemented (they revert) until Kinetiq publishes the market-data precompile and ElysiumCoreWriter ABIs. See [contracts/README.md](contracts/README.md) and [contracts/AUDIT.md](contracts/AUDIT.md).

**Going live after deploy.** Set `MAKO_DESK_ADDRESS` and `DESK_DEPLOY_BLOCK`. `src/lib/server/deskChain.ts` then reads `state()`, `params()` and the Filled/Burned/MoodChanged/KillSwitch logs over JSON-RPC, and the dashboard switches to `mode: "live"`. With `MAKO_TOKEN_ADDRESS` and `MAKO_LP_ADDRESS` set (V2-style pair), the MAKO price comes from the pool reserves.

**Keeper.** `keeper/` is a separate process (`cd keeper && npm install && npm start`). It pokes every second, settles each epoch and runs buybacks within the on-chain budget. Moving settled profit off HyperCore and bridging it to Elysium is done by the treasury multisig, which then funds burns with `depositForBurn()`.

`GET /api/health` reports `sources` and `feeds` (Hyperliquid connection, desk reader status).

## Production checklist

- `SESSION_SECRET`: set 32+ random chars (`openssl rand -hex 32`).
- `CHAT_ADMINS`: the team's moderator wallets.
- `SITE_URL`: the https URL. It enables `Secure` cookies and HSTS is sent.
- Chat history persistence: Docker uses the `makodesk-data` volume and PM2 uses `<project>/data`. Back it up if you care about history.
- Run **one** instance. The engine, chat hub and rate limits live in process memory.
- nginx must not buffer `/api/desk/stream` or `/api/chat/stream` (already handled in `deploy/nginx.conf`).
- `GET /api/health` returns 503 if the engine stalls. It also reports open streams and chat stats.

## Deploy on a VPS

The server keeps the preview engine in memory, so run **one** instance.

### Option A: Docker (recommended)

```bash
git clone <repo> makodesk && cd makodesk
cp .env.example .env && nano .env
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

### Option B: Node + PM2

```bash
# Node 20.9+ (22 LTS recommended)
cp .env.example .env && nano .env
sh deploy/build-standalone.sh
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

To run the standalone build by hand:

```bash
cd .next/standalone && PORT=3000 node --env-file=../../.env server.js
```

### nginx + TLS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/makodesk
sudo ln -s /etc/nginx/sites-available/makodesk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d makodesk.xyz -d www.makodesk.xyz
```

The nginx config turns off buffering for `/api/desk/stream`. Without that, the live stream stalls.

### Updating

```bash
git pull
docker compose up -d --build                                  # Docker
sh deploy/build-standalone.sh && pm2 restart makodesk        # PM2
```

## Going live (after Elysium Phase 2)

1. Deploy `MakoDesk`, then set `MAKO_DESK_ADDRESS`.
2. Implement the live reader in `src/lib/server/source.ts` (read `MakoDesk.state()` plus the `Filled`, `Burned` and `MoodChanged` events) and return `mode: "live"`.
3. Set `MAKO_PREVIEW_MODE=false` and restart.
