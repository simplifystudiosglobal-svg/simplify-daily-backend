# Simplify Daily — Backend

Express API for Simplify Daily: admin auth, the auto-news sync endpoint, and the `/rss.xml` feed. Pairs with the `simplify-daily-frontend` repo, which is a separate static site that calls this API.

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

## Deploy (Render free tier)

1. Create a new Web Service on Render, connected to this repo.
2. Build command: `npm install && npm run build`
3. Start command: `npm run start`
4. Set environment variables: `ADMIN_PASSCODE`, `SERVER_SECRET` (generate with `openssl rand -hex 32`), `FRONTEND_ORIGIN` (your deployed frontend's URL, for CORS)
5. Render assigns `PORT` automatically — no need to set it.

Render's free tier sleeps the service after ~15 minutes of inactivity; the next request wakes it up with a 30-50 second delay. That's expected, not a bug.

## Keeping content in sync

`data/articles.ts` is a standalone copy of the frontend's `src/data/articles.ts` (used here for the RSS feed and the auto-news pool). If you edit article content in the frontend repo, copy the same file here to keep the RSS feed accurate.
