# Stock (mobile-first) — Plan

A mobile-first rebuild of `stock.rssbskp.in`, the inventory app for centers → departments → items,
with borrows between departments. It's built as an installable PWA on the same stack. The new piece is
**Rahdari**: a numbered, shareable document that goes with every stock movement.

> **About "Rahdari":** राहदारी is a transit pass that travels with goods. Here it means a numbered
> document for every movement: receipt, transfer, return, or adjustment. The UI calls it *Rahdari*;
> code uses the generic `challan` (tables, routes stay stable if the label ever changes).

---

## 1. Who uses it, on a phone

| Role | Typical moment | What they need in under 30 seconds |
|---|---|---|
| Sevadar / viewer | Standing in a storeroom | "Do we have 40 chairs? Where?" |
| Dept manager | Goods arrive at the gate | Record intake and hand over a receipt Rahdari |
| Dept manager | Another dept asks for items | Approve, then share the transfer Rahdari on WhatsApp |
| Dept manager | Items come back | Tap the Rahdari, enter returned qty, done |
| Admin | Occasionally | Manage centers, departments, users, item catalog (desktop is fine) |

Design rule: **every daily job is one-handed and ≤ 3 taps from Home.** Admin CRUD screens stay
responsive, but they don't need to be thumb-optimized.

## 2. Stack (reuse what exists)

Same as `stock.rssbskp.in`, so the server layer can be copied over mostly as-is:

- Next.js 16 (App Router), React 19, TypeScript
- tRPC 11 + TanStack Query 5, superjson
- Drizzle ORM + Postgres 15, better-auth
- Tailwind 4 + shadcn/ui (Base UI), sonner, lucide
- **New:** `app/manifest.ts` and `public/sw.js` (Next 16 PWA guide), `@react-pdf/renderer` (Rahdari PDF),
  `qrcode` (QR on the PDF), the `BarcodeDetector` API with a `@zxing/browser` fallback (scanning),
  `idb-keyval` (offline queue)

**Bootstrap approach:** create a new Next app in `stock/`, then copy `db/`, `server/`, `lib/` (auth,
permissions, trpc) and the API routes from `stock.rssbskp.in`. That repo is only at a "wip" commit
(about 3.6k lines), so carrying its history isn't worth it. Rewrite all UI under `app/` and
`components/` mobile-first. Switch from `drizzle-kit push` to `generate` + `migrate`, because
Rahdari numbering needs migrations that can be reviewed. The old app has no real data yet, so this
starts on a fresh database (nothing to migrate).

## 3. Data model changes

Keep all existing tables (`centers`, `departments`, `items`, `department_inventory`, `borrows`,
`borrow_items`, `inventory_transactions`, auth) and add the following:

### 3.1 Department membership (scoping)
Today `user.role` is global. On a phone, people should only see and act on their own departments.

```
user_departments (user_id → user, department_id → departments, role: manager|viewer, PK(user_id, department_id))
```
- `admin` stays global. A department `manager` can only approve borrows **from** their own department.
- The Home screen defaults to the user's department(s).

### 3.2 Rahdari (challan) documents
```
challan_kind enum: receipt (intake) | transfer (borrow approved) | return | adjustment | issue*

challans
  id, number (unique, e.g. SKP/2026-27/TR-00042), kind, center_id,
  from_department_id?, to_department_id?, borrow_id?,
  party_name? (vendor / donor for receipts), party_ref? (their bill no.),
  status: issued | acknowledged | void,
  total_amount? (receipts), issued_by → user, issued_at,
  acknowledged_by → user?, acknowledged_by_name?, acknowledged_by_phone?, acknowledged_at?,
  note, public_token (unguessable, for the QR verify link), created_at

challan_lines
  id, challan_id, item_id, qty, unit (snapshot), rate?, amount?
  -- receipts are invoices: rate required, amount = qty × rate, challan total_amount = Σ amount
  -- other kinds carry quantities only

challan_series
  center_id, fiscal_year ('2026-27'), kind, next_no   PK(center_id, fiscal_year, kind)
```
- `inventory_transactions.challan_id` (FK, nullable): every stock movement points at its Rahdari.
- **Gapless numbering:** take the next number inside the same DB transaction as the stock movement
  (`SELECT … FOR UPDATE` on `challan_series`). The Indian fiscal year runs April to March. Voided
  Rahdaris keep their number.
