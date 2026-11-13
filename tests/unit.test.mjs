/* Warranty Tracker BD - node unit tests. Run: node --test tests/unit.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const DATA = require('../js/data.js');
const I18N = require('../js/i18n.js');

const TODAY = '2026-11-13';

const good = {
  name: 'Test Fridge',
  brand: 'Walton',
  category: 'appliance',
  purchaseDate: '2026-01-15',
  warrantyMonths: 24,
  price: 30000,
  seller: 'New Market Shop',
  notes: 'Keep the receipt.',
};

test('addMonths: day-of-month clamping', () => {
  // 31 Jan + 1 month -> 28 Feb in a non-leap year
  assert.equal(Core.addMonths('2026-01-31', 1), '2026-02-28');
  // 31 Jan + 1 month -> 29 Feb in a leap year
  assert.equal(Core.addMonths('2024-01-31', 1), '2024-02-29');
  // 15 Dec + 2 months -> 15 Feb
  assert.equal(Core.addMonths('2025-12-15', 2), '2026-02-15');
  // ordinary case keeps the day
  assert.equal(Core.addMonths('2026-01-15', 24), '2028-01-15');
  // 31 Mar + 1 -> 30 Apr
  assert.equal(Core.addMonths('2026-03-31', 1), '2026-04-30');
  // year rollover
  assert.equal(Core.addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(Core.addMonths('bad-date', 1), null);
});

test('expiryDate: last covered day is one day before the anniversary', () => {
  assert.equal(Core.expiryDate('2026-01-15', 24), '2028-01-14');
  assert.equal(Core.expiryDate('2026-01-31', 1), '2026-02-27');
  assert.equal(Core.expiryDate('2026-10-20', 1), '2026-11-19');
  assert.equal(Core.expiryDate('bad-date', 12), null);
});

test('daysRemaining: today / expired / positive', () => {
  assert.equal(Core.daysRemaining('2026-11-13', TODAY), 0);
  assert.equal(Core.daysRemaining('2026-11-12', TODAY), -1);
  assert.equal(Core.daysRemaining('2026-11-20', TODAY), 7);
  assert.equal(Core.daysRemaining('2027-01-13', TODAY), 61);
  assert.equal(Core.daysRemaining('not-a-date', TODAY), null);
});

test('status: boundary days', () => {
  assert.equal(Core.status('2026-11-13', TODAY), 'expiring'); // 0 days left
  assert.equal(Core.status('2026-12-13', TODAY), 'expiring'); // 30 days left
  assert.equal(Core.status('2026-12-14', TODAY), 'active'); // 31 days left
  assert.equal(Core.status('2026-11-12', TODAY), 'expired'); // -1 day
  assert.equal(Core.status('2028-01-14', TODAY), 'active');
});

test('validateEntry: good entry passes', () => {
  assert.deepEqual(Core.validateEntry(good, TODAY), []);
  // optional fields may be empty or absent
  assert.deepEqual(Core.validateEntry({ ...good, brand: '', seller: '', notes: '', price: null }, TODAY), []);
  assert.deepEqual(Core.validateEntry({ ...good, price: undefined }, TODAY), []);
  assert.deepEqual(Core.validateEntry({ ...good, price: 0 }, TODAY), []);
  assert.deepEqual(Core.validateEntry(null, TODAY), ['entryInvalid']);
});

test('validateEntry: each bad field rejected', () => {
  assert.deepEqual(Core.validateEntry({ ...good, name: '' }, TODAY), ['nameRequired']);
  assert.deepEqual(Core.validateEntry({ ...good, name: '   ' }, TODAY), ['nameRequired']);
  assert.deepEqual(Core.validateEntry({ ...good, name: 'x'.repeat(81) }, TODAY), ['nameTooLong']);
  assert.deepEqual(Core.validateEntry({ ...good, brand: 'x'.repeat(51) }, TODAY), ['brandTooLong']);
  assert.deepEqual(Core.validateEntry({ ...good, category: 'gold' }, TODAY), ['categoryInvalid']);
  assert.deepEqual(Core.validateEntry({ ...good, purchaseDate: '' }, TODAY), ['purchaseRequired']);
  assert.deepEqual(Core.validateEntry({ ...good, purchaseDate: '2026-13-40' }, TODAY), ['purchaseInvalid']);
  assert.deepEqual(Core.validateEntry({ ...good, purchaseDate: '2026-11-14' }, TODAY), ['purchaseFuture']);
  assert.deepEqual(Core.validateEntry({ ...good, purchaseDate: '2026-11-13' }, TODAY), []);
  assert.deepEqual(Core.validateEntry({ ...good, warrantyMonths: null }, TODAY), ['monthsRequired']);
  assert.deepEqual(Core.validateEntry({ ...good, warrantyMonths: 1.5 }, TODAY), ['monthsRequired']);
  assert.deepEqual(Core.validateEntry({ ...good, warrantyMonths: 0 }, TODAY), ['monthsTooShort']);
  assert.deepEqual(Core.validateEntry({ ...good, warrantyMonths: 121 }, TODAY), ['monthsTooLong']);
  assert.deepEqual(Core.validateEntry({ ...good, warrantyMonths: 120 }, TODAY), []);
  assert.deepEqual(Core.validateEntry({ ...good, price: -1 }, TODAY), ['priceNegative']);
  assert.deepEqual(Core.validateEntry({ ...good, price: 10000001 }, TODAY), ['priceTooBig']);
  assert.deepEqual(Core.validateEntry({ ...good, price: 'abc' }, TODAY), ['priceInvalid']);
  assert.deepEqual(Core.validateEntry({ ...good, seller: 'x'.repeat(61) }, TODAY), ['sellerTooLong']);
  assert.deepEqual(Core.validateEntry({ ...good, notes: 'x'.repeat(201) }, TODAY), ['notesTooLong']);
});

test('computeStats: counts and value under warranty', () => {
  const expiring = { ...good, name: 'Expiring Fan', purchaseDate: '2026-10-20', warrantyMonths: 1, price: 30000 };
  const expired = { ...good, name: 'Old Phone', category: 'mobile', purchaseDate: '2025-01-01', warrantyMonths: 12, price: 20000 };
  const stats = Core.computeStats([DATA.EXAMPLE_ENTRY, expiring, expired], TODAY);
  assert.equal(stats.total, 3);
  assert.equal(stats.active, 1);
  assert.equal(stats.expiring, 1);
  assert.equal(stats.expired, 1);
  // value counts only items still under warranty (45,000 + 30,000)
  assert.equal(stats.valueUnderWarranty, 75000);
  assert.deepEqual(Core.computeStats([], TODAY), { total: 0, active: 0, expiring: 0, expired: 0, valueUnderWarranty: 0 });
});

test('filterEntries: search, status, category, sort', () => {
  const a = { ...good, name: 'Alpha Fridge', purchaseDate: '2026-01-15', warrantyMonths: 24 };
  const b = { ...good, name: 'Beta Phone', brand: 'Xiaomi', category: 'mobile', purchaseDate: '2026-10-20', warrantyMonths: 1 };
  const c = { ...good, name: 'Gamma TV', category: 'electronics', purchaseDate: '2025-01-01', warrantyMonths: 12 };
  const list = [a, b, c];
  assert.deepEqual(Core.filterEntries(list, { query: 'xiaomi' }, TODAY).map((e) => e.name), ['Beta Phone']);
  assert.deepEqual(Core.filterEntries(list, { query: 'fridge' }, TODAY).map((e) => e.name), ['Alpha Fridge']);
  assert.deepEqual(Core.filterEntries(list, { status: 'expired' }, TODAY).map((e) => e.name), ['Gamma TV']);
  assert.deepEqual(Core.filterEntries(list, { status: 'expiring' }, TODAY).map((e) => e.name), ['Beta Phone']);
  assert.deepEqual(Core.filterEntries(list, { category: 'mobile' }, TODAY).map((e) => e.name), ['Beta Phone']);
  assert.deepEqual(Core.filterEntries(list, { category: 'electronics' }, TODAY).map((e) => e.name), ['Gamma TV']);
  // default sort: expiry soonest first (Gamma expired 2025-12-31, Beta 2026-11-19, Alpha 2028-01-14)
  assert.deepEqual(Core.filterEntries(list, {}, TODAY).map((e) => e.name), ['Gamma TV', 'Beta Phone', 'Alpha Fridge']);
  assert.deepEqual(Core.filterEntries(list, { sort: 'name' }, TODAY).map((e) => e.name), ['Alpha Fridge', 'Beta Phone', 'Gamma TV']);
  assert.deepEqual(Core.filterEntries(list, { sort: 'purchase' }, TODAY).map((e) => e.name), ['Beta Phone', 'Alpha Fridge', 'Gamma TV']);
});

test('formatBDT + toBnDigits + localizeNumber', () => {
  assert.equal(Core.formatBDT(45000), '\u09f345,000');
  assert.equal(Core.formatBDT(1234567), '\u09f312,34,567');
  assert.equal(Core.formatBDT('x'), '\u2014');
  assert.equal(Core.toBnDigits('1234567'), '\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed');
  assert.equal(Core.toBnDigits('2026-11-13'), '\u09e8\u09e6\u09e8\u09ec-\u09e7\u09e7-\u09e7\u09e9');
  assert.equal(Core.localizeNumber('12 days', 'bn'), '\u09e7\u09e8 days');
  assert.equal(Core.localizeNumber('12 days', 'en'), '12 days');
});

test('validateImport: accepts good backups, rejects everything else', () => {
  const ok = { app: 'warranty-tracker-bd', version: 1, entries: [good], lang: 'bn' };
  assert.equal(Core.validateImport(ok), true);
  assert.equal(Core.validateImport({ ...ok, entries: [] }), true);
  assert.equal(Core.validateImport({ ...ok, lang: undefined }), true);
  assert.equal(Core.validateImport(null), false);
  assert.equal(Core.validateImport({ ...ok, app: 'other-app' }), false);
  assert.equal(Core.validateImport({ ...ok, version: 2 }), false);
  assert.equal(Core.validateImport({ ...ok, entries: [{ ...good, warrantyMonths: 0 }] }), false);
  assert.equal(Core.validateImport({ ...ok, entries: [{ ...good, purchaseDate: '2999-01-01' }] }), false);
  assert.equal(Core.validateImport({ ...ok, entries: Array(201).fill(good) }), false);
  assert.equal(Core.validateImport({ ...ok, entries: Array(200).fill(good) }), true);
  assert.equal(Core.validateImport({ ...ok, lang: 'fr' }), false);
});

test('data: example entry is valid, 6 categories', () => {
  assert.equal(DATA.CATEGORIES.length, 6);
  assert.deepEqual(Core.validateEntry(DATA.EXAMPLE_ENTRY, TODAY), []);
  assert.equal(DATA.EXAMPLE_ENTRY.isExample, true);
  assert.equal(DATA.EXAMPLE_ENTRY.name, 'Example: Samsung TV 43in');
  assert.equal(DATA.EXAMPLE_ENTRY.purchaseDate, '2026-01-15');
  assert.equal(DATA.EXAMPLE_ENTRY.warrantyMonths, 24);
  assert.equal(DATA.STORAGE_KEY, 'wtbd-v1');
});

test('i18n: EN and BN sets identical, all non-empty, no missing err keys', () => {
  const keys = I18N.keys();
  assert.ok(keys.length >= 85, 'keys: ' + keys.length);
  for (const k of keys) {
    const pair = I18N.STRINGS[k];
    assert.ok(pair[0] && pair[0].length > 0, k + ' EN empty');
    assert.ok(pair[1] && pair[1].length > 0, k + ' BN empty');
  }
  const errKeys = ['entryInvalid', 'nameRequired', 'nameTooLong', 'brandTooLong',
    'categoryInvalid', 'purchaseRequired', 'purchaseInvalid', 'purchaseFuture',
    'monthsRequired', 'monthsTooShort', 'monthsTooLong', 'priceInvalid',
    'priceNegative', 'priceTooBig', 'sellerTooLong', 'notesTooLong'];
  for (const k of errKeys) assert.ok(I18N.STRINGS['err_' + k], 'missing err_' + k);
  assert.equal(I18N.t('appTitle', 'en'), 'Warranty Tracker BD');
  assert.equal(I18N.t('appTitle', 'bn'), '\u0993\u09af\u09bc\u09be\u09b0\u09c7\u09a8\u09cd\u099f\u09bf \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0 \u09ac\u09bf\u09a1\u09bf');
  assert.equal(I18N.t('no-such-key', 'en'), 'no-such-key');
});
