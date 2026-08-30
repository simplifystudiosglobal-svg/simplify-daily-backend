# Simplify Daily — Backend

Express API for Simplify Daily: admin auth, the auto-news sync endpoint, and the `/rss.xml` feed. Pairs with the `simplify-daily-frontend` repo, which is a separate static site that calls this API.

## Endpoints

- `POST /api/admin/login` — passcode → signed session token
- `GET /api/admin/verify` — validate a session token
- `GET /api/auto-news?category=...` — admin-only, returns a batch of stories for the "Sync" feature, and persists them (see below)
- `GET /api/articles` — public, returns admin-synced articles persisted server-side. Every frontend page fetches this on load and merges it with its own build-time seed content, so synced articles are visible to all visitors instead of only the browser that ran the sync.
- `DELETE /api/admin/articles/:id` — admin-only, removes a persisted article
- `GET /rss.xml` — public RSS feed
- `GET /health` — health check

### Persisted article storage

Articles returned by `/api/auto-news` are written to `data-store/published-articles.json` on disk (created on first write) and served back via `GET /api/articles`. This makes synced articles visible to every visitor, not just the admin's own browser.

Caveat: Render's free tier has no persistent disk. This file survives normal sleep/wake cycles but is wiped whenever this backend service itself is redeployed. That's an acceptable tradeoff for now — upgrade to a real database (Postgres, etc.) if losing synced articles on a backend redeploy becomes a real problem.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `ADMIN_PASSCODE` and `SERVER_SECRET`
3. `npm run dev` — runs on `http://localhost:3001` by default

## Deploy (Render free tier)

1. Create a new Web Service on Render, connected to this repo.
2. Build command: `npm install && npm run build`
3. Start command: `npm run start`
4. Set environment variables: `ADMIN_PASSCODE`, `SERVER_SECRET` (generate with `openssl rand -hex 32`), `FRONTEND_ORIGIN` (your deployed frontend's URL, for CORS)
5. Render assigns `PORT` automatically — no need to set it.

Render's free tier sleeps the service after ~15 minutes of inactivity; the next request wakes it up with a 30-50 second delay. That's expected, not a bug.

## Keeping content in sync

`data/articles.ts` is a standalone copy of the frontend's `src/data/articles.ts` (used here for the RSS feed and the auto-news pool). If you edit article content in the frontend repo, copy the same file here to keep the RSS feed accurate.
