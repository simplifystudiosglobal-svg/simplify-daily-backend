# Simplify Daily — Backend

Express API for [Simplify Daily](https://github.com/simplifystudiosglobal-svg/simplify-daily-news-portal): admin auth, the auto-news sync endpoint, and the `/rss.xml` feed. Pairs with the `simplify-daily-frontend` repo, which is a separate static site that calls this API.

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

## Deploy (e.g. Render free tier)

- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Set environment variables: `ADMIN_PASSCODE`, `SERVER_SECRET`, `FRONTEND_ORIGIN` (your deployed frontend's URL, for CORS)
- Render assigns `PORT` automatically — no need to set it

## Keeping content in sync

`data/articles.ts` is a standalone copy of the frontend's `src/data/articles.ts` (used here for the RSS feed and the auto-news pool). If you edit article content in the frontend repo, copy the same file here to keep the RSS feed accurate.
