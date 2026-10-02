# Linklytics

Smart URL shortener and analytics dashboard. The project keeps the original Vite + Express setup and also includes a Next.js App Router implementation. Both use the same React dashboard and MongoDB models/data behavior.

## Install

```bash
npm install
```

## Run with Vite + Express

In one terminal, start the legacy API:

```bash
npm run server
```

In another terminal, start Vite:

```bash
npm run dev
```

Vite proxies `/api` requests to Express on port 5000.

## Run with Next.js

```bash
npm run dev:next
```

Then open `http://localhost:3000`. The Next App Router routes under `app/api` call the shared server logic in `server/index.js`; short links are handled by `app/[slug]/route.js`.

For production, use `npm run build:next` and then `npm run start:next`.

## Data configuration

Set `MONGODB_URI` and `JWT_SECRET` in `.env` for persistent storage and signed sessions. When MongoDB is unavailable, the server falls back to in-memory demo data. The demo account is `demo@linklytics.com` with password `123456`.
