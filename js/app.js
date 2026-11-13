/* Warranty Tracker BD - UI. Depends on window.WT_CORE, window.WT_DATA, window.WT_I18N.
   State (localStorage, key wtbd-v1): { entries, lang }. */
(function () {
  'use strict';

  var Core = window.WT_CORE;
  var DATA = window.WT_DATA;
  var I18N = window.WT_I18N;
  var KEY = DATA.STORAGE_KEY;

  var state = loadState();
  var editingId = null;
  var filters = { query: '', status: 'all', category: 'all', sort: 'expiry' };

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.entries)) {
          return {
            entries: parsed.entries,
            lang: parsed.lang === 'bn' ? 'bn' : 'en',
          };
        }
      }
    } catch (e) { /* corrupted storage: fall through to defaults */ }
    return { entries: [JSON.parse(JSON.stringify(DATA.EXAMPLE_ENTRY))], lang: 'en' };
  }

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }

  function t(key) { return I18N.t(key, state.lang); }
  function num(n) { return Core.localizeNumber(String(n), state.lang); }
  function money(n) { return Core.localizeNumber(Core.formatBDT(n), state.lang); }
  function el(id) { return document.getElementById(id); }
  function todayISO() { return Core.todayISO(); }

  function displayName(e) {
    if (e.isExample && state.lang === 'bn' && e.name.indexOf('Example: ') === 0) {
      return '\u0989\u09a6\u09be\u09b9\u09b0\u09a3: ' + e.name.slice('Example: '.length);
    }
    return e.name;
  }

  function catLabel(id) { return t('cat_' + id); }

  /* ---------- static labels ---------- */
  function applyStaticLabels() {
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (node) {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-ph')));
    });
    el('lang-toggle').textContent = state.lang === 'bn' ? 'English' : '\u09ac\u09be\u0982\u09b2\u09be';
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    el('form-title').textContent = t(editingId ? 'formTitleEdit' : 'formTitle');
    el('entry-submit').textContent = t(editingId ? 'updateBtn' : 'addBtn');
    el('entry-cancel').classList.toggle('hidden', !editingId);
    // filter / sort option labels are rebuilt each render so they localise
    buildFilterOptions();
  }

  function buildFilterOptions() {
    var fs = el('f-status');
    var keepS = fs.value || 'all';
    fs.innerHTML = '';
    [['all', 'filterStatus'], ['active', 'statusActive'], ['expiring', 'statusExpiring'], ['expired', 'statusExpired']].forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0]; opt.textContent = t(pair[1]);
      fs.appendChild(opt);
    });
    fs.value = keepS;
    var fc = el('f-category');
    var keepC = fc.value || 'all';
    fc.innerHTML = '';
    var allOpt = document.createElement('option');
    allOpt.value = 'all'; allOpt.textContent = t('filterCategory');
    fc.appendChild(allOpt);
    DATA.CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id; opt.textContent = catLabel(c.id);
      fc.appendChild(opt);
    });
    fc.value = keepC;
    var fsrt = el('f-sort');
    var keepSort = fsrt.value || 'expiry';
    fsrt.innerHTML = '';
    [['expiry', 'sortExpiry'], ['purchase', 'sortPurchase'], ['name', 'sortName']].forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0]; opt.textContent = t(pair[1]);
      fsrt.appendChild(opt);
    });
    fsrt.value = keepSort;
  }

  /* ---------- form ---------- */
  function readForm() {
    var priceRaw = el('f-price').value.trim();
    return {
      name: el('f-name').value.trim(),
      brand: el('f-brand').value.trim(),
      category: el('f-category-form').value,
      purchaseDate: el('f-purchase').value,
      warrantyMonths: intOrNull(el('f-months').value),
      price: priceRaw === '' ? null : numOrNull(priceRaw),
      seller: el('f-seller').value.trim(),
      notes: el('f-notes').value.trim(),
    };
  }

  function numOrNull(v) {
    var n = parseFloat(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }
  function intOrNull(v) {
    var s = String(v).replace(/,/g, '').trim();
    if (s === '') return null;
    var n = parseInt(s, 10);
    return isFinite(n) ? n : null;
  }

  function submitEntry(ev) {
    ev.preventDefault();
    var entry = readForm();
    var errs = Core.validateEntry(entry);
    var box = el('form-errors');
    if (errs.length > 0) {
      box.innerHTML = '';
      var ul = document.createElement('ul');
      errs.forEach(function (k) {
        var li = document.createElement('li');
        li.textContent = t('err_' + k);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      el('form-msg').textContent = '';
      return;
    }
    if (editingId) {
      var idx = state.entries.findIndex(function (o) { return o.id === editingId; });
      if (idx >= 0) {
        entry.id = editingId;
        entry.isExample = !!state.entries[idx].isExample;
        state.entries[idx] = entry;
      }
      editingId = null;
      el('form-msg').textContent = t('entryUpdated');
    } else {
      entry.id = 'entry-' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
      state.entries.push(entry);
      el('form-msg').textContent = t('entryAdded');
    }
    saveState();
    clearForm();
    renderAll();
  }

  function clearForm() {
    el('entry-form').reset();
    el('f-category-form').value = 'electronics';
    el('form-errors').innerHTML = '';
    editingId = null;
    applyStaticLabels();
  }

  function editEntry(id) {
    var e = state.entries.find(function (x) { return x.id === id; });
    if (!e) return;
    editingId = id;
    el('f-name').value = e.name;
    el('f-brand').value = e.brand || '';
    el('f-category-form').value = e.category;
    el('f-purchase').value = e.purchaseDate;
    el('f-months').value = e.warrantyMonths;
    el('f-price').value = e.price != null ? e.price : '';
    el('f-seller').value = e.seller || '';
    el('f-notes').value = e.notes || '';
    el('form-errors').innerHTML = '';
    el('form-msg').textContent = '';
    applyStaticLabels();
    el('entry-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    el('f-name').focus();
  }

  function deleteEntry(id) {
    if (!window.confirm(t('confirmDelete'))) return;
    state.entries = state.entries.filter(function (o) { return o.id !== id; });
    if (editingId === id) { editingId = null; clearForm(); }
    saveState();
    el('form-msg').textContent = t('entryDeleted');
    renderAll();
  }

  /* ---------- dashboard + list ---------- */
  function renderStats() {
    var s = Core.computeStats(state.entries);
    el('stat-total').textContent = num(s.total);
    el('stat-active').textContent = num(s.active);
    el('stat-expiring').textContent = num(s.expiring);
    el('stat-expired').textContent = num(s.expired);
    el('stat-value').textContent = money(s.valueUnderWarranty);
  }

  function daysText(expiry) {
    var days = Core.daysRemaining(expiry, todayISO());
    if (days === null) return '';
    if (days < 0) return t('expiredAgo') + ' ' + num(-days) + ' ' + t('daysAgoSuffix');
    if (days === 0) return t('daysLeftToday');
    return num(days) + ' ' + t('daysLeft');
  }

  function renderList() {
    var list = el('entries-list');
    list.innerHTML = '';
    var shown = Core.filterEntries(state.entries, filters);
    if (state.entries.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('emptyList');
      list.appendChild(p);
      return;
    }
    if (shown.length === 0) {
      var p2 = document.createElement('p');
      p2.className = 'empty';
      p2.textContent = t('emptyList');
      list.appendChild(p2);
      return;
    }
    var today = todayISO();
    shown.forEach(function (e) {
      var expiry = Core.expiryDate(e.purchaseDate, e.warrantyMonths);
      var st = Core.status(expiry, today);
      var card = document.createElement('article');
      card.className = 'entry-card status-' + st;
      var h = document.createElement('h3');
      h.textContent = displayName(e);
      card.appendChild(h);
      var meta = document.createElement('p');
      meta.className = 'entry-meta';
      var bits = [catLabel(e.category)];
      if (e.brand) bits.push(e.brand);
      if (e.seller) bits.push(t('sellerLabel') + ': ' + e.seller);
      meta.textContent = bits.join(' \u00b7 ');
      card.appendChild(meta);
      var badge = document.createElement('span');
      badge.className = 'badge status ' + st;
      badge.textContent = t('status' + st.charAt(0).toUpperCase() + st.slice(1));
      card.appendChild(badge);
      if (e.isExample) {
        var ex = document.createElement('span');
        ex.className = 'badge example';
        ex.textContent = t('exampleBadge');
        card.appendChild(ex);
      }
      var dl = document.createElement('dl');
      dl.className = 'entry-nums';
      var rows = [
        [t('purchaseLabel'), num(e.purchaseDate)],
        [t('expiryLabel'), num(expiry)],
        [t('daysLeft'), daysText(expiry)],
        [t('priceLabel'), e.price != null ? money(e.price) : t('noPrice')],
      ];
      if (e.notes) rows.push([t('notesLabel'), e.notes]);
      rows.forEach(function (row) {
        var dt = document.createElement('dt'); dt.textContent = row[0];
        var dd = document.createElement('dd'); dd.textContent = row[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      card.appendChild(dl);
      var actions = document.createElement('div');
      actions.className = 'card-actions';
      var eb = document.createElement('button');
      eb.type = 'button'; eb.className = 'btn small'; eb.textContent = t('editBtn');
      eb.addEventListener('click', function () { editEntry(e.id); });
      var db = document.createElement('button');
      db.type = 'button'; db.className = 'btn small danger'; db.textContent = t('deleteBtn');
      db.addEventListener('click', function () { deleteEntry(e.id); });
      actions.appendChild(eb); actions.appendChild(db);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  /* ---------- data ---------- */
  function exportData() {
    var payload = { app: 'warranty-tracker-bd', version: DATA.APP_VERSION, entries: state.entries, lang: state.lang };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'warranty-tracker-bd-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function importData() {
    var msg = el('data-msg');
    var banner = el('error-banner');
    try {
      var obj = JSON.parse(el('import-text').value);
      if (!Core.validateImport(obj)) {
        msg.textContent = t('importBad');
        banner.textContent = t('importBad');
        banner.classList.remove('hidden');
        return;
      }
      state.entries = obj.entries;
      if (obj.lang === 'en' || obj.lang === 'bn') state.lang = obj.lang;
      editingId = null;
      saveState();
      clearForm();
      renderAll();
      banner.classList.add('hidden');
      banner.textContent = '';
      msg.textContent = t('importOk');
    } catch (err) {
      msg.textContent = t('importBad');
      banner.textContent = t('importBad');
      banner.classList.remove('hidden');
    }
  }

  function eraseData() {
    var msg = el('data-msg');
    if (el('erase-input').value !== 'DELETE') { msg.textContent = t('eraseWrong'); return; }
    state = { entries: [], lang: state.lang };
    editingId = null;
    saveState();
    clearForm();
    renderAll();
    el('erase-input').value = '';
    msg.textContent = t('eraseDone');
  }

  function renderAll() {
    applyStaticLabels();
    renderStats();
    renderList();
  }

  /* ---------- wiring ---------- */
  el('lang-toggle').addEventListener('click', function () {
    state.lang = state.lang === 'bn' ? 'en' : 'bn';
    saveState();
    renderAll();
  });
  el('entry-form').addEventListener('submit', submitEntry);
  el('entry-cancel').addEventListener('click', function () { clearForm(); renderAll(); });
  el('f-search').addEventListener('input', function () {
    filters.query = el('f-search').value;
    renderList();
  });
  el('f-status').addEventListener('change', function () {
    filters.status = el('f-status').value;
    renderList();
  });
  el('f-category').addEventListener('change', function () {
    filters.category = el('f-category').value;
    renderList();
  });
  el('f-sort').addEventListener('change', function () {
    filters.sort = el('f-sort').value;
    renderList();
  });
  el('export-btn').addEventListener('click', exportData);
  el('import-btn').addEventListener('click', importData);
  el('erase-btn').addEventListener('click', eraseData);

  renderAll();

  /* Exposed for smoke tests. */
  window.WT_APP = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getFilters: function () { return JSON.parse(JSON.stringify(filters)); },
    getVisible: function () { return Core.filterEntries(state.entries, filters); },
  };
})();
