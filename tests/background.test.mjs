import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const callsign = await readFile(new URL('../callsign.js', import.meta.url), 'utf8');
const SOURCE = { id: 1, windowId: 2, incognito: false };
let serial = 0;
let clock = 0;
globalThis.testClock = () => clock += 1000;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

async function setup({
  statuses = ['unsigned', 'submitted', 'already-signed'],
  sourceOverrides = {}, sourceMissing = false, createError = null, updateError = null,
  createdOverrides = {}, feedbackError = false, reloadError = null, hook = null, getHook = null, bioStatus = 'bio'
} = {}) {
  const actions = [], menus = [];
  let installed, clicked, nextId = 10;
  const sourceTab = { ...SOURCE, active: true, status: 'complete', url: 'https://forums.qrz.com/index.php?account/alerts', ...sourceOverrides };
  const elsewhere = { id: 42, windowId: 9, incognito: false, active: false, status: 'complete', url: 'https://www.qrz.com/db/KE9ZZ' };
  const logbook = { id: 50, windowId: 9, incognito: false, active: false, status: 'complete', url: 'https://logbook.qrz.com/logbook' };
  const tabs = new Map([[elsewhere.id, elsewhere], [logbook.id, logbook]]);
  if (!sourceMissing) tabs.set(SOURCE.id, sourceTab);
  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener(fn) { installed = fn; } },
      onStartup: { addListener() {} },
      getURL: path => `chrome-extension://test/${path}`
    },
    contextMenus: {
      removeAll(fn) { fn(); }, create(item) { menus.push(item); },
      onClicked: { addListener(fn) { clicked = fn; } }
    },
    tabs: {
      query: async query => {
        actions.push(['query', query]);
        return Array.isArray(query.url) ? [logbook] : [elsewhere];
      },
      create: async options => {
        actions.push(['create', options]);
        if (createError) throw createError;
        const tab = { id: nextId++, windowId: options.windowId ?? 9, incognito: sourceTab.incognito,
          active: true, status: 'complete', ...options, ...createdOverrides };
        tabs.set(tab.id, tab);
        return { ...tab };
      },
      update: async (id, options) => {
        actions.push(['update', id, options]);
        if (updateError) throw updateError;
        if (!tabs.has(id)) throw new Error('No tab with id');
        const updated = { ...tabs.get(id), ...options };
        tabs.set(id, updated);
        return { ...updated };
      },
      get: async id => {
        actions.push(['get', id]);
        if (getHook) getHook(id, tabs);
        if (!tabs.has(id)) throw new Error('No tab with id');
        return { ...tabs.get(id) };
      },
      reload: async id => {
        actions.push(['reload', id]);
        if (reloadError) throw reloadError;
      },
      remove: async id => { actions.push(['remove', id]); tabs.delete(id); }
    },
    windows: {
      get: async id => { actions.push(['windowGet', id]); return { id, state: 'minimized' }; },
      update: async (...args) => { actions.push(['window', ...args]); }
    },
    scripting: {
      executeScript: async ({ target, func, args, injectImmediately }) => {
        actions.push([func.name, ...args, { targetTabId: target.tabId, injectImmediately }]);
        if (hook) await hook({ target, func, args, tabs, actions });
        if (func.name === 'showWebLogFeedback' && feedbackError) throw new Error('Page cannot receive feedback');
        if (func.name === 'webLogPage') {
          const status = args[1] === 'bio' ? bioStatus : statuses.shift() ?? 'ambiguous';
          if (status instanceof Error) throw status;
          return [{ result: typeof status === 'object' ? status : { status, account: 'KF6UFO' } }];
        }
        return [{ result: { ok: true } }];
      }
    }
  };
  const stubs = 'function webLogPage(){} function showWebLogFeedback(){} function searchLogbookPage(){}';
  const script = stubs + callsign.replace('export function', 'function')
    + source.replace(/^import .*;\n/gm, '')
      .replace(/const sleep = .*;/, 'const sleep = async () => {};')
      .replaceAll('Date.now()', 'testClock()') + `\n// test module ${serial++}`;
  const module = await import('data:text/javascript;base64,' + Buffer.from(script).toString('base64'));
  return { module, actions, menus, tabs, installed: () => installed(), clicked: (...args) => clicked(...args) };
}
const of = (s, type) => s.actions.filter(action => action[0] === type);
const runs = (s, mode) => of(s, 'webLogPage').filter(action => action[2] === mode);
function assertSigningConfined(s) {
  assert.equal(of(s, 'query').length, 0, 'signing must not search other windows');
  assert.equal(of(s, 'window').length, 0, 'signing must not focus or restore windows');
  assert.equal(of(s, 'create').length, 1, 'one invocation creates at most one working tab');
  assert.deepEqual(of(s, 'create')[0][1], {
    url: 'https://www.qrz.com/db/KE9ZZ', active: false, windowId: 2, openerTabId: 1
  });
  for (const action of of(s, 'webLogPage')) {
    assert.equal(action.at(-1).targetTabId, 10);
    assert.equal(action.at(-1).injectImmediately, true, 'QRZ inspection must not wait for ads to finish loading');
  }
  assert.equal(of(s, 'reload').length, 0, 'the new work tab must not be reloaded during signing');
  for (const action of of(s, 'update')) assert.equal(action[1], 10);
  assert.equal(s.tabs.get(1).url, 'https://forums.qrz.com/index.php?account/alerts');
  assert.equal(s.tabs.get(42).url, 'https://www.qrz.com/db/KE9ZZ');
  assert.equal(s.tabs.get(42).active, false);
}

