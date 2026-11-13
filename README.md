# Warranty Tracker BD

An offline, bilingual (English / বাংলা) warranty tracker for Bangladesh. Add every
product you buy, and the app works out when each warranty runs out — with a clear
warning while there is still time to act. All data stays in your browser's
localStorage; nothing is ever sent anywhere.

## Problem

Warranties in Bangladesh usually live on paper receipts that get lost, and the
expiry date is rarely written down. By the time a product breaks, the warranty
has often quietly expired. This app gives every product a home with its purchase
date, warranty length and expiry date, and flags items that expire within 30 days.

## Features

- **Add / edit warranties** — product name, brand, category (Electronics,
  Appliance, Mobile, Vehicle, Home, Other), purchase date, warranty in months
  (1–120), price in BDT, seller/shop, notes. Inline validation errors per field.
- **Calendar-month expiry math** — expiry is the last covered day: a product
  bought 2026-01-15 with a 24-month warranty is covered through 2028-01-14.
  Day-of-month clamping handles short months (31 Jan + 1 month → 28 Feb in a
  non-leap year, 29 Feb in a leap year).
- **Status badges** — Active, Expiring soon (0–30 days left), Expired, with
  days left or "expired X days ago" on every card.
- **Dashboard** — total warranties, active, expiring soon, expired, and the
  total BDT value of items still under warranty.
- **Search, filter, sort** — search by product / brand / seller, filter by
  status and category, sort by expiry (soonest first), purchase date or name.
- **Delete (with confirm), JSON export + import** — backups are strictly
  validated (app name, version, entry shape, max 200 entries); bad files are
  rejected with a clear error and an error banner.
- **Erase all** — requires typing `DELETE` exactly.
- **Bilingual EN / বাংলা toggle** — switches every UI string and shows Bengali
  digits when Bengali is active. The choice is persisted.
- **Example entry** — exactly one clearly labelled example
  ("Example: Samsung TV 43in", bought 2026-01-15, 24 months) is seeded on
  first run only, with an in-app note that it is an example to edit or delete.
- **Fully offline** — zero network requests, zero dependencies, no accounts.

## Stack

Vanilla HTML / CSS / JavaScript. No frameworks, no build step, no external
fonts or CDN. Pure static files; works by opening `index.html` in any modern
browser. Bengali strings are stored as `\uXXXX` escapes so all source files
stay pure ASCII.

## Prerequisites

Any modern browser (Chrome, Firefox, Edge, Safari). Node.js 18+ only if you
want to run the tests.

## Install / run

```bash
git clone <repo-url>
cd warranty-tracker-bd
# Option 1: just open index.html in a browser
# Option 2: serve it locally
python3 -m http.server 8000
# then open http://localhost:8000
```

## Dev commands

```bash
node --check js/core.js && node --check js/data.js && node --check js/i18n.js && node --check js/app.js
node --test tests/unit.test.mjs
node tests/smoke.mjs 1280   # desktop smoke tests (headless Chrome via CDP)
node tests/smoke.mjs 390    # mobile smoke tests
```

Regenerate the i18n file after editing the strings (Bengali stays escaped):

```bash
python3 .scratch/gen_i18n.py
```

## Environment

None. No API keys, no backend, no environment variables. Data lives in
`localStorage` under the key `wtbd-v1`.

## Testing

- Unit tests (`node --test tests/unit.test.mjs`): 12 test blocks covering
  `addMonths` clamping (Jan 31 → Feb 28 non-leap / Feb 29 leap, Dec 15 + 2 →
  Feb 15), `expiryDate`, `daysRemaining`, status boundaries (0 and 30 days =
  expiring, 31 = active, −1 = expired), `validateEntry` (good entry plus every
  bad field), `computeStats`, `filterEntries` (search / status / category /
  sort), `formatBDT` + `toBnDigits`, `validateImport` (good file, wrong app,
  wrong version, bad entry, >200 entries), data and i18n integrity.
  See `TEST_RESULTS.md` for the exact counts from the latest run.
- Smoke tests (`node tests/smoke.mjs [width]`): headless-Chrome CDP run over
  `file://` — title, example card, stats, add/edit/delete flows, search and
  status filters, validation, language toggle, bad-import rejection, erase
  flow, empty state after reload, zero console/page errors, zero external
  network requests, no horizontal overflow at 1280px and 390px.

## Deployment

Static site — deploy the whole folder to GitHub Pages (or any static host).
No build step and no server code.

## Limitations

- Data lives only in the browser's localStorage on one device; clearing browser
  data deletes it. Use the JSON backup to move it.
- Expiry math is calendar-month based: the warranty is taken to end the day
  before the purchase-date anniversary. Real warranty terms vary by seller —
  always check the receipt / warranty card.
- The single seeded entry is demo data, not a real purchase or warranty claim.
- No reminders or notifications: the app only shows status when you open it.

## Status

Complete MVP, tested (see `TEST_RESULTS.md`). No fabricated data: the only
shipped entry is the labelled example, and every other number is computed from
the user's own entries.
