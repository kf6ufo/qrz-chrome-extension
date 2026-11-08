import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../settings.js', import.meta.url), 'utf8');
const settings = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const { WEB_LOG_COMMENT_LIMIT, WEB_LOG_COMMENT_KEY, getWebLogCommentError, loadWebLogComment } = settings;
const longest = `Greetings from West Virginia - I would be most grateful if you would please log our QSO asap, & add your comment's to my "Web Contact Log" after your visit. Thank you & 73`;
const optionsSource = await readFile(new URL('../options.js', import.meta.url), 'utf8');
let serial = 0;

async function optionsPage({ value = '', readError = false, writeError = false } = {}) {
  const elements = new Map();
  const writes = [];
  for (const id of ['settings-form', 'web-log-comment', 'comment-count', 'save', 'clear', 'status']) {
    const listeners = new Map();
    elements.set(id, {
      value: '', disabled: true, textContent: '', attributes: {}, classes: new Set(),
      addEventListener(type, fn) { listeners.set(type, fn); },
      async trigger(type) { await listeners.get(type)?.({ preventDefault() {} }); },
      setAttribute(name, val) { this.attributes[name] = val; },
      focus() { this.focused = true; }
    });
    const element = elements.get(id);
    element.classList = { toggle(name, on) { on ? element.classes.add(name) : element.classes.delete(name); } };
  }
  globalThis.document = { getElementById: id => elements.get(id) };
  globalThis.chrome = { storage: { local: {
    get: async defaults => {
      if (readError) throw new Error('Read failed');
      return { ...defaults, webLogComment: value };
    },
    set: async data => {
      if (writeError) throw new Error('Write failed');
      writes.push(data);
    }
  } } };
  const script = source.replaceAll('export ', '') + '\n'
    + optionsSource.replace(/^import .*;\n/, '') + `\n// options test ${serial++}`;
  await import('data:text/javascript;base64,' + Buffer.from(script).toString('base64'));
  return { get: id => elements.get(id), writes };
}

test('the supplied longest example establishes the 171-character limit', () => {
  assert.equal(longest.length, 171);
  assert.equal(WEB_LOG_COMMENT_LIMIT, longest.length);
  assert.equal(getWebLogCommentError(longest), '');
  assert.match(getWebLogCommentError(longest + '!'), /171/);
});

test('optional comments preserve punctuation, spacing, and Unicode text exactly', async () => {
  for (const comment of ['', 'Greetings from Colorado! 73s', '73  & "best wishes" — José’s café ☀', ' ']) {
    globalThis.chrome = { storage: { local: { get: async defaults => ({ ...defaults, webLogComment: comment }) } } };
    assert.equal(getWebLogCommentError(comment), '');
    assert.equal(await loadWebLogComment(), comment);
  }
});

test('length validation agrees with the text input maxlength for Unicode', () => {
  assert.equal(getWebLogCommentError('🙂'.repeat(85) + '!'), '');
  assert.match(getWebLogCommentError('🙂'.repeat(86)), /171/);
});

test('single-line comments reject controls rather than silently changing the text', () => {
  for (const comment of ['Hi\n73', 'Hi\r73', 'Hi\t73', 'Hi\0there', 'Hi\u007fthere']) {
    assert.match(getWebLogCommentError(comment), /single line/);
  }
});

test('non-text values cannot be used as a comment', () => {
  for (const value of [undefined, null, 73, {}, ['73']]) assert.match(getWebLogCommentError(value), /text comment/);
});

test('a missing setting defaults to an empty comment without saving anything', async () => {
  let writes = 0;
  globalThis.chrome = { storage: { local: {
    get: async defaults => { assert.deepEqual(defaults, { webLogComment: '' }); return defaults; },
    set: async () => { writes++; }
  } } };
  assert.equal(WEB_LOG_COMMENT_KEY, 'webLogComment');
  assert.equal(await loadWebLogComment(), '');
  assert.equal(writes, 0);
});