test('menu offers Sign Their Web Log for selected text and station links with minimal permissions', async () => {
  const s = await setup(); s.installed();
  assert.equal(of(s, 'create').length, 0, 'installing/updating registers menus without opening tabs');
  assert.deepEqual(s.menus.map(menu => menu.title), ['QRZ', 'Look Up Their Callsign', 'Search My Logbook', 'Sign Their Web Log']);
  for (const id of ['qrz', 'qrzWebLog']) {
    assert.ok(s.menus.find(menu => menu.id === id).contexts.includes('selection'));
    assert.ok(s.menus.find(menu => menu.id === id).contexts.includes('link'));
  }
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['contextMenus', 'scripting']);
  assert.deepEqual(manifest.host_permissions, ['https://logbook.qrz.com/*', 'https://www.qrz.com/*']);
});

test('successful signature checks fresh state, clicks once, and shows bio in the source window', async () => {
  const s = await setup();
  assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, 'success');
  assertSigningConfined(s);
  assert.equal(of(s, 'reload').length, 0);
  assert.equal(runs(s, 'sign').length, 1);
  assert.equal(runs(s, 'bio').length, 1);
  assert.equal(runs(s, 'bio')[0][3], 'KF6UFO');
  assert.deepEqual(of(s, 'update').map(action => action.slice(1)), [[10, { active: true }]]);
  assert.ok(s.actions.indexOf(runs(s, 'bio')[0]) < s.actions.indexOf(of(s, 'update')[0]));
  assert.equal(of(s, 'remove').length, 0);
});

test('fresh unsigned flow succeeds without the reload that could interrupt validation', async () => {
  const s = await setup({ reloadError: new Error('Frame navigation interrupted validation') });
  assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, 'success');
  assertSigningConfined(s);
  assert.equal(runs(s, 'sign').length, 1);
  assert.equal(runs(s, 'prepare').length, 2, 'one initial check and one post-submit confirmation');
  assert.equal(runs(s, 'bio').length, 1);
});

