# Simplify Daily — Backend

Express API for Simplify Daily: admin auth, the auto-news sync endpoint, and the `/rss.xml` feed. Pairs with the `simplify-daily-frontend` repo, which is a separate static site that calls this API.

Runs as a Vercel serverless function in production (`api/index.ts` exports the Express `app`; `vercel.json` routes every path to it) and as a normal long-running server locally (`npm run dev`).

## Endpoints

- `POST /api/admin/login` — passcode → signed session token
- `GET /api/admin/verify` — validate a session token
- `GET /api/auto-news?category=...` — admin-only, returns a batch of stories for the "Sync" feature
- `GET /rss.xml` — public RSS feed
- `GET /health` — health check

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `ADMIN_PASSCODE` and `SERVER_SECRET`
3. `npm run dev` — runs on `http://localhost:3001` by default

## Deploy (Vercel)

1. Import this repo as its own Vercel project (separate from the frontend's project).
2. No build command needed — Vercel builds `api/index.ts` as a serverless function automatically.
3. Set environment variables in the project's Settings → Environment Variables:
   - `ADMIN_PASSCODE` — required, no fallback
   - `SERVER_SECRET` — **required in practice on Vercel**, even though the code has a random fallback. Serverless invocations can run in separate, isolated processes; without a fixed `SERVER_SECRET`, a login token signed by one invocation may fail to verify on the next, making admin login flaky. Generate one with `openssl rand -hex 32`.
   - `FRONTEND_ORIGIN` — your deployed frontend's URL (e.g. `https://simplify-daily-frontend.vercel.app`), for CORS and for building `/rss.xml` links
4. Deploy. You'll get a URL like `https://simplify-daily-backend.vercel.app` — use that as the frontend's `VITE_API_BASE_URL`.

`PORT` doesn't apply on Vercel (serverless functions don't bind a port) — it's only used by the local `npm run dev` server.

## Keeping content in sync

`data/articles.ts` is a standalone copy of the frontend's `src/data/articles.ts` (used here for the RSS feed and the auto-news pool). If you edit article content in the frontend repo, copy the same file here to keep the RSS feed accurate.