test('invalid saved values stop signing with a Settings-directed explanation', async () => {
  for (const comment of [longest + '!', 'Hi\n73', null]) {
    globalThis.chrome = { storage: { local: { get: async () => ({ webLogComment: comment }) } } };
    await assert.rejects(loadWebLogComment(), /extension Settings.*Nothing was submitted/);
  }
});

test('a storage failure cannot silently switch a configured signature to an empty comment', async () => {
  globalThis.chrome = { storage: { local: { get: async () => { throw new Error('Unavailable'); } } } };
  await assert.rejects(loadWebLogComment(), /could not be loaded.*Settings.*Nothing was submitted/);
});

test('Settings loads the exact saved comment and saves only after explicit Save', async () => {
  const page = await optionsPage({ value: 'Greetings from Colorado! 73s' });
  const input = page.get('web-log-comment');
  assert.equal(input.value, 'Greetings from Colorado! 73s');
  assert.equal(input.maxLength, 171);
  assert.equal(input.disabled, false);
  assert.equal(page.writes.length, 0);
  input.value = `73 & "best wishes" from Colorado`;
  await input.trigger('input');
  assert.match(page.get('status').textContent, /Unsaved/);
  assert.equal(page.writes.length, 0);
  await page.get('settings-form').trigger('submit');
  assert.deepEqual(page.writes, [{ webLogComment: input.value }]);
  assert.match(page.get('status').textContent, /^Saved\./);
});

test('Clear leaves storage untouched until Save explicitly selects an empty comment', async () => {
  const page = await optionsPage({ value: '73' });
  await page.get('clear').trigger('click');
  assert.equal(page.get('web-log-comment').value, '');
  assert.equal(page.get('comment-count').textContent, '0 / 171');
  assert.equal(page.writes.length, 0);
  await page.get('settings-form').trigger('submit');
  assert.deepEqual(page.writes, [{ webLogComment: '' }]);
  assert.match(page.get('status').textContent, /no comment/);
});

test('an overlength saved comment is shown without truncation and cannot be saved until corrected', async () => {
  const page = await optionsPage({ value: longest + '!' });
  const input = page.get('web-log-comment');
  assert.equal(input.value, longest + '!');
  assert.equal(page.get('comment-count').textContent, '172 / 171');
  assert.equal(page.get('save').disabled, true);
  await page.get('settings-form').trigger('submit');
  assert.equal(page.writes.length, 0);
  input.value = longest;
  await input.trigger('input');
  assert.equal(page.get('save').disabled, false);
  await page.get('settings-form').trigger('submit');
  assert.deepEqual(page.writes, [{ webLogComment: longest }]);
});

test('Settings reports invalid single-line stored data and requires explicit replacement', async () => {
  const page = await optionsPage({ value: 'Hi\n73' });
  assert.equal(page.get('web-log-comment').value, '');
  assert.match(page.get('status').textContent, /needs correction.*single line/);
  assert.equal(page.writes.length, 0);
});

test('Settings read failure prevents saving an accidental empty replacement', async () => {
  const page = await optionsPage({ readError: true });
  assert.equal(page.get('web-log-comment').disabled, true);
  assert.equal(page.get('save').disabled, true);
  assert.equal(page.get('clear').disabled, true);
  assert.match(page.get('status').textContent, /could not be loaded/);
  await page.get('settings-form').trigger('submit');
  assert.equal(page.writes.length, 0);
});

test('Settings write failure preserves the entered comment and reports failure', async () => {
  const page = await optionsPage({ value: 'Greetings from Colorado! 73s', writeError: true });
  await page.get('settings-form').trigger('submit');
  assert.equal(page.get('web-log-comment').value, 'Greetings from Colorado! 73s');
  assert.equal(page.get('web-log-comment').disabled, false);
  assert.equal(page.get('save').disabled, false);
  assert.equal(page.writes.length, 0);
  assert.match(page.get('status').textContent, /could not be saved/);
});
