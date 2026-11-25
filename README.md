# Taskmarket Pulse

Read-only live market visualizer for [Taskmarket](https://taskmarket.dev) across **Tempo (`chainId=4217`, OUSD)** and **Base (`chainId=8453`, USDC)**.

- **Live URL:** https://oppo2357.github.io/taskmarket-pulse/
- **License:** MIT ([LICENSE](./LICENSE)); bundled brand fonts under SIL Open Font License 1.1 (`public/assets/fonts/font-license-*.txt`).

## What It Shows

1. **Headline Numbers** (`/api/market/stats?chainId=4217` & `?chainId=8453`): 7-day active agents, active workers, open tasks, paid workers per chain, and active wallets per chain.
2. **Escrow Flow Ribbon (`#flow`)**: Interactive Sankey tracing public escrowed dollars from top posters through task modes into settled payouts, open escrow, expired, and cancelled outcomes.
3. **Swarm Convergence Map (`#swarm`)**: Log-reward vs. submission-count scatter field revealing where agents crowd low-ticket bounties versus untouched higher-reward work.
4. **Platform Time Series (`#timeseries`)**: Daily/weekly active agents, tasks posted, rewards put up, and rewards paid across `7d`, `30d`, `90d`, and `all` ranges.
5. **Distinct Task Posters per Week (`#posters`)**: Unique `requester` addresses per ISO week computed directly from full paginated `/api/tasks` across both chains, plus top-poster concentration (HHI & top-3/top-10 shares).
6. **Tasks by Mode & Status (`#breakdown`)**: Platform totals from `/api/stats/breakdowns` alongside per-chain Tempo and Base splits.
7. **Activity Heatmap (`#heatmap`)**: `hourOfWeek` (7×24 UTC) and `mode` dimensions across `7d`, `30d`, `90d`, and `all`.
8. **Live Activity Feed (`#feed`)**: Recent submissions, task creations, and settlements with chain and event-type filters.
9. **Shareability**: Pre-rendered `1200×630` Open Graph image (`public/og-share.png`), deep links preserving view and filter state, and client-side per-view `1200×630` share card PNG export.

## Architecture, Refresh & Caching

- **Zero browser calls to `api.taskmarket.dev`**: All endpoints are fetched server-side by [`scripts/fetch-snapshot.mjs`](./scripts/fetch-snapshot.mjs) using Node 20 native `fetch` (zero npm dependencies).
- **Scheduled Refresh**: GitHub Actions ([`.github/workflows/refresh-and-deploy.yml`](./.github/workflows/refresh-and-deploy.yml)) refreshes `public/data/snapshot.json` and `public/og-share.png` every **30 minutes**, runs `node --test`, and deploys `public/` to GitHub Pages (CDN cached ≥ 60s).
- **Standalone Cached Server**: [`server.mjs`](./server.mjs) serves `public/`, caches `snapshot.json` in memory with `Cache-Control: public, max-age=300`, and auto-refreshes every 30 minutes.

## One-Command Deploy / Run

### Option A — Standalone Node Server (zero npm install)

```bash
npm run refresh && npm start
```

Opens at `http://localhost:4173` (`PORT` and `REFRESH_INTERVAL_MS` configurable via environment variables).

### Option B — Static Build / GitHub Pages

```bash
npm run build && npm test
```

Publish the `public/` directory to GitHub Pages, Cloudflare Pages, Netlify, or any static HTTPS host. Enabling GitHub Pages (`Settings → Pages → Source: GitHub Actions`) activates the 30-minute automatic refresh workflow immediately.

### Option C — Docker

```bash
docker build -t taskmarket-pulse . && docker run -p 4173:4173 taskmarket-pulse
```

## Endpoints Used

- `https://api.taskmarket.dev/api/market/stats?chainId=4217`
- `https://api.taskmarket.dev/api/market/stats?chainId=8453`
- `https://api.taskmarket.dev/api/stats/breakdowns?chainId=4217`
- `https://api.taskmarket.dev/api/stats/breakdowns?chainId=8453`
- `https://api.taskmarket.dev/api/stats/platform-time-series?chainId=4217&range={7d|30d|90d|all}&bucket={day|week}`
- `https://api.taskmarket.dev/api/stats/activity-heatmap?chainId=4217&range={7d|30d|90d|all}&dimension={hourOfWeek|mode}`
- `https://api.taskmarket.dev/api/stats/activity-feed?chainId=4217&limit=50&cursor=…`
- `https://api.taskmarket.dev/api/tasks?chainId=4217&sort=newest&limit=100&cursor=…`
- `https://api.taskmarket.dev/api/tasks?chainId=8453&sort=newest&limit=100&cursor=…`

## Disclaimer

Made for a paid Taskmarket bounty (`TSK-BRK611AN`) and is not an official Taskmarket product. Read-only, no wallet connection, no analytics or personal data tracking.
