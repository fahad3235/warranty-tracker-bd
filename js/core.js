/* Warranty Tracker BD - pure expiry math + validation logic.
   No DOM, no localStorage here: unit-testable from Node and reusable in the browser.
   Works in Node (module.exports) and in the browser (window.WT_CORE).
   All dates are ISO 'YYYY-MM-DD' and compared in UTC so results do not
   depend on the viewer's timezone. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WT_CORE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = {
    nameMax: 80,
    brandMax: 50,
    sellerMax: 60,
    notesMax: 200,
    monthsMin: 1,
    monthsMax: 120,
    priceMin: 0,
    priceMax: 10000000,
    maxEntries: 200,
  };

  const CATEGORIES = ['electronics', 'appliance', 'mobile', 'vehicle', 'home', 'other'];

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  function isISODate(s) {
    if (typeof s !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = parseUTC(s);
    return d !== null && toISO(d) === s;
  }

  /* Parse 'YYYY-MM-DD' as a UTC midnight Date, or null. */
  function parseUTC(s) {
    if (typeof s !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }

  function toISO(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /* Today's date in UTC as ISO, or the supplied ISO when given (tests). */
  function todayISO(override) {
    if (override && isISODate(override)) return override;
    const n = new Date();
    return toISO(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())));
  }

  /* Add calendar months to an ISO date, clamping the day of month:
     2026-01-31 + 1 -> 2026-02-28 (non-leap), 2024-01-31 + 1 -> 2024-02-29.
     Returns an ISO string, or null for a bad input. */
  function addMonths(purchaseISO, months) {
    const d = parseUTC(purchaseISO);
    if (!d || !isNum(months) || Math.floor(months) !== months) return null;
    const targetMonth = d.getUTCMonth() + months;
    const targetYear = d.getUTCFullYear() + Math.floor(targetMonth / 12);
    const month = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
    const day = Math.min(d.getUTCDate(), lastDay);
    return toISO(new Date(Date.UTC(targetYear, month, day)));
  }

  /* The last day the warranty covers. A warranty bought on 2026-01-15 for
     24 months covers through 2028-01-14, so expiry = addMonths - 1 day. */
  function expiryDate(purchaseISO, months) {
    const end = addMonths(purchaseISO, months);
    if (!end) return null;
    const d = parseUTC(end);
    d.setUTCDate(d.getUTCDate() - 1);
    return toISO(d);
  }

  /* Whole days from todayISO to expiryISO: positive = still covered,
     0 = last covered day, negative = expired that many days ago. */
  function daysRemaining(expiryISO, today) {
    const e = parseUTC(expiryISO);
    const t = parseUTC(todayISO(today));
    if (!e || !t) return null;
    return Math.round((e.getTime() - t.getTime()) / 86400000);
  }

  /* 'expired' if days < 0, 'expiring' if 0-30 days left, 'active' otherwise. */
  function status(expiryISO, today) {
    const days = daysRemaining(expiryISO, today);
    if (days === null) return 'unknown';
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'active';
  }

  /* Validate one warranty entry. Returns an array of error keys (empty = valid).
     entry: { name, brand, category, purchaseDate, warrantyMonths, price, seller, notes }
     todayISO override keeps the future-date check deterministic in tests. */
  function validateEntry(e, today) {
    const errs = [];
    if (!e || typeof e !== 'object') return ['entryInvalid'];
    if (!e.name || String(e.name).trim().length === 0) errs.push('nameRequired');
    else if (String(e.name).trim().length > LIMITS.nameMax) errs.push('nameTooLong');
    if (e.brand !== undefined && e.brand !== null && e.brand !== '') {
      if (String(e.brand).length > LIMITS.brandMax) errs.push('brandTooLong');
    }
    if (!CATEGORIES.includes(e.category)) errs.push('categoryInvalid');
    if (!e.purchaseDate) errs.push('purchaseRequired');
    else if (!isISODate(e.purchaseDate)) errs.push('purchaseInvalid');
    else if (e.purchaseDate > todayISO(today)) errs.push('purchaseFuture');
    if (e.warrantyMonths === undefined || e.warrantyMonths === null || e.warrantyMonths === '') errs.push('monthsRequired');
    else if (!isNum(e.warrantyMonths) || Math.floor(e.warrantyMonths) !== e.warrantyMonths) errs.push('monthsRequired');
    else if (e.warrantyMonths < LIMITS.monthsMin) errs.push('monthsTooShort');
    else if (e.warrantyMonths > LIMITS.monthsMax) errs.push('monthsTooLong');
    if (e.price !== undefined && e.price !== null && e.price !== '') {
      if (!isNum(e.price)) errs.push('priceInvalid');
      else if (e.price < LIMITS.priceMin) errs.push('priceNegative');
      else if (e.price > LIMITS.priceMax) errs.push('priceTooBig');
    }
    if (e.seller !== undefined && e.seller !== null && e.seller !== '') {
      if (String(e.seller).length > LIMITS.sellerMax) errs.push('sellerTooLong');
    }
    if (e.notes !== undefined && e.notes !== null && e.notes !== '') {
      if (String(e.notes).length > LIMITS.notesMax) errs.push('notesTooLong');
    }
    return errs;
  }

  /* Dashboard counts for a list of entries, as of today. */
  function computeStats(entries, today) {
    const t = todayISO(today);
    const stats = { total: 0, active: 0, expiring: 0, expired: 0, valueUnderWarranty: 0 };
    if (!Array.isArray(entries)) return stats;
    for (const e of entries) {
      if (validateEntry(e, t).length > 0) continue;
      stats.total++;
      const exp = expiryDate(e.purchaseDate, e.warrantyMonths);
      const s = status(exp, t);
      if (s === 'active') stats.active++;
      else if (s === 'expiring') stats.expiring++;
      else if (s === 'expired') stats.expired++;
      if (s !== 'expired' && isNum(e.price)) stats.valueUnderWarranty += e.price;
    }
    return stats;
  }

  /* Filter + sort a list for display. opts: { query, status, category, sort }.
     sort: 'expiry' (soonest first), 'purchase' (newest first), 'name' (A-Z). */
  function filterEntries(entries, opts, today) {
    const o = opts || {};
    const t = todayISO(today);
    const q = (o.query || '').trim().toLowerCase();
    let list = (entries || []).slice();
    if (q) {
      list = list.filter((e) =>
        String(e.name || '').toLowerCase().includes(q) ||
        String(e.brand || '').toLowerCase().includes(q) ||
        String(e.seller || '').toLowerCase().includes(q));
    }
    if (o.status && o.status !== 'all') {
      list = list.filter((e) => status(expiryDate(e.purchaseDate, e.warrantyMonths), t) === o.status);
    }
    if (o.category && o.category !== 'all') {
      list = list.filter((e) => e.category === o.category);
    }
    const sort = o.sort || 'expiry';
    if (sort === 'purchase') {
      list.sort((a, b) => String(b.purchaseDate).localeCompare(String(a.purchaseDate)));
    } else if (sort === 'name') {
      list.sort((a, b) => String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()));
    } else {
      list.sort((a, b) =>
        String(expiryDate(a.purchaseDate, a.warrantyMonths)).localeCompare(
          String(expiryDate(b.purchaseDate, b.warrantyMonths))));
    }
    return list;
  }

  /* Format a BDT amount with lakh-style grouping (en-IN) and 0 decimals. */
  function formatBDT(n) {
    if (!isNum(n)) return '\u2014';
    return '\u09f3' + Math.round(n).toLocaleString('en-IN');
  }

  /* Convert ASCII digits 0-9 in a string to Bengali digits. */
  function toBnDigits(s) {
    const map = { 0: '\u09e6', 1: '\u09e7', 2: '\u09e8', 3: '\u09e9', 4: '\u09ea', 5: '\u09eb', 6: '\u09ec', 7: '\u09ed', 8: '\u09ee', 9: '\u09ef' };
    return String(s).replace(/[0-9]/g, (d) => map[d]);
  }

  /* Localise a display string: in BN mode, digits become Bengali digits. */
  function localizeNumber(s, lang) {
    return lang === 'bn' ? toBnDigits(s) : String(s);
  }

  /* Validate an exported/imported backup object. */
  function validateImport(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.app !== 'warranty-tracker-bd') return false;
    if (typeof obj.version !== 'number' || obj.version !== 1) return false;
    if (!Array.isArray(obj.entries)) return false;
    if (obj.entries.length > LIMITS.maxEntries) return false;
    for (const e of obj.entries) {
      if (validateEntry(e).length > 0) return false;
    }
    if (obj.lang !== undefined && obj.lang !== 'en' && obj.lang !== 'bn') return false;
    return true;
  }

  return {
    LIMITS, CATEGORIES, isISODate, parseUTC, toISO, todayISO,
    addMonths, expiryDate, daysRemaining, status,
    validateEntry, computeStats, filterEntries,
    formatBDT, toBnDigits, localizeNumber, validateImport,
  };
});
