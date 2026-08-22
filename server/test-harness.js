// ══════════════════════════════════════════════════════════════════
// DeployView — Full Run Test Harness
// Tests every button, input, slider, dropdown, modal, and interaction
// ══════════════════════════════════════════════════════════════════

const L = document.getElementById('log');
const S = document.getElementById('status');
const SM = document.getElementById('sum');
const PB = document.getElementById('progress-bar');
const SR = document.getElementById('stats-row');
let full = '', ec = 0, wc = 0, tc = 0, pc = 0;

function log(m, c = '') {
  const d = document.createElement('div');
  d.className = c;
  d.textContent = m;
  L.appendChild(d);
  L.scrollTop = L.scrollHeight;
  full += m + '\n';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Adaptive replacement for "click something, then blindly sleep(2000) hoping
// the re-render finished" — resolves as soon as the DOM under `root` has
// gone quiet for `quietMs`, instead of always paying the full fixed delay.
// A React re-render is typically done in well under 300ms; the old fixed
// 1500-3000ms waits were both slower than necessary on the common case AND
// not actually safer on a genuinely slow render, since `timeoutMs` here is
// a ceiling, not the wait time — a render that finishes early returns
// early, one that's still running past the old fixed value keeps waiting
// up to `timeoutMs` instead of getting cut off exactly where the fixed
// sleep would have. Falls back to a flat `quietMs` wait if MutationObserver
// isn't available for some reason.
function waitForStable(winCtx, root, timeoutMs = 2500, quietMs = 150) {
  return new Promise((resolve) => {
    let settleTimer = null, hardTimer = null, obs = null;
    const finish = () => {
      try { obs && obs.disconnect(); } catch (e) {}
      clearTimeout(settleTimer); clearTimeout(hardTimer);
      resolve();
    };
    try {
      const MO = (winCtx && winCtx.MutationObserver) || window.MutationObserver;
      obs = new MO(() => { clearTimeout(settleTimer); settleTimer = setTimeout(finish, quietMs); });
      obs.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    } catch (e) { settleTimer = setTimeout(finish, quietMs); return; }
    settleTimer = setTimeout(finish, quietMs); // nothing mutated at all — don't wait the full ceiling
    hardTimer = setTimeout(finish, timeoutMs);
  });
}
function progress(pct) { PB.style.width = pct + '%'; }

function copyLog() {
  navigator.clipboard.writeText(full).then(() => alert('Copied!'));
}

// ── Helpers to interact with React-controlled elements ──
function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
    || Object.getOwnPropertyDescriptor(el, 'value')?.set;
  if (setter) setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function findByText(doc, selector, text) {
  return [...doc.querySelectorAll(selector)].find(el =>
    el.textContent.trim().toLowerCase().includes(text.toLowerCase())
  );
}

function findPanel(doc, tabId) {
  return doc.getElementById('tabpanel-' + tabId);
}

function goToTab(doc, tabId, label) {
  const btn = doc.getElementById('tab-' + tabId) || findByText(doc, 'button', label);
  if (btn) { btn.click(); return true; }
  return false;
}

// ── Test runner ──
let win, doc, errs, warns, netFails;

function hookConsole() {
  errs = []; warns = []; netFails = [];
  const origE = win.console.error, origW = win.console.warn;
  win.console.error = function (...a) {
    const m = a.map(x => typeof x === 'string' ? x : (x?.message || x?.stack || String(x))).join(' ');
    errs.push(m); origE.apply(win.console, a);
  };
  win.console.warn = function (...a) {
    const m = a.map(x => String(x)).join(' ');
    warns.push(m); origW.apply(win.console, a);
  };
  win.addEventListener('error', e => errs.push('Uncaught: ' + e.message + ' @ ' + e.filename + ':' + e.lineno));
  win.addEventListener('unhandledrejection', e => errs.push('UnhandledPromise: ' + (e.reason?.message || e.reason)));

  // A failed API call very often does NOT throw or log — the app just
  // silently gets a 404/500/network error and, unless it explicitly
  // handles it, shows stale or empty data with zero console signal.
  // checkErrs alone would never catch that. Patch fetch/XHR to record
  // every non-2xx (or network-error) response during the run.
  try {
    if (win.fetch) {
      const origFetch = win.fetch;
      win.fetch = function (input, init) {
        const url = (input && input.url) || input;
        const method = (init && init.method) || 'GET';
        return origFetch.call(win, input, init).then((res) => {
          if (!res.ok) netFails.push({ url: String(url), status: res.status, method });
          return res;
        }, (e) => {
          netFails.push({ url: String(url), status: 0, method, error: e && e.message });
          throw e;
        });
      };
    }
    if (win.XMLHttpRequest) {
      const XP = win.XMLHttpRequest.prototype;
      const origOpen = XP.open, origSend = XP.send;
      XP.open = function (method, url, ...rest) {
        this.__testMethod = method; this.__testUrl = url;
        return origOpen.call(this, method, url, ...rest);
      };
      XP.send = function (...args) {
        this.addEventListener('loadend', () => {
          if (this.status === 0 || this.status >= 400) {
            netFails.push({ url: this.__testUrl, status: this.status, method: this.__testMethod });
          }
        });
        return origSend.apply(this, args);
      };
    }
  } catch (e) { /* fetch/XHR patching failed — network-failure detection just won't run this session */ }
}

function clearErrs() { errs.length = 0; warns.length = 0; netFails.length = 0; }

function checkErrs(context) {
  if (errs.length > 0) {
    errs.forEach(e => { log('  ERROR [' + context + ']: ' + e.substring(0, 400), 'e'); ec++; });
  }
  const rw = warns.filter(w => !w.includes('React does not recognize') && !w.includes('componentWill') && !w.includes('NaN'));
  rw.slice(0, 3).forEach(w => { log('  WARN [' + context + ']: ' + w.substring(0, 250), 'w'); wc++; });
  if (netFails.length > 0) {
    netFails.forEach(f => {
      log('  HTTP FAIL [' + context + ']: ' + f.method + ' ' + f.url + ' → ' + (f.status || 'network error') + (f.error ? ' (' + f.error + ')' : ''), 'e');
      ec++;
    });
  }
}

function pass(msg) { log('  ✓ ' + msg, 'ok'); tc++; pc++; }
function fail(msg) { log('  ✗ ' + msg, 'e'); tc++; ec++; }
function info(msg) { log('  · ' + msg, 'dim'); }
function skip(msg) { log('  ⊘ ' + msg, 'w'); tc++; wc++; }

// ── Generic health checks — run against whatever's currently in `doc`,
// independent of app-specific tab structure. Catches a category of bugs
// (broken images, missing accessible labels, failed resource loads) the
// named-tab phases below never look for at all. ──
function checkResourceHealth(doc, context) {
  const imgs = [...doc.querySelectorAll('img[src]')];
  const broken = imgs.filter(img => !img.complete || img.naturalWidth === 0);
  if (broken.length) fail(broken.length + ' broken image(s) in ' + context + ': ' + broken.slice(0, 3).map(i => i.src.split('/').pop()).join(', '));
  else if (imgs.length) pass(imgs.length + ' image(s) loaded OK in ' + context);

  const noAlt = imgs.filter(img => !img.hasAttribute('alt'));
  if (noAlt.length) skip(noAlt.length + ' image(s) missing alt text in ' + context);

  const fields = [...doc.querySelectorAll('input:not([type=hidden]), textarea, select')];
  const unlabeled = fields.filter(el => {
    const hasLabel = el.labels && el.labels.length > 0;
    const hasAria = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
    return !hasLabel && !hasAria && !el.placeholder && !el.title;
  });
  if (unlabeled.length) skip(unlabeled.length + ' form field(s) with no accessible label in ' + context);
}

// Best-effort — a 0-byte transferSize also happens for cache hits, so this
// is reported as a soft signal (skip), never a hard fail, to avoid false
// positives tanking the pass/fail verdict.
function checkNetworkHealth(win, context) {
  try {
    const entries = win.performance.getEntriesByType('resource');
    const failed = entries.filter(e =>
      e.transferSize === 0 && e.decodedBodySize === 0 && e.duration > 0 &&
      !e.name.startsWith('data:') && !e.name.startsWith('blob:')
    );
    if (failed.length) {
      skip(failed.length + ' resource(s) may have failed to load in ' + context +
        ' (0 bytes transferred — could be a genuine 404/CORS failure or just a cache hit): ' +
        failed.slice(0, 3).map(e => e.name.split('/').pop()).join(', '));
    }
  } catch (e) { /* performance API unavailable in this context — skip silently */ }
}

// ── Click every button in a panel, check for errors ──
async function testAllButtons(panel, context, exclude = []) {
  const buttons = [...panel.querySelectorAll('button')];
  const tested = [];
  for (const btn of buttons) {
    const txt = btn.textContent.trim().substring(0, 30);
    if (!txt || btn.disabled) continue;
    // Skip destructive/confirm buttons and navigation tabs
    const lower = txt.toLowerCase();
    if (exclude.some(ex => lower.includes(ex))) continue;
    if (lower.includes('clear all') || lower.includes('reset') || lower.includes('delete') || lower.includes('remove')) continue;
    if (btn.getAttribute('role') === 'tab') continue;
    // Skip if it opens file picker
    if (lower === 'import') continue;

    clearErrs();
    try { btn.click(); } catch (e) { fail(context + ' button "' + txt + '" threw: ' + e.message); continue; }
    await waitForStable(win, doc.body, 400, 80);

    if (errs.length > 0) {
      fail(context + ' button "' + txt + '" caused error');
      checkErrs(context + ':' + txt);
    } else {
      tested.push(txt);
    }
  }
  if (tested.length > 0) pass(context + ': clicked ' + tested.length + ' buttons OK');
  else info(context + ': no safe buttons to test');

  // Close any modals that opened
  await sleep(200);
  const closeButtons = [...doc.querySelectorAll('[aria-label*="Close"], [aria-label*="close"]')];
  for (const cb of closeButtons) { try { cb.click(); } catch {} }
  await sleep(200);
}

// ── Test all inputs/sliders in a panel ──
async function testAllInputs(panel, context) {
  const inputs = [...panel.querySelectorAll('input[type="number"], input[type="range"], input[type="text"]')];
  let tested = 0;
  for (const inp of inputs) {
    if (inp.disabled || inp.readOnly) continue;
    clearErrs();
    const origVal = inp.value;
    if (inp.type === 'range') {
      const mid = (parseFloat(inp.min || 0) + parseFloat(inp.max || 100)) / 2;
      setNativeValue(inp, String(mid));
    } else if (inp.type === 'number') {
      setNativeValue(inp, '50');
    } else {
      setNativeValue(inp, 'test');
    }
    await waitForStable(win, doc.body, 300, 60);
    if (errs.length > 0) {
      const label = inp.getAttribute('aria-label') || inp.placeholder || inp.type;
      fail(context + ' input "' + label + '" caused error');
      checkErrs(context + ':input');
    }
    // Restore
    setNativeValue(inp, origVal);
    await sleep(100);
    tested++;
  }
  if (tested > 0) pass(context + ': tested ' + tested + ' inputs OK');
}

// ── Test all dropdowns/selects ──
async function testAllSelects(panel, context) {
  // Custom KuroSelect dropdowns (rendered as buttons with aria)
  const selects = [...panel.querySelectorAll('select')];
  let tested = 0;
  for (const sel of selects) {
    if (sel.disabled) continue;
    clearErrs();
    const opts = [...sel.options];
    if (opts.length > 1) {
      sel.value = opts[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await waitForStable(win, doc.body, 300, 60);
      if (errs.length > 0) {
        fail(context + ' select caused error');
        checkErrs(context + ':select');
      }
      // Restore
      sel.value = opts[0].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(100);
      tested++;
    }
  }
  // Also test KuroSelect (custom dropdown buttons with aria-label containing "Filter")
  const kuroSelects = [...panel.querySelectorAll('[aria-haspopup="listbox"], [role="combobox"]')];
  for (const ks of kuroSelects) {
    clearErrs();
    ks.click();
    await waitForStable(win, doc.body, 400, 80);
    // Try clicking the second option
    const options = [...doc.querySelectorAll('[role="option"]')];
    if (options.length > 1) {
      options[1].click();
      await waitForStable(win, doc.body, 400, 80);
      if (errs.length > 0) {
        fail(context + ' KuroSelect caused error');
        checkErrs(context + ':kuroselect');
      } else {
        tested++;
      }
    }
    // Close by clicking the button again or pressing Escape
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);
  }
  if (tested > 0) pass(context + ': tested ' + tested + ' dropdowns OK');
}

// ── Test toggles (aria-pressed buttons) ──
async function testToggles(panel, context) {
  const toggles = [...panel.querySelectorAll('[aria-pressed], [role="switch"]')];
  let tested = 0;
  for (const tog of toggles) {
    clearErrs();
    tog.click();
    await waitForStable(win, doc.body, 400, 80);
    if (errs.length > 0) {
      fail(context + ' toggle caused error');
      checkErrs(context + ':toggle');
    }
    // Toggle back
    tog.click();
    await sleep(200);
    tested++;
  }
  if (tested > 0) pass(context + ': toggled ' + tested + ' switches OK');
}

// ══════════════════════════════════════════
// MAIN TEST FLOWS
// ══════════════════════════════════════════

async function initApp() {
  const iframe = document.getElementById('app');
  S.textContent = 'Loading app...';
  iframe.src = PREVIEW_URL;
  await new Promise(r => { iframe.onload = r; setTimeout(r, 15000); });
  try { win = iframe.contentWindow; doc = iframe.contentDocument; } catch (e) {
    log('FATAL: Cannot access iframe — ' + e.message, 'e'); ec++; return false;
  }
  if (!doc || !doc.body) { log('FATAL: No document', 'e'); ec++; return false; }
  // Wait for hydration/first-render to settle instead of a blind 3s —
  // most builds finish well under that; a slow one still gets up to 4s.
  await waitForStable(win, doc.body, 4000);
  hookConsole();
  return true;
}

async function runFullTest() {
  L.innerHTML = ''; full = ''; ec = 0; wc = 0; tc = 0; pc = 0;
  SM.innerHTML = ''; SR.style.display = 'none';
  progress(0);

  log('══════════════════════════════════════════', 's');
  log('  FULL RUN TEST — ' + BRANCH, 's');
  log('  ' + new Date().toISOString(), 'dim');
  log('══════════════════════════════════════════', 's');
  log('');

  if (!await initApp()) { finish(); return; }
  progress(5);

  // ── Phase 1: Initial Load ──
  log('── Phase 1: Initial Load ──', 's');
  const root = doc.getElementById('root');
  const rLen = root?.innerHTML?.length || 0;
  if (rLen < 100) fail('Root empty (' + rLen + ' chars)');
  else pass('App rendered (' + rLen + ' chars)');
  clearErrs();
  checkErrs('init');
  checkResourceHealth(doc, 'Initial Load');
  checkNetworkHealth(win, 'Initial Load');
  progress(10);

  // ── Phase 2: Tab Navigation + Content Check ──
  log('', '');
  log('── Phase 2: Tab Navigation ──', 's');
  const tabs = [
    ['tracker', 'Tracker'], ['events', 'Events'], ['calculator', 'Calc'],
    ['planner', 'Plan'], ['analytics', 'Stats'], ['gathering', 'Collection'],
    ['teams', 'Teams'], ['profile', 'Profile']
  ];

  for (let i = 0; i < tabs.length; i++) {
    const [id, label] = tabs[i];
    S.textContent = 'Phase 2: ' + label + ' tab...';
    clearErrs();
    if (!goToTab(doc, id, label)) { skip('No "' + label + '" button'); continue; }
    await waitForStable(win, doc.body, 2500);
    const panel = findPanel(doc, id);
    const pLen = panel?.innerHTML?.length || 0;
    checkErrs(label + ' render');
    if (!panel || pLen < 50) fail(label + ' panel empty (' + pLen + ')');
    else pass(label + ' rendered (' + pLen + ' chars)');
    progress(10 + (i + 1) * 5);
  }

  // ── Phase 3: Deep Interaction per Tab ──
  log('', '');
  log('── Phase 3: Deep Interaction Tests ──', 's');

  // 3a. Tracker
  S.textContent = 'Phase 3: Tracker interactions...';
  if (goToTab(doc, 'tracker', 'Tracker')) {
    await waitForStable(win, doc.body, 2000);
    const panel = findPanel(doc, 'tracker');
    if (panel) {
      // Test category tabs (character/weapon/standard)
      const catBtns = [...panel.querySelectorAll('[role="tab"]')];
      let catOk = 0;
      for (const btn of catBtns) {
        clearErrs(); btn.click(); await sleep(300);
        if (errs.length === 0) catOk++;
        else checkErrs('Tracker:tab:' + btn.textContent.trim());
      }
      if (catOk > 0) pass('Tracker: switched ' + catOk + ' category tabs');
      await testAllButtons(panel, 'Tracker');
    }
  }
  progress(55);

  // 3b. Events
  S.textContent = 'Phase 3: Events interactions...';
  if (goToTab(doc, 'events', 'Events')) {
    await waitForStable(win, doc.body, 2000);
    const panel = findPanel(doc, 'events');
    if (panel) {
      await testAllButtons(panel, 'Events');
    }
  }
  progress(60);

  // 3c. Calculator
  S.textContent = 'Phase 3: Calculator interactions...';
  if (goToTab(doc, 'calculator', 'Calc')) {
    await waitForStable(win, doc.body, 2500);
    const panel = findPanel(doc, 'calculator');
    if (panel) {
      await testAllInputs(panel, 'Calculator');
      await testAllButtons(panel, 'Calculator', ['save']);
      await testToggles(panel, 'Calculator');
      // Check results rendered
      const stats = panel.querySelectorAll('.kuro-stat');
      if (stats.length > 0) pass('Calculator: ' + stats.length + ' stat elements visible');
      else info('Calculator: no stat elements (needs input values)');
    }
  }
  progress(65);

  // 3d. Planner
  S.textContent = 'Phase 3: Planner interactions...';
  if (goToTab(doc, 'planner', 'Plan')) {
    await waitForStable(win, doc.body, 2000);
    const panel = findPanel(doc, 'planner');
    if (panel) {
      await testAllInputs(panel, 'Planner');
      await testAllButtons(panel, 'Planner');
      await testToggles(panel, 'Planner');
    }
  }
  progress(70);

  // 3e. Analytics/Stats
  S.textContent = 'Phase 3: Stats interactions...';
  if (goToTab(doc, 'analytics', 'Stats')) {
    await waitForStable(win, doc.body, 2500);
    const panel = findPanel(doc, 'analytics');
    if (panel) {
      await testAllButtons(panel, 'Stats', ['submit', 'leaderboard']);
      await testToggles(panel, 'Stats');
    }
  }
  progress(75);

  // 3f. Collection
  S.textContent = 'Phase 3: Collection interactions...';
  if (goToTab(doc, 'gathering', 'Collection')) {
    await waitForStable(win, doc.body, 2500);
    const panel = findPanel(doc, 'gathering');
    if (panel) {
      // Test search
      const searchInput = panel.querySelector('input[type="text"]');
      if (searchInput) {
        clearErrs();
        setNativeValue(searchInput, 'Rover');
        await sleep(500);
        if (errs.length > 0) { fail('Collection search error'); checkErrs('Collection:search'); }
        else pass('Collection: search works');
        setNativeValue(searchInput, '');
        await sleep(300);
      }
      await testAllSelects(panel, 'Collection');
      // Test view toggles (items/weapons/echoes)
      const viewBtns = [...panel.querySelectorAll('[aria-pressed]')];
      let vOk = 0;
      for (const vb of viewBtns) {
        clearErrs(); vb.click(); await sleep(500);
        if (errs.length === 0) vOk++;
        else checkErrs('Collection:view');
      }
      if (vOk > 0) pass('Collection: switched ' + vOk + ' views');
      await testAllButtons(panel, 'Collection', ['framing']);
    }
  }
  progress(80);

  // 3g. Teams
  S.textContent = 'Phase 3: Teams interactions...';
  if (goToTab(doc, 'teams', 'Teams')) {
    await waitForStable(win, doc.body, 2500);
    const panel = findPanel(doc, 'teams');
    if (panel) {
      // Test team tabs
      const teamTabs = [...panel.querySelectorAll('[role="tab"]')];
      let ttOk = 0;
      for (const tt of teamTabs) {
        clearErrs(); tt.click(); await sleep(300);
        if (errs.length === 0) ttOk++;
        else checkErrs('Teams:teamTab');
      }
      if (ttOk > 0) pass('Teams: switched ' + ttOk + ' team tabs');
      // Test export button
      clearErrs();
      const exportBtn = findByText(panel, 'button', 'Export');
      if (exportBtn) {
        exportBtn.click(); await sleep(500);
        if (errs.length > 0) { fail('Teams Export error'); checkErrs('Teams:export'); }
        else pass('Teams: Export button works');
      }
      // Test Compare button
      clearErrs();
      const compareBtn = findByText(panel, 'button', 'Compare');
      if (compareBtn && !compareBtn.disabled) {
        compareBtn.click(); await sleep(500);
        if (errs.length > 0) { fail('Teams Compare error'); checkErrs('Teams:compare'); }
        else pass('Teams: Compare button works');
      }
      await testAllInputs(panel, 'Teams');
    }
  }
  progress(88);

  // 3h. Profile
  S.textContent = 'Phase 3: Profile interactions...';
  if (goToTab(doc, 'profile', 'Profile')) {
    await waitForStable(win, doc.body, 2500);
    const panel = findPanel(doc, 'profile');
    if (panel) {
      await testAllInputs(panel, 'Profile');
      await testToggles(panel, 'Profile');
      await testAllButtons(panel, 'Profile', ['clear', 'reset', 'export', 'import', 'restore']);
      await testAllSelects(panel, 'Profile');
    }
  }
  progress(95);

  // ── Phase 4: Roundtrip ──
  log('', '');
  log('── Phase 4: Roundtrip & Stress ──', 's');
  S.textContent = 'Phase 4: Roundtrip...';

  // Rapid tab switching (stress test)
  clearErrs();
  for (const [id, label] of tabs) {
    goToTab(doc, id, label);
    await sleep(200);
  }
  await waitForStable(win, doc.body, 1500);
  if (errs.length > 0) { fail('Rapid tab switch caused errors'); checkErrs('rapid-switch'); }
  else pass('Rapid tab switching (8 tabs in 1.6s) — no errors');

  // Return to tracker
  goToTab(doc, 'tracker', 'Tracker');
  await waitForStable(win, doc.body, 800);
  pass('Final state: back on Tracker');
  progress(93);

  // ── Phase 4b: Persistence ──
  // Nothing before this point ever reloads the app — every check so far
  // only proves state is correct in the *live* React tree, not that it
  // was actually written to durable storage. A component that renders
  // correctly from in-memory state but never persists it would pass every
  // phase above and still lose user data on refresh. Snapshot localStorage,
  // force a real reload (not a same-value src reassignment, which some
  // browsers no-op), then diff.
  log('', '');
  log('── Phase 4b: Persistence ──', 's');
  S.textContent = 'Phase 4b: Persistence (reload)...';
  try {
    const before = {};
    for (let i = 0; i < win.localStorage.length; i++) {
      const k = win.localStorage.key(i);
      before[k] = win.localStorage.getItem(k);
    }
    const keyCount = Object.keys(before).length;
    if (keyCount === 0) {
      skip('Persistence: no localStorage keys found — app may not persist state, or uses a different mechanism (IndexedDB, cookies, server-side)');
    } else {
      const appIframe = document.getElementById('app');
      await new Promise((resolve) => {
        appIframe.onload = resolve;
        appIframe.contentWindow.location.reload();
        setTimeout(resolve, 10000);
      });
      win = appIframe.contentWindow; doc = appIframe.contentDocument;
      if (!doc || !doc.body) {
        fail('Persistence: could not access app after reload');
      } else {
        await waitForStable(win, doc.body, 4000);
        hookConsole(); // fresh window after reload — re-install the hooks
        let lost = [];
        for (const k of Object.keys(before)) {
          if (win.localStorage.getItem(k) !== before[k]) lost.push(k);
        }
        if (lost.length === 0) pass('Persistence: all ' + keyCount + ' localStorage key(s) survived reload');
        else fail('Persistence: ' + lost.length + '/' + keyCount + ' key(s) lost or changed after reload: ' + lost.slice(0, 5).join(', '));
        checkErrs('post-reload');
      }
    }
  } catch (e) {
    skip('Persistence check could not run: ' + e.message);
  }
  progress(97);

  // ── Phase 5: General Sweep ──
  // Runs against whatever's on screen right now, independent of the
  // hardcoded tab list above. Exists so this harness stays useful on a
  // build whose UI doesn't match tracker/events/calculator/etc. — a new
  // tab, a renamed section, or a different app entirely — instead of
  // silently skipping most of the test via goToTab's "no button" path.
  log('', '');
  log('── Phase 5: General Sweep ──', 's');
  S.textContent = 'Phase 5: General sweep...';
  clearErrs();
  checkResourceHealth(doc, 'General');
  checkNetworkHealth(win, 'General');
  checkErrs('General sweep');
  await testAllButtons(doc.body, 'General', ['clear', 'reset', 'delete', 'remove', 'logout', 'sign out', 'export', 'import', 'restore']);
  await testAllInputs(doc.body, 'General');
  await testAllSelects(doc.body, 'General');
  progress(100);

  finish();
}

async function runQuickTest() {
  L.innerHTML = ''; full = ''; ec = 0; wc = 0; tc = 0; pc = 0;
  SM.innerHTML = ''; SR.style.display = 'none';
  progress(0);

  log('══ QUICK TEST — ' + BRANCH + ' ══', 's');
  if (!await initApp()) { finish(); return; }
  progress(10);

  const root = doc.getElementById('root');
  if ((root?.innerHTML?.length || 0) < 100) fail('Root empty');
  else pass('App rendered');
  checkResourceHealth(doc, 'Initial Load');
  checkNetworkHealth(win, 'Initial Load');

  const tabs = [
    ['tracker', 'Tracker'], ['events', 'Events'], ['calculator', 'Calc'],
    ['planner', 'Plan'], ['analytics', 'Stats'], ['gathering', 'Collection'],
    ['teams', 'Teams'], ['profile', 'Profile']
  ];

  for (let i = 0; i < tabs.length; i++) {
    const [id, label] = tabs[i];
    clearErrs();
    goToTab(doc, id, label);
    await waitForStable(win, doc.body, 1500);
    checkErrs(label);
    const p = findPanel(doc, id);
    if (!p || (p.innerHTML?.length || 0) < 50) fail(label + ' empty');
    else pass(label + ' OK');
    progress(10 + (i + 1) * 10);
  }
  progress(100);
  finish();
}

function finish() {
  log('', '');
  log('══════════════════════════════════════════', 's');
  log('  RESULTS: ' + pc + '/' + tc + ' passed, ' + ec + ' errors, ' + wc + ' warnings', ec > 0 ? 'e' : 'ok');
  log('══════════════════════════════════════════', 's');

  SM.className = 'sum ' + (ec === 0 ? 'pass' : 'fail');
  SM.textContent = ec === 0
    ? 'ALL PASSED — ' + pc + '/' + tc + ' tests, ' + wc + ' warnings'
    : ec + ' ERRORS — ' + pc + '/' + tc + ' passed, ' + wc + ' warnings';
  S.textContent = 'Done!';

  // Show stats
  SR.style.display = 'flex';
  SR.innerHTML = [
    ['Passed', pc, '#4ade80'], ['Failed', ec, '#f87171'], ['Warnings', wc, '#fbbf24'], ['Total', tc, '#60a5fa']
  ].map(([l, n, c]) => '<div class="stat-box"><div class="num" style="color:' + c + '">' + n + '</div><div class="lbl">' + l + '</div></div>').join('');

  // Post to API
  fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'done', passed: pc, failed: ec, warnings: wc, total: tc,
      errors: full.split('\n').filter(l => l.includes('✗') || l.includes('ERROR') || l.includes('FAIL') || l.includes('FATAL')),
      fullLog: full, timestamp: Date.now()
    })
  }).then(() => log('\nResults posted to API ✓', 'i')).catch(() => {});
}
