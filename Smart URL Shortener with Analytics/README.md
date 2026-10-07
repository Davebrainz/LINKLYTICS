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

Set `MONGODB_URI` and `JWT_SECRET` in `.env` for persistent storage and signed sessions. During local development, the server falls back to in-memory demo data if MongoDB is unavailable. The local demo account is `demo@linklytics.com` with password `123456`.

## Deploy the API to Render

1. Create a MongoDB Atlas database and allow connections from Render in its network access settings.
2. Create a Render **Web Service** for this repository. Set the root directory to the project folder if it is not the repository root, the build command to `npm install`, and the start command to `npm start`.
3. Add these Render environment variables:
   - `MONGODB_URI`: the Atlas connection string for your database.
   - `JWT_SECRET`: a long, random secret. Do not use the local fallback value.
   - `NODE_ENV`: `production`.
4. Set Render's health check path to `/api/health`. Wait for the service to deploy and copy its public URL, such as `https://your-api.onrender.com`.
5. In the Vercel frontend project's environment variables, set `VITE_API_URL` to the Render URL only (no trailing slash and no `/api`), then redeploy the frontend.

Local Vite development continues to use its `/api` proxy to `http://localhost:5000` when `VITE_API_URL` is unset. Production requires MongoDB so accounts and links persist across requests and devices; register users on the deployed app because local in-memory accounts are not shared with Render. The known demo account is seeded only for local development, not production.