- `*issue` (consumption, where stock leaves for good) needs a new `txn_kind` value. It's in Phase 2.

### 3.3 Mobile helpers
- `items.barcode` (nullable, unique). Item photos weren't built; only vendor-bill photos were (`attachments`).
- `challans.client_mutation_id` (unique, nullable), so offline replays are idempotent. It lives on the
  Rahdari rather than on transactions because each offline-capable entry creates exactly one Rahdari.
- All timestamps are `timestamptz`.

## 4. How Rahdari plugs into existing flows

| Existing action (tRPC) | Stock effect today | New: Rahdari issued |
|---|---|---|
| `inventory.bulkIntake` | `intake` +qty | **Receipt** (invoice): vendor/donor name, their bill no., rate per line, total |
| `borrows.approve` | `borrow_out` / `borrow_in` | **Transfer** (the rahdari that travels with the goods) |
| `borrows.recordReturn` | `return_out` / `return_in` | **Return**, one per return event, so partial returns each get their own |
| `inventory.adjust` | `adjustment` ±qty | **Adjustment** (internal, with a mandatory reason) |

Lifecycle: **issued**, then **acknowledged** when the receiver taps "Received". That can be a logged-in
user in the app, or **anyone at the gate** who scans the QR and enters their name (and optionally a phone) with no
login, with **void** reserved for admins, who must give a reason and create a reversing movement.

Outputs:
- `GET /api/challan/[id]/pdf`: A5 portrait PDF with center header, number, date, from → to, lines,
  signatures block, and a QR code pointing to `/r/[public_token]`
- `/r/[public_token]`: a public page (no login) showing the number, status and lines, plus a one-time
  "Received" form (name, optional phone). The token is unguessable, the form only works once, and it's rate-limited.
- A share button using the Web Share API, so the PDF goes straight to WhatsApp. Falls back to download.
- Print-friendly CSS for the gate register

## 5. Mobile UX

**Shell:** a bottom tab bar with Home · Stock · ➕ · Rahdari · More. The center ➕ opens a quick-action sheet:
*Receive stock · Request items · Record return · Adjust · Scan*.

```
┌──────────────────────────────┐
│ SKP · Langar Dept      ▾  🔔 │  ← department switcher, pending approvals
├──────────────────────────────┤
│ 🔍 Search or scan item…   [▣]│  ← search-first; camera opens the scanner
├──────────────────────────────┤
│ Needs action (3)             │
│  ▸ Tent dept wants 40 chairs │  ← swipe → Approve / Reject
│  ▸ 12 plates not returned    │
├──────────────────────────────┤
│ Low stock (5)                │  ← inventory.lowStock
│  Steel glass   120 / 300  ▓▓░│
├──────────────────────────────┤
│ Recent Rahdari                │
│  TR-00042 → Tent   Ack ✓     │
│  RC-00017 ← Vendor Issued    │
├──────────────────────────────┤
│  🏠    📦    ➕    🧾    ☰   │
└──────────────────────────────┘
```

Patterns:
- **Bottom sheets** (drawer-style) instead of centered dialogs for every form. Existing modals become sheets.
- **Item picker:** full-screen search with recent and frequent items first, plus a scan button. Quantity uses a
  large stepper and a numeric keypad (`inputMode="decimal"`).
- **Multi-line entry:** a cart-style list (item, qty, swipe to remove) with a sticky "Issue Rahdari" button
  at the bottom.
- 44px minimum tap targets, safe-area insets, `viewport-fit=cover`, and a dark mode that follows the system.
- **Hindi + English UI** (phase 2): many sevadars will prefer Hindi. Keep strings in a dictionary from day 1.
- Optimistic updates for approvals and acknowledgements, with sonner toasts and an undo window where it's safe.

## 6. Offline & PWA