for (const statuses of [['already-signed'], ['unsigned', 'already-signed']]) {
  test(`already signed at check ${statuses.length}: keeps the Web tab open and shows its informational message`, async () => {
    const s = await setup({ statuses: [...statuses] });
    const result = await s.module.signWebLog('KE9ZZ', SOURCE);
    assert.equal(result.status, 'already-signed');
    assertSigningConfined(s);
    assert.equal(of(s, 'remove').length, 0);
    assert.equal(s.tabs.get(10).active, true, 'the station tab remains open and visible');
    assert.deepEqual(of(s, 'update').map(action => action.slice(1)), [[10, { active: true }]]);
    assert.equal(of(s, 'showWebLogFeedback').length, 1);
    assert.equal(of(s, 'showWebLogFeedback')[0][2], result.message);
    assert.match(result.message, /already signed.*Web Log/i);
    for (const id of [1, 42, 50]) assert.ok(s.tabs.has(id), `preexisting tab ${id} remains open`);
    assert.equal(runs(s, 'bio').length, 0);
    assert.equal(runs(s, 'sign').length, statuses.length === 2 ? 1 : 0,
      'a signature found during the final recheck returns without a submit');
  });
}

test('activation failure preserves the verified already-signed outcome without rechecking', async () => {
  const s = await setup({ statuses: ['already-signed'], updateError: new Error('Tabs cannot be edited right now') });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'already-signed');
  assert.match(result.message, /already signed.*Web Log/i);
  assertSigningConfined(s);
  assert.equal(runs(s, 'prepare').length, 1);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(runs(s, 'bio').length, 0);
  assert.equal(of(s, 'showWebLogFeedback').length, 1);
  assert.equal(of(s, 'showWebLogFeedback')[0][2], result.message);
  assert.deepEqual(of(s, 'update').map(action => action.slice(1)), [[10, { active: true }]]);
  assert.equal(of(s, 'remove').length, 0);
  assert.ok(s.tabs.has(10), 'the verified station tab remains open');
});

