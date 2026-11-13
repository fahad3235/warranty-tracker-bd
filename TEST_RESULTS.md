# TEST_RESULTS - warranty-tracker-bd (run #319, 09:00 slot, 2026-11-13)

## Unit tests - 12/12 pass
Command: `node --test tests/unit.test.mjs` (Node v24.22.1)
- addMonths clamping: 2026-01-31 + 1 -> 2026-02-28 (non-leap); 2024-01-31 + 1 ->
  2024-02-29 (leap); 2025-12-15 + 2 -> 2026-02-15; 2026-03-31 + 1 -> 2026-04-30;
  year rollover 2026-11-15 + 3 -> 2027-02-15; bad input returns null
- expiryDate (last covered day = anniversary minus 1 day): 2026-01-15 + 24m ->
  2028-01-14; 2026-01-31 + 1m -> 2026-02-27; 2026-10-20 + 1m -> 2026-11-19
- daysRemaining: 0 on the expiry day, -1 the day after, +7 / +61 ahead
- status boundaries: 0 days = expiring, 30 days = expiring, 31 days = active,
  -1 day = expired
- validateEntry: good entry passes (incl. empty/absent optionals, price 0);
  null entry rejected; every bad field rejected with its own key (empty name,
  81-char name, 51-char brand, bad category, missing/invalid/future purchase
  date, months null / 1.5 / 0 / 121, price -1 / 10,000,001 / 'abc',
  61-char seller, 201-char notes); 120 months and same-day purchase pass
- computeStats: 3 entries -> total 3, active 1, expiring 1, expired 1,
  value under warranty 75,000 (45,000 + 30,000; expired item excluded)
- filterEntries: search by brand ('xiaomi') and name ('fridge'); status
  expired/expiring; category mobile/electronics; default sort expiry soonest
  first; name A-Z; purchase newest first
- formatBDT: 45,000 -> BDT 45,000; 1,234,567 -> BDT 12,34,567 (lakh grouping);
  toBnDigits('1234567') -> Bengali digits; localizeNumber BN/EN
- validateImport: good backup accepted (incl. empty entries, 200 entries);
  wrong app, version 2, bad entry, future purchase, 201 entries, bad lang
  all rejected
- data: 6 categories, example entry valid, name 'Example: Samsung TV 43in',
  purchase 2026-01-15, 24 months, storage key wtbd-v1
- i18n: 91 keys, EN+BN both non-empty, every validateEntry error key has an
  err_ string, fallback returns the key

## Syntax checks - all pass
Command: `node --check` on js/core.js, js/data.js, js/i18n.js, js/app.js,
tests/unit.test.mjs, tests/smoke.mjs — 6/6 OK.

## Headless-Chrome smoke - 49/49 pass at 1280px AND 49/49 at 390px
Command: `node tests/smoke.mjs 1280` and `node tests/smoke.mjs 390`
(raw CDP against Playwright-cached headless_shell-1187,
Chromium 140.0.7339.16, file:// URL)
- page title, h1, 5 stat cards, example card with name, badge, expiry
  2028-01-14 and price 45,000; stats total 1 / active 1 / expiring 0 /
  expired 0 / value 45,000
- add Test Fridge (bought 2026-10-20, 1 month): 2 cards, total 2, expiring 1,
  value 75,000, expiring badge present, soonest expiry sorts first,
  localStorage has 2 entries
- search 'samsung' narrows to 1 card; clearing restores 2; status filter
  expired -> 0 cards, expiring -> 1 card, back to all
- validation: empty name + future date + 0 months rejected with all three
  messages, no entry added
- edit: form pre-filled, price 30,000 -> 35,000, still 2 entries, value
  updated to 80,000
- delete (confirm auto-accepted in the harness): entry removed, total back
  to 1, remaining card is the example
- language: toggle switches title to Bengali, Bengali digits appear in
  stats, example name gets the Bengali prefix, toggles back to English
- data: export button present; bad import rejected with message + error
  banner, 1 entry kept; erase needs exact DELETE; DELETE erases and
  confirms; empty state after erase + reload
- zero console errors, zero page exceptions, zero non-file network requests
- no horizontal overflow at either width (initial and empty state)

## Repairs made during testing
- None needed in the app: 0 app bugs found. Two test-side fixes only:
  1. Smoke-test BN-prefix check targeted the first card (Test Fridge after
     sorting); changed to select the card carrying the example badge.
  2. Smoke-test delete flow added with window.confirm auto-accepted via
     Page.addScriptToEvaluateOnNewDocument, so the dialog cannot block the run.

## Notes
- No mock data: all numbers are computed from the user's own entries; the only
  shipped entry is the labelled example to edit or delete. No real brand or
  warranty claims anywhere (README + in-app example note).
- Sources are pure ASCII (Bengali as \uXXXX escapes via .scratch/gen_i18n.py);
  verified with `grep -P '[^\x00-\x7F]'` - zero matches in index.html, js/,
  styles.css and tests/. README.md keeps a small amount of UTF-8 Bengali.
- Expiry convention: a warranty bought on a date for N months covers through
  the day before the purchase-date anniversary (e.g. 2026-01-15 + 24m ->
  2028-01-14); documented in README and core.js.
- Repo creation / push NOT done in this run (build + test only, per task).
