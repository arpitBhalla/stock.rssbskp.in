# Stock

Mobile-first inventory app for RSSB centers, installable as a PWA. Each department tracks its stock,
borrows from other departments, and every movement issues a numbered **Rahdari** (राहदारी), a
document you can share as a PDF and that the receiver confirms by scanning its QR code. See
[PLAN.md](PLAN.md) for the design and decisions.

## Run it locally

Needs Node 22+, pnpm, and Postgres 15.

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32)
createdb stock
pnpm db:migrate
pnpm db:seed                 # sample center, departments, items and Rahdari
pnpm dev                     # http://localhost:3100
```

Seeded logins (username / password):

| User | Access |
|---|---|
| `admin` / `admin12345` | Admin: everything |
| `langar` / `langar12345` | Manager of Langar |
| `tent` / `tent12345` | Manager of Tent |
| `sevadar` / `sevadar12345` | View-only member of Langar |

To try it on a phone on the same Wi-Fi, set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to
`http://<your-mac-ip>:3100`. Camera scanning, install and push need HTTPS on a real device.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js on port 3100. The service worker only registers in production builds. |
| `pnpm test` | Integration tests against a throwaway `stock_test` database (recreated each run) |
| `pnpm typecheck` / `pnpm lint` | |
| `pnpm db:generate` | Create a migration after changing `db/schema/*` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Load sample data into an empty database |

## Environment

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Auth secret and the app's public URL |
| `NEXT_PUBLIC_APP_URL` | Same URL; used for server-side fetches |
| `APP_URL` | Optional. Public origin printed in Rahdari QR codes (defaults to the request origin) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push. Generate with `npx web-push generate-vapid-keys`; leave empty to disable |

## Where things live

- `db/schema/`: tables. `challans.ts` holds the Rahdari tables, `access.ts` holds department membership and push.
- `server/trpc/routers/`: API. Permission checks live in `server/trpc/access.ts`.
- `server/stock/`: numbering (`challan.ts`), atomic stock moves (`movements.ts`), offline idempotency.
- `lib/pdf/challan-pdf.tsx`: the Rahdari PDF (fonts in `assets/fonts`).
- `lib/i18n/`: English and Hindi strings. TypeScript requires every key in both.
- `components/entry/`: the bottom-sheet entry forms. `components/providers/`: offline queue, department, i18n.
- `public/sw.js`: service worker (offline pages, push).
