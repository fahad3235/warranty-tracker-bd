/* Warranty Tracker BD - headless-Chrome smoke tests via raw CDP (no deps).
   Run: node tests/smoke.mjs [width]   (default 1280; pass 390 for mobile)
   Uses the Playwright-cached headless_shell. Serves the app over file:// */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell');
const WIDTH = parseInt(process.argv[2] || '1280', 10);
const HEIGHT = 900;
const PORT = 9335;

let failures = [];
let checks = 0;
function check(name, cond, extra = '') {
  checks++;
  if (cond) console.log('  PASS ' + name);
  else { failures.push(name + (extra ? ' \u2014 ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' \u2014 ' + extra : '')); }
}

const chrome = spawn(SHELL, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      return j.webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('CDP did not start');
}

async function main() {
  const browserWs = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { browserWs.onopen = res; browserWs.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  const events = [];
  browserWs.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    browserWs.send(JSON.stringify({ id, method, params }));
  });

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.result.targetId;
  const attached = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  const sendS = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    browserWs.send(JSON.stringify({ id, sessionId, method, params }));
  });

  await sendS('Runtime.enable');
  await sendS('Page.enable');
  await sendS('Network.enable');
  await sendS('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 500 });

  const consoleErrors = [];
  const pageErrors = [];
  const extRequests = [];
  const origOnMessage = browserWs.onmessage;
  browserWs.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
    }
    if (m.sessionId === sessionId && m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (m.sessionId === sessionId && m.method === 'Network.requestWillBeSent') {
      const url = m.params.request.url;
      if (!url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('chrome')) {
        extRequests.push(url);
      }
    }
    origOnMessage(ev);
  };

  const evalJs = async (expr) => {
    const r = await sendS('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  // auto-accept window.confirm (delete flow) so the dialog cannot block the run
  await sendS('Page.addScriptToEvaluateOnNewDocument', { source: 'window.confirm = function(){ return true; };' });

  const fileUrl = 'file://' + path.join(ROOT, 'index.html');
  await sendS('Page.navigate', { url: fileUrl });
  await sleep(1200);

  console.log(`== smoke @ ${WIDTH}px ==`);

  check('page title', (await evalJs('document.title')).includes('Warranty Tracker BD'));
  check('h1 renders', (await evalJs(`document.getElementById('app-title').textContent`)) === 'Warranty Tracker BD');
  check('5 stat cards present', (await evalJs(`document.querySelectorAll('.stat-card').length`)) === 5);
  check('example entry card renders', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 1);
  check('example name shown', (await evalJs(`document.querySelector('.entry-card h3').textContent`)).includes('Example: Samsung TV 43in'));
  check('example badge shown', (await evalJs(`document.querySelector('.entry-card').textContent`)).includes('Example'));
  check('example expiry shown (2028-01-14)', (await evalJs(`document.querySelector('.entry-card').textContent`)).includes('2028-01-14'));
  check('example price shown (45,000)', (await evalJs(`document.querySelector('.entry-card').textContent`)).includes('45,000'));
  check('stats: total 1', (await evalJs(`document.getElementById('stat-total').textContent`)) === '1');
  check('stats: active 1', (await evalJs(`document.getElementById('stat-active').textContent`)) === '1');
  check('stats: expiring 0', (await evalJs(`document.getElementById('stat-expiring').textContent`)) === '0');
  check('stats: expired 0', (await evalJs(`document.getElementById('stat-expired').textContent`)) === '0');
  check('stats: value 45,000', (await evalJs(`document.getElementById('stat-value').textContent`)).includes('45,000'));
  check('no horizontal overflow (initial)', (await evalJs('document.documentElement.scrollWidth')) <= WIDTH + 1,
    'scrollWidth=' + (await evalJs('document.documentElement.scrollWidth')));

  // --- add a second entry that expires soon (bought 2026-10-20, 1 month -> 2026-11-19) ---
  await evalJs(`(function(){
    document.getElementById('f-name').value = 'Test Fridge';
    document.getElementById('f-brand').value = 'Walton';
    document.getElementById('f-category-form').value = 'appliance';
    document.getElementById('f-purchase').value = '2026-10-20';
    document.getElementById('f-months').value = '1';
    document.getElementById('f-price').value = '30000';
    document.getElementById('f-seller').value = 'New Market';
    document.getElementById('entry-submit').click();
  })()`);
  await sleep(250);
  check('second entry added', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 2);
  check('stats: total 2 after add', (await evalJs(`document.getElementById('stat-total').textContent`)) === '2');
  check('stats: expiring 1 after add', (await evalJs(`document.getElementById('stat-expiring').textContent`)) === '1');
  check('stats: value 75,000 after add', (await evalJs(`document.getElementById('stat-value').textContent`)).includes('75,000'));
  check('expiring card has expiring badge', (await evalJs(`document.querySelectorAll('.entry-card.status-expiring').length`)) === 1);
  check('soonest expiry sorts first', (await evalJs(`document.querySelector('.entry-card h3').textContent`)) === 'Test Fridge');
  check('state persisted to localStorage', (await evalJs(`JSON.parse(localStorage.getItem('wtbd-v1')).entries.length`)) === 2);

  // --- search narrows the list ---
  await evalJs(`(function(){ const s=document.getElementById('f-search'); s.value='samsung'; s.dispatchEvent(new Event('input')); })()`);
  await sleep(200);
  check('search narrows to 1 card', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 1);
  await evalJs(`(function(){ const s=document.getElementById('f-search'); s.value=''; s.dispatchEvent(new Event('input')); })()`);
  await sleep(200);
  check('clearing search restores 2 cards', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 2);

  // --- status filter narrows the list ---
  await evalJs(`(function(){ const s=document.getElementById('f-status'); s.value='expired'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(200);
  check('expired filter shows 0 cards (none expired)', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 0);
  await evalJs(`(function(){ const s=document.getElementById('f-status'); s.value='expiring'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(200);
  check('expiring filter shows 1 card', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 1);
  await evalJs(`(function(){ const s=document.getElementById('f-status'); s.value='all'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(200);

  // --- validation: empty name + future date + 0 months rejected ---
  await evalJs(`(function(){
    document.getElementById('f-name').value = '';
    document.getElementById('f-purchase').value = '2999-01-01';
    document.getElementById('f-months').value = '0';
    document.getElementById('entry-submit').click();
  })()`);
  await sleep(200);
  const formErrs = await evalJs(`document.getElementById('form-errors').textContent`);
  check('validation errors shown', formErrs.includes('product name') && formErrs.includes('future') && formErrs.includes('at least 1 month'), formErrs);
  check('invalid entry not added', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 2);

  // --- edit flow: edit Test Fridge price 30000 -> 35000 ---
  await evalJs(`(function(){
    document.querySelector('.entry-card.status-expiring').querySelectorAll('button')[0].click();
  })()`);
  await sleep(200);
  check('edit fills the form', (await evalJs(`document.getElementById('f-name').value`)) === 'Test Fridge');
  await evalJs(`(function(){
    document.getElementById('f-price').value = '35000';
    document.getElementById('entry-submit').click();
  })()`);
  await sleep(250);
  check('still 2 entries after edit', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 2);
  check('stats value updated to 80,000 after edit', (await evalJs(`document.getElementById('stat-value').textContent`)).includes('80,000'));

  // --- delete flow: delete Test Fridge (confirm auto-accepted) ---
  await evalJs(`(function(){
    document.querySelector('.entry-card.status-expiring').querySelectorAll('button')[1].click();
  })()`);
  await sleep(250);
  check('delete removes the entry', (await evalJs(`document.querySelectorAll('.entry-card').length`)) === 1);
  check('stats: total 1 after delete', (await evalJs(`document.getElementById('stat-total').textContent`)) === '1');
  check('remaining card is the example', (await evalJs(`document.querySelector('.entry-card h3').textContent`)).includes('Example: Samsung TV 43in'));

  // --- language toggle ---
  await evalJs(`document.getElementById('lang-toggle').click()`);
  await sleep(250);
  check('BN toggle changes title', (await evalJs(`document.getElementById('app-title').textContent`)) === '\u0993\u09af\u09bc\u09be\u09b0\u09c7\u09a8\u09cd\u099f\u09bf \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0 \u09ac\u09bf\u09a1\u09bf');
  check('BN digits appear in stats', /[\u09e6-\u09ef]/.test(await evalJs(`document.getElementById('stat-total').textContent`)));
  check('example name gets BN prefix', (await evalJs(`[...document.querySelectorAll('.entry-card')].find(c => c.querySelector('.badge.example')).querySelector('h3').textContent`)).includes('\u0989\u09a6\u09be\u09b9\u09b0\u09a3: '));
  await evalJs(`document.getElementById('lang-toggle').click()`);
  await sleep(200);
  check('toggle back to English', (await evalJs(`document.getElementById('app-title').textContent`)) === 'Warranty Tracker BD');

  // --- export button exists; bad import rejected; erase flow ---
  check('export button exists', (await evalJs(`document.getElementById('export-btn') !== null`)));
  await evalJs(`(function(){ document.getElementById('import-text').value='{"app":"nope"}'; document.getElementById('import-btn').click(); })()`);
  await sleep(200);
  check('bad import rejected', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('not valid'));
  check('error banner shown on bad import', (await evalJs(`!document.getElementById('error-banner').classList.contains('hidden')`)));
  check('bad import keeps 1 entry', (await evalJs(`JSON.parse(localStorage.getItem('wtbd-v1')).entries.length`)) === 1);
  await evalJs(`(function(){ document.getElementById('erase-input').value='delete'; document.getElementById('erase-btn').click(); })()`);
  await sleep(150);
  check('erase requires exact DELETE', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('DELETE'));
  await evalJs(`(function(){ document.getElementById('erase-input').value='DELETE'; document.getElementById('erase-btn').click(); })()`);
  await sleep(200);
  check('erase confirms', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('erased'));
  check('erase wipes entries', (await evalJs(`JSON.parse(localStorage.getItem('wtbd-v1')).entries.length`)) === 0);

  // --- reload persistence: empty state after erase ---
  await sendS('Page.navigate', { url: fileUrl });
  await sleep(1000);
  check('empty state shows after erase + reload', (await evalJs(`document.querySelector('.entries-list .empty') !== null`)));
  check('no horizontal overflow (empty state)', (await evalJs('document.documentElement.scrollWidth')) <= WIDTH + 1);

  // --- error / network hygiene ---
  check('zero console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('zero page exceptions', pageErrors.length === 0, pageErrors.join(' | '));
  check('zero non-file network requests', extRequests.length === 0, extRequests.join(', '));

  console.log(`\n${checks - failures.length}/${checks} checks passed${failures.length ? ', FAILURES:\n- ' + failures.join('\n- ') : ''}`);

  browserWs.close();
  chrome.kill();
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error('SMOKE CRASH:', e); chrome.kill(); process.exit(1); });
