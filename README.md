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
    app/                     Desk app: /app, /app/desk, /app/swap, /app/mood, /app/burns
    docs/page.tsx            Documentation
    api/                     Backend (route handlers)
      desk/state             GET  full desk snapshot
      desk/stream            GET  Server-Sent Events live stream
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
    landing/ app/ docs/      Page UI
    providers/               Config, live SSE data, toasts
  lib/
    config.ts                Runtime config from .env
    server/engine.ts         Preview market engine (one per process)
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