Storerooms often have poor signal, so:
- **Manifest + icons + standalone display**, so the app installs to the home screen on Android and iOS.
- **Service worker:** cache the app shell and static assets. Catalog and inventory reads go through TanStack
  Query persisted to IndexedDB, so the app works read-only offline.
- **Offline writes (phase 3):** intake, adjust and return are queued in IndexedDB with a `client_mutation_id`
  and replayed on reconnect. The server dedupes on that id. Rahdari numbers are assigned **on sync**,
  so offline drafts show "Pending #" and gapless numbering stays intact. Borrow approval stays online-only.
- **Web push (phase 3):** "New borrow request" and "Items returned" notifications. On iOS, push only works
  once the app is installed to the home screen.

## 7. Phases

**Phase 0 — Bootstrap ✅ (2026-10-21)**
- [x] New app in `stock/`; copied the server layer from `stock.rssbskp.in`
- [x] Drizzle migrations (`db/migrations/0000_init.sql`) on a fresh Postgres 15 database
- [x] Mobile shell, manifest, generated icons

**Phase 1 — Daily jobs on mobile ✅ (2026-10-21)**
- [x] `user_departments` memberships; every mutation checks the department role (`server/trpc/access.ts`)
- [x] Home: requests to approve (inline approve/reject), to return, waiting, low stock, recent Rahdari
- [x] Stock tab and item page (where it's held, request from other depts, movement history)
- [x] Entry sheets: receive (invoice), request, return, issue, adjust, scan
- [x] `challans` / `challan_lines` / `challan_series` with gapless numbering in the same transaction
- [x] Rahdari list/detail, A5 PDF (Noto fonts incl. Devanagari), Web Share / WhatsApp / download
- [x] Public page `/r/[token]` with QR, one-time no-login acknowledgement (rate-limited)
- [x] Admin screens: centers, departments, items, users with department access

**Phase 2 — Field polish ✅ (2026-10-21)**
- [x] Barcode/QR scanning (BarcodeDetector, ZXing fallback) and printable item QR labels
- [x] `issue` (consumption) movement + Rahdari kind
- [x] Hindi translation (all UI, PDFs and push notifications)
- [x] Vendor-bill photo on receipts, compressed on the phone and stored in Postgres (no object storage needed)
- [x] Reports: stock by department, outstanding/overdue borrows, Rahdari register CSV

**Phase 3 — Offline & notifications ✅ (2026-10-21)**
- [x] Service worker (app shell, visited pages, offline page) and IndexedDB-persisted query cache
- [x] Offline queue for receive, issue, adjust and return, per user, replayed idempotently on reconnect
- [x] Web push for new requests, approvals/rejections, returns and acknowledgements, in each device's language

## 8. Verification

- tRPC integration tests against a throwaway Postgres for: numbering under concurrent issues (no gaps or
  duplicates), approve and partial-return producing the right Rahdari and transactions, and dept scoping
  (a manager can't approve for another dept)
- Mobile-viewport (390×844) browser runs of the main flows: receive, approve, partial return, QR
  acknowledgement, offline capture + sync, user switch on a shared phone, Hindi, dark mode. These were
  driven by a throwaway script, not committed as Playwright tests.
- Still to do: a manual install and push test on a real Android phone and iPhone.

## 9. Decisions (2026-10-21)

- Receipts are **invoices**, with a rate per line, amount, and total.
- Numbering is `CENTER/FY/KIND-#####`, with an April–March fiscal year.
- There's no real data in `stock.rssbskp.in`, so this starts on a fresh database.
- The database is **Postgres 15**.
- Acknowledgement doesn't need a login. A QR scan plus a name is enough.
- No GST fields on receipt invoices (rate × qty with a total). Revisit if needed.
- Bill photos are stored in Postgres, so any host works without object storage.
- The app runs on port 3100 locally (3000 is used by another project).

## 10. Open questions

1. **Hosting:** where will the app run? Set `APP_URL` there so QR codes point at the public address,
   and generate production VAPID keys.
2. **Tax:** do receipt invoices need GST fields (vendor GSTIN, HSN, tax %)? Not built for now.