test('a readable already-signed station succeeds while unrelated page resources keep loading', async () => {
  const s = await setup({ createdOverrides: { status: 'loading' }, statuses: ['already-signed'] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'already-signed');
  assert.equal(s.tabs.get(10).status, 'loading', 'the unrelated resource never finished');
  assertSigningConfined(s);
  assert.equal(runs(s, 'prepare').length, 1);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(of(s, 'remove').length, 0);
  assert.equal(s.tabs.get(10).active, true);
  assert.match(result.message, /already signed/i);
});

test('unfinished HTML parsing is polled before recognizing an existing signature', async () => {
  const s = await setup({ statuses: ['loading', 'loading', 'already-signed'] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'already-signed');
  assertSigningConfined(s);
  assert.equal(runs(s, 'prepare').length, 3);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(s.tabs.get(10).active, true);
});

test('QRZ tab initialization is polled before showing an existing signature', async () => {
  const s = await setup({ statuses: [
    { status: 'loading', reason: 'tabs' },
    { status: 'loading', reason: 'tabs' },
    'already-signed'
  ] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'already-signed');
  assertSigningConfined(s);
  const checks = runs(s, 'prepare');
  assert.equal(checks.length, 3);
  for (let i = 1; i < checks.length; i++) {
    const between = s.actions.slice(s.actions.indexOf(checks[i - 1]) + 1, s.actions.indexOf(checks[i]));
    assert.ok(between.some(action => action[0] === 'get' && action[1] === 10),
      'the work tab is revalidated before each readiness poll');
  }
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(runs(s, 'bio').length, 0);
  assert.equal(of(s, 'remove').length, 0);
  assert.equal(s.tabs.get(10).active, true);
  assert.match(result.message, /already signed/i);
});

test('QRZ tab initialization that never finishes stops within the bounded wait and leaves its tab open', async () => {
  const s = await setup({ statuses: Array.from({ length: 100 }, () => ({ status: 'loading', reason: 'tabs' })) });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'ambiguous');
  assertSigningConfined(s);
  assert.ok(runs(s, 'prepare').length > 1 && runs(s, 'prepare').length < 100,
    'the tab-initialization wait must terminate while loading responses remain');
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(runs(s, 'bio').length, 0);
  assert.equal(of(s, 'remove').length, 0);
  assert.equal(s.tabs.get(10).active, true);
  assert.match(result.message, /still loading.*tab has been left open/i);
});

test('malformed station tabs are terminal and cannot become a signature through retry', async () => {
  const s = await setup({ statuses: [{ status: 'ambiguous', reason: 'tabs' }, 'unsigned', 'submitted', 'already-signed'] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'ambiguous');
  assertSigningConfined(s);
  assert.equal(runs(s, 'prepare').length, 1, 'a rejected layout is not a readiness signal');
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(runs(s, 'bio').length, 0);
  assert.equal(of(s, 'remove').length, 0);
  assert.equal(s.tabs.get(10).active, true);
  assert.match(result.message, /station tabs were not ready/i);
});

test('one transient prepare-frame error is retried without any sign attempt', async () => {
  const s = await setup({ statuses: [new Error('Frame with ID 0 was removed.'), 'already-signed'] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'already-signed');
  assertSigningConfined(s);
  assert.equal(runs(s, 'prepare').length, 2);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(of(s, 'remove').length, 0);
  assert.equal(s.tabs.get(10).active, true);
});

test('persistent prepare-frame failures stop after the single allowed retry', async () => {
  const s = await setup({ statuses: [new Error('Frame with ID 0 was removed.'), new Error('Frame with ID 0 was removed.'), 'already-signed'] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'ambiguous');
  assertSigningConfined(s);
  assert.equal(runs(s, 'prepare').length, 2);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(s.tabs.get(10).active, true);
});

test('a nontransient prepare permission error is not retried', async () => {
  const s = await setup({ statuses: [new Error('Cannot access contents of url https://www.qrz.com/db/KE9ZZ. Extension manifest must request permission.'), 'already-signed'] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'ambiguous');
  assertSigningConfined(s);
  assert.equal(runs(s, 'prepare').length, 1);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(s.tabs.get(10).active, true);
});

test('HTML parsing that never finishes times out without authorizing a signature', async () => {
  const s = await setup({ statuses: Array(100).fill('loading') });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'ambiguous');
  assertSigningConfined(s);
  assert.ok(runs(s, 'prepare').length > 1 && runs(s, 'prepare').length < 100, 'the parser wait is bounded');
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(of(s, 'remove').length, 0);
  assert.equal(s.tabs.get(10).active, true);
});

test('station with no Web tab shows its biography without submitting', async () => {
  const s = await setup({ statuses: ['no-web-tab'] });
  assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, 'no-web-tab');
  assertSigningConfined(s);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(of(s, 'reload').length, 0);
  assert.equal(runs(s, 'bio').length, 1);
  assert.deepEqual(of(s, 'update').map(action => action.slice(1)), [[10, { active: true }]]);
});

for (const status of ['login-required', 'ambiguous']) {
  test(`${status}: shows feedback in its one work tab without submitting`, async () => {
    const s = await setup({ statuses: [status] });
    assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, status);
    assertSigningConfined(s);
    assert.equal(runs(s, 'sign').length, 0);
    assert.equal(of(s, 'reload').length, 0);
    assert.equal(of(s, 'showWebLogFeedback').length, 1);
    assert.equal(of(s, 'update').length, 1);
  });
}

test('lost submission response observes confirmation without a second click', async () => {
  const s = await setup({ statuses: ['unsigned', new Error('Navigation destroyed response'), 'already-signed'] });
  assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, 'success');
  assertSigningConfined(s);
  assert.equal(runs(s, 'sign').length, 1);
  assert.equal(runs(s, 'bio').length, 1);
});

test('unconfirmed signature stays in one work tab and never retries', async () => {
  const s = await setup({ statuses: ['unsigned', 'submitted'] });
  assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, 'unconfirmed');
  assertSigningConfined(s);
  assert.equal(runs(s, 'sign').length, 1);
  assert.equal(runs(s, 'bio').length, 0);
  assert.equal(of(s, 'showWebLogFeedback').length, 1);
});

test('unsigned-form rejection gives the specific prompt explanation without signing', async () => {
  const s = await setup({ statuses: [{ status: 'ambiguous', reason: 'prompt' }] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'ambiguous');
  assert.match(result.message, /Add your Web Contact prompt was not recognized/);
  assertSigningConfined(s);
  assert.equal(runs(s, 'sign').length, 0);
  assert.equal(of(s, 'showWebLogFeedback')[0][2], result.message);
});

test('changed form at the final sign recheck stops with an explanation and never retries', async () => {
  const s = await setup({ statuses: ['unsigned', { status: 'ambiguous', reason: 'comment-draft' }] });
  const result = await s.module.signWebLog('KE9ZZ', SOURCE);
  assert.equal(result.status, 'ambiguous');
  assert.match(result.message, /comment field contained a draft/);
  assertSigningConfined(s);
  assert.equal(runs(s, 'sign').length, 1);
  assert.equal(runs(s, 'prepare').length, 1);
  assert.equal(runs(s, 'bio').length, 0);
});

test('feedback injection failure never opens a help tab or another window', async () => {
  const s = await setup({ statuses: ['login-required'], feedbackError: true });
  assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, 'login-required');
  assertSigningConfined(s);
});

for (const invalidSource of [undefined, {}, { id: 1 }, { windowId: 2 }]) {
  test(`missing source context ${JSON.stringify(invalidSource)} cannot create a tab`, async () => {
    const s = await setup();
    await assert.rejects(s.module.signWebLog('KE9ZZ', invalidSource));
    assert.equal(of(s, 'create').length, 0);
  });
}
for (const options of [{ sourceMissing: true }, { sourceOverrides: { windowId: 8 } }, { sourceOverrides: { incognito: true } }]) {
  test(`closed, moved, or different browsing context source is rejected: ${JSON.stringify(options)}`, async () => {
    const s = await setup(options);
    await assert.rejects(s.module.signWebLog('KE9ZZ', SOURCE));
    assert.equal(of(s, 'create').length, 0);
    assert.equal(of(s, 'window').length, 0);
  });
}

test('closed source window cannot trigger fallback creation in another window', async () => {
  const s = await setup({ createError: new Error('No window with id 2') });
  await assert.rejects(s.module.signWebLog('KE9ZZ', SOURCE));
  assert.equal(of(s, 'create').length, 1);
  assert.equal(of(s, 'create')[0][1].windowId, 2);
  assert.equal(of(s, 'webLogPage').length, 0);
  assert.equal(of(s, 'window').length, 0);
});

for (const createdOverrides of [{ windowId: 8 }, { incognito: true }]) {
  test(`unexpected created tab context is never signed: ${JSON.stringify(createdOverrides)}`, async () => {
    const s = await setup({ createdOverrides });
    await assert.rejects(s.module.signWebLog('KE9ZZ', SOURCE));
    assert.equal(of(s, 'create').length, 1);
    assert.equal(of(s, 'webLogPage').length, 0);
    assert.equal(of(s, 'window').length, 0);
  });
}

test('selected text Look Up Their Callsign still opens the requested station', async () => {
  const s = await setup();
  s.clicked({ menuItemId: 'qrzLookup', selectionText: 'ea4ijs' }, SOURCE);
  await settle();
  assert.equal(of(s, 'create')[0][1].url, 'https://www.qrz.com/db/EA4IJS');
  assert.equal(of(s, 'create')[0][1].windowId, 2);
});

const linkedCallsigns = [
  { label: 'QRZ QSO HTTP link', linkUrl: 'http://www.qrz.com/db/JE4YMO', expected: 'JE4YMO' },
  { label: 'QRZ bare hostname', linkUrl: 'https://qrz.com/db/EA8%2FKF6UFO', expected: 'EA8/KF6UFO' },
  { label: 'QRZ HTTP portable link', linkUrl: 'http://qrz.com/db/KF6UFO/P/', expected: 'KF6UFO/P' },
  { label: 'PSKReporter transmitter', pageUrl: 'https://pskreporter.info/pskmap.html',
    linkUrl: "javascript:showAndSetCallsign('KF6UFO')", expected: 'KF6UFO' },
  { label: 'PSKReporter receiver', pageUrl: 'https://pskreporter.info/pskmap.html',
    linkUrl: "javascript:showAndSetRxCallsign('TF1FT')", expected: 'TF1FT' },
  { label: 'PSKReporter portable and double quotes', pageUrl: 'https://pskreporter.info/pskmap',
    linkUrl: 'javascript:showAndSetRxCallsign( "ea8/kf6ufo" );', expected: 'EA8/KF6UFO' },
  { label: 'PSKReporter frame', frameUrl: 'https://pskreporter.info/pskmap.html',
    pageUrl: 'https://example.org/', linkUrl: "javascript:showAndSetCallsign('KF6UFO/P')", expected: 'KF6UFO/P' }
];

for (const menuItemId of ['qrzLookup', 'qrzLogbook']) {
  for (const { label, expected, ...info } of linkedCallsigns) {
    test(`${menuItemId} resolves ${label} without selecting text or running the link`, async () => {
      const s = await setup();
      s.clicked({ menuItemId, ...info }, SOURCE);
      await settle();
      if (menuItemId === 'qrzLookup') {
        assert.deepEqual(of(s, 'create').map(action => action[1]), [{
          url: 'https://www.qrz.com/db/' + encodeURIComponent(expected), active: true, windowId: 2
        }]);
        assert.equal(of(s, 'searchLogbookPage').length, 0);
      } else {
        assert.equal(of(s, 'create').length, 0, 'the existing Logbook tab is reused');
        assert.deepEqual(of(s, 'searchLogbookPage').map(action => action.slice(1)), [
          [expected, { targetTabId: 50, injectImmediately: undefined }]
        ]);
      }
      assert.equal(of(s, 'webLogPage').length, 0, 'read-only actions cannot start signing');
      assert.equal(of(s, 'update').filter(action => action[1] === SOURCE.id).length, 0,
        'the source map or QSO page is not navigated');
    });
  }

  test(`${menuItemId} uses one highlighted callsign on an unrecognized link`, async () => {
    const s = await setup();
    s.clicked({ menuItemId, selectionText: '(ea8 / kf6ufo / p)',
      linkUrl: 'https://example.org/station?id=123' }, SOURCE);
    await settle();
    if (menuItemId === 'qrzLookup') {
      assert.equal(of(s, 'create')[0][1].url, 'https://www.qrz.com/db/EA8%2FKF6UFO%2FP');
    } else {
      assert.equal(of(s, 'create').length, 0);
      assert.equal(of(s, 'searchLogbookPage')[0][1], 'EA8/KF6UFO/P');
    }
    assert.equal(of(s, 'webLogPage').length, 0);
  });

  test(`${menuItemId} prefers an identified link station over leftover selection`, async () => {
    const s = await setup();
    for (const { expected, label, ...info } of linkedCallsigns) {
      assert.equal(s.module.menuCallsign({ menuItemId, ...info, selectionText: 'W1AW' }), expected, label);
    }
  });

  for (const selectionText of [undefined, 'KF6UFO W1AW', 'please look up KF6UFO', 'not a callsign']) {
    test(`${menuItemId} rejects an unknown link with invalid selection: ${selectionText}`, async () => {
      const s = await setup();
      s.clicked({ menuItemId, linkUrl: 'https://example.org/', selectionText }, SOURCE);
      await settle();
      assert.equal(of(s, 'create').length, 1);
      assert.match(of(s, 'create')[0][1].url, /^chrome-extension:\/\/test\/help\.html#/);
      assert.equal(of(s, 'searchLogbookPage').length, 0);
      assert.equal(of(s, 'webLogPage').length, 0);
    });
  }
}

test('PSKReporter link parsing rejects unrelated pages, frames, and executable expressions', async () => {
  const s = await setup();
  const valid = { menuItemId: 'qrzLookup', pageUrl: 'https://pskreporter.info/pskmap.html',
    linkUrl: "javascript:showAndSetCallsign('KF6UFO')" };
  for (const pageUrl of [undefined, 'https://example.org/pskmap.html',
    'https://pskreporter.info.evil.test/pskmap.html', 'https://pskreporter.info/other.html']) {
    assert.equal(s.module.menuCallsign({ ...valid, pageUrl }), null, String(pageUrl));
  }
  assert.equal(s.module.menuCallsign({ ...valid, frameUrl: 'https://example.org/pskmap.html' }), null,
    'an unrelated frame cannot inherit the top page URL');
  for (const linkUrl of [
    "javascript:showAndSetCallsign('KF6UFO');alert(1)",
    "javascript:showAndSetCallsign('KF6UFO', 'W1AW')",
    "javascript:showAndSetCallsign('KF6UFO' + '/P')",
    "javascript:showAndSetCallsign('KF6UFO W1AW')",
    "javascript:otherFunction('KF6UFO')",
    "javascript:showAndSetCallsign('KF6UFO\")"
  ]) {
    assert.equal(s.module.menuCallsign({ ...valid, linkUrl }), null, linkUrl);
  }
});

test('read-only QRZ link parsing rejects lookalike hosts, credentials, and ambiguous URLs', async () => {
  const s = await setup();
  for (const menuItemId of ['qrzLookup', 'qrzLogbook']) {
    for (const linkUrl of ['https://www.qrz.com.evil.test/db/KE9ZZ', 'https://qrz.com:8443/db/KE9ZZ',
      'https://user:pass@www.qrz.com/db/KE9ZZ', 'https://www.qrz.com/logout/KE9ZZ',
      'https://www.qrz.com/db/KE9ZZ?other=W1AW', 'https://www.qrz.com/db/%ZZ',
      'https://www.qrz.com/db/KE9ZZ#W1AW']) {
      assert.equal(s.module.menuCallsign({ menuItemId, linkUrl }), null, linkUrl);
    }
  }
});

test('new read-only link formats cannot cause signing with a stale selection', async () => {
  const s = await setup();
  for (const { expected, label, ...info } of linkedCallsigns) {
    s.clicked({ menuItemId: 'qrzWebLog', ...info, selectionText: 'W1AW' }, SOURCE);
  }
  await settle();
  assert.equal(of(s, 'create').length, 0);
  assert.equal(of(s, 'webLogPage').length, 0);
});

test('QRZ station link takes precedence over stale selection', async () => {
  const s = await setup({ statuses: ['already-signed'] });
  s.clicked({ menuItemId: 'qrzWebLog', linkUrl: 'https://www.qrz.com/db/KE9ZZ', selectionText: 'W1AW' }, SOURCE);
  await settle();
  assertSigningConfined(s);
  assert.equal(of(s, 'remove').length, 0);
  assert.equal(s.tabs.get(10).active, true);
  assert.equal(of(s, 'showWebLogFeedback').length, 1);
});

for (const linkUrl of ['https://www.qrz.com/db/BW2%2FJP1RIW', 'https://www.qrz.com/db/BW2/JP1RIW/']) {
  test(`slash in QRZ station link is preserved: ${linkUrl}`, async () => {
    const s = await setup({ statuses: ['already-signed'] });
    s.clicked({ menuItemId: 'qrzWebLog', linkUrl }, SOURCE);
    await settle();
    assert.equal(of(s, 'create')[0][1].url, 'https://www.qrz.com/db/BW2%2FJP1RIW');
    assert.equal(runs(s, 'prepare')[0][1], 'BW2/JP1RIW');
  });
}

test('a complete blank tab with pending navigation is not mistaken for a login redirect', async () => {
  let reads = 0;
  const s = await setup({ statuses: ['already-signed'], getHook: (id, tabs) => {
    if (id !== 10) return;
    const current = tabs.get(id);
    reads++;
    tabs.set(id, { ...current, status: 'complete',
      url: reads < 3 ? 'about:blank' : 'https://www.qrz.com/db/KE9ZZ',
      pendingUrl: reads < 3 ? 'https://www.qrz.com/db/KE9ZZ' : undefined });
  }});
  assert.equal((await s.module.signWebLog('KE9ZZ', SOURCE)).status, 'already-signed');
  assert.equal(runs(s, 'prepare').length, 1);
  assert.deepEqual(of(s, 'update').map(action => action.slice(1)), [[10, { active: true }]]);
  assert.equal(of(s, 'remove').length, 0);
});

for (const linkUrl of ['https://example.org/db/KE9ZZ', 'https://www.qrz.com.evil.test/db/KE9ZZ', 'http://www.qrz.com/db/KE9ZZ', 'https://www.qrz.com/db/KE9ZZ?other=W1AW', 'https://www.qrz.com/db/%ZZ', 'https://www.qrz.com/logout/KE9ZZ']) {
  test(`untrusted station link cannot fall back to stale selection: ${linkUrl}`, async () => {
    const s = await setup();
    s.clicked({ menuItemId: 'qrzWebLog', linkUrl, selectionText: 'W1AW' }, SOURCE);
    await settle();
    assert.equal(of(s, 'webLogPage').length, 0);
    assert.equal(of(s, 'create').length, 0);
  });
}

test('invalid signing selection does not spawn a help tab', async () => {
  const s = await setup();
  s.clicked({ menuItemId: 'qrzWebLog', selectionText: 'not a callsign' }, SOURCE);
  await settle();
  assert.equal(of(s, 'create').length, 0);
});

test('rapid duplicate menu requests share one in-flight signature', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  const s = await setup({ statuses: ['already-signed'], hook: async ({ func, args }) => {
    if (func.name === 'webLogPage' && args[1] === 'prepare' && !held) { held = true; await gate; }
  } });
  s.clicked({ menuItemId: 'qrzWebLog', selectionText: 'KE9ZZ' }, SOURCE);
  s.clicked({ menuItemId: 'qrzWebLog', selectionText: 'KE9ZZ' }, SOURCE);
  await settle();
  assert.equal(of(s, 'create').length, 1);
  release(); await settle();
  assert.equal(of(s, 'create').length, 1);
  assert.equal(runs(s, 'prepare').length, 1);
});

test('different station requests are serialized until the first check finishes', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  const s = await setup({ statuses: ['already-signed', 'already-signed'], hook: async ({ func, args }) => {
    if (func.name === 'webLogPage' && args[1] === 'prepare' && !held) { held = true; await gate; }
  } });
  s.clicked({ menuItemId: 'qrzWebLog', selectionText: 'KE9ZZ' }, SOURCE);
  s.clicked({ menuItemId: 'qrzWebLog', selectionText: 'EA4IJS' }, SOURCE);
  await settle();
  assert.equal(of(s, 'create').length, 1);
  release(); await settle();
  assert.equal(of(s, 'create').length, 2);
  const secondCreate = of(s, 'create')[1];
  assert.equal(secondCreate[1].url, 'https://www.qrz.com/db/EA4IJS');
  assert.ok(s.actions.indexOf(of(s, 'showWebLogFeedback')[0]) < s.actions.indexOf(secondCreate));
  assert.ok(s.actions.indexOf(of(s, 'update')[0]) < s.actions.indexOf(secondCreate));
  assert.equal(of(s, 'remove').length, 0);
  assert.ok(s.tabs.has(10) && s.tabs.has(11), 'both checked station tabs stay open');
});

test('existing logbook search still reuses its logbook tab and invokes page search', async () => {
  const s = await setup();
  await s.module.searchLogbook('EA4IJS', SOURCE);
  assert.equal(of(s, 'create').length, 0);
  assert.ok(of(s, 'searchLogbookPage').some(action => action[1] === 'EA4IJS' && action.at(-1).targetTabId === 50));
  assert.equal(of(s, 'window').length, 1);
});
