import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGenerationSettingsMemory, rememberGenerationSettingsChange, type RememberedWorkflowKind } from '../src/generation-settings-memory.ts';
import { createBatchEditor, createFusionEditor, createMergeEditor, defaultFusion, deleteCanvasSelection, newFusionSettings, restoreWorkflowMain, type CanvasImage } from '../src/canvas.ts';
import { copyCanvasSelection, pasteCanvasSelection } from '../src/canvas-clipboard.ts';

const defaults = { ratio: 'auto', resolution: '2K' };
const key = (kind: string, account = 'account') => `lc-v56-generation-settings:${account}:${kind}`;
function storageFixture() {
  const values = new Map<string, string>();
  let writes = 0;
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) { values.set(key, value); writes++; } };
  return { values, storage, writes: () => writes };
}

test('each of the four node types keeps its own latest settings', () => {
  const store = storageFixture();
  const memory = createGenerationSettingsMemory('account', () => store.storage);
  const choices: Record<RememberedWorkflowKind, typeof defaults> = {
    fusion: { ratio: '1:1', resolution: '1K' }, batch: { ratio: '3:4', resolution: '4K' },
    merge: { ratio: '4:3', resolution: '2K' }, directed: { ratio: '9:16', resolution: '4K' },
  };
  for (const kind of Object.keys(choices) as RememberedWorkflowKind[]) memory.remember(kind, defaults, choices[kind]);
  for (const kind of Object.keys(choices) as RememberedWorkflowKind[]) assert.deepEqual(memory.read(kind), choices[kind]);
  memory.remember('merge', choices.merge, { ratio: '16:9' });
  assert.deepEqual(memory.read('merge'), { ratio: '16:9', resolution: '2K' });
  assert.deepEqual(memory.read('batch'), choices.batch);
  assert.equal(store.values.size, 4);
});

test('reading, unrelated edits and selecting the current value never update the record', () => {
  const store = storageFixture();
  const memory = createGenerationSettingsMemory('account', () => store.storage);
  assert.deepEqual(memory.read('fusion'), defaults);
  assert.equal(rememberGenerationSettingsChange({ ...defaults, kind: 'fusion' }, {}, memory), false);
  assert.equal(rememberGenerationSettingsChange({ ...defaults, kind: 'fusion' }, { ratio: 'auto' }, memory), false);
  for (const kind of ['flat', 'lingerie']) assert.equal(rememberGenerationSettingsChange({ ...defaults, kind }, { ratio: '1:1' }, memory), false);
  assert.equal(store.writes(), 0);
});

test('changing one field saves both settings from that node, without requiring generation', () => {
  const store = storageFixture();
  const memory = createGenerationSettingsMemory('account', () => store.storage);
  memory.remember('fusion', defaults, { ratio: '16:9', resolution: '4K' });
  const olderNode = { kind: 'fusion', ratio: '3:4', resolution: '1K' };
  assert(rememberGenerationSettingsChange(olderNode, { ratio: '1:1' }, memory));
  assert.deepEqual(memory.read('fusion'), { ratio: '1:1', resolution: '1K' });
  assert.deepEqual(olderNode, { kind: 'fusion', ratio: '3:4', resolution: '1K' });
  const count = store.writes();
  rememberGenerationSettingsChange({ ...defaults, kind: 'fusion' }, { ratio: 'auto' }, memory);
  assert.equal(store.writes(), count, 'opening an older node must not overwrite the latest choice');
});

test('settings survive a new store instance, stay separated by account, and read later writes from other tabs', () => {
  const store = storageFixture();
  const firstTab = createGenerationSettingsMemory('account', () => store.storage);
  firstTab.remember('fusion', defaults, { ratio: '3:4' });
  const reopened = createGenerationSettingsMemory('account', () => store.storage);
  assert.deepEqual(reopened.read('fusion'), { ratio: '3:4', resolution: '2K' });
  assert.deepEqual(createGenerationSettingsMemory('other-account', () => store.storage).read('fusion'), defaults);
  reopened.remember('fusion', reopened.read('fusion'), { resolution: '4K' });
  assert.deepEqual(firstTab.read('fusion'), { ratio: '3:4', resolution: '4K' });
  firstTab.remember('batch', defaults, { ratio: '1:1' });
  assert.deepEqual(reopened.read('fusion'), { ratio: '3:4', resolution: '4K' });
});

test('unsupported or missing fields fall back independently without rewriting the saved record', () => {
  const store = storageFixture();
  const memory = createGenerationSettingsMemory('account', () => store.storage);
  for (const [stored, expected] of [
    [{ version: 1, ratio: '21:9', resolution: '4K' }, { ratio: 'auto', resolution: '4K' }],
    [{ version: 1, ratio: '16:9', resolution: '8K' }, { ratio: '16:9', resolution: '2K' }],
    [{ version: 1, ratio: null, resolution: '1K' }, { ratio: 'auto', resolution: '1K' }],
    [{ version: 2, ratio: '1:1', resolution: '1K' }, defaults],
  ]) {
    const raw = JSON.stringify(stored);
    store.values.set(key('fusion'), raw);
    assert.deepEqual(memory.read('fusion'), expected);
    assert.equal(store.values.get(key('fusion')), raw);
  }
  store.values.set(key('fusion'), '{broken');
  assert.deepEqual(memory.read('fusion'), defaults);
  assert.equal(store.writes(), 0);
});

test('a failed write retains the session choice but a later successful external change wins', () => {
  const store = storageFixture();
  const otherTab = createGenerationSettingsMemory('account', () => store.storage);
  otherTab.remember('fusion', defaults, { ratio: '1:1' });
  const failing = createGenerationSettingsMemory('account', () => ({ getItem: store.storage.getItem, setItem() { throw new Error('quota'); } }));
  failing.remember('fusion', defaults, { ratio: '16:9', resolution: '4K' });
  assert.deepEqual(failing.read('fusion'), { ratio: '16:9', resolution: '4K' });
  otherTab.remember('fusion', defaults, { ratio: '3:4', resolution: '1K' });
  assert.deepEqual(failing.read('fusion'), { ratio: '3:4', resolution: '1K' });
  const blocked = createGenerationSettingsMemory('account', () => { throw new Error('blocked'); });
  assert.deepEqual(blocked.read('batch'), defaults);
  blocked.remember('batch', defaults, { resolution: '4K' });
  assert.deepEqual(blocked.read('batch'), { ratio: 'auto', resolution: '4K' });
});

test('all four creation routes read their own preference while existing, copied and refilled nodes keep their settings', () => {
  const store = storageFixture();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: store.storage } });
  try {
    const memory = createGenerationSettingsMemory('demo-account', () => store.storage);
    const choices: Record<RememberedWorkflowKind, typeof defaults> = {
      fusion: { ratio: '1:1', resolution: '4K' }, batch: { ratio: '3:4', resolution: '1K' },
      merge: { ratio: '4:3', resolution: '2K' }, directed: { ratio: '9:16', resolution: '4K' },
    };
    for (const kind of Object.keys(choices) as RememberedWorkflowKind[]) memory.remember(kind, defaults, choices[kind]);
    const source = (id: string): CanvasImage => ({ id, name: `${id}.png`, url: `${id}.png`, x: 0, y: 0, width: 360, height: 480 });
    const inputs = [source('one'), source('two')];
    const created = [createFusionEditor(inputs, 'one', 'fusion')!, createBatchEditor(inputs, ['one', 'two'], 'batch')!,
      createMergeEditor(inputs, ['one', 'two'], 'merge')!, createFusionEditor(inputs, 'one', 'directed', 'directed')!];
    for (const node of created) {
      const settings = node.fusion!;
      assert.deepEqual({ ratio: settings.ratio, resolution: settings.resolution }, choices[settings.kind as RememberedWorkflowKind]);
    }
    assert.deepEqual(defaultFusion('fusion'), { kind: 'fusion', prompt: '', ...defaults });
    for (const kind of ['lingerie', 'flat'] as const) {
      const settings = newFusionSettings(kind);
      assert.deepEqual({ ratio: settings.ratio, resolution: settings.resolution }, defaults);
    }
    const oldNode = created[0];
    memory.remember('fusion', oldNode.fusion!, { ratio: '16:9', resolution: '1K' });
    const writes = store.writes();
    const next = createFusionEditor(inputs, 'two', 'next')!;
    assert.equal(next.fusion!.ratio, '16:9');
    assert.equal(oldNode.fusion!.ratio, '1:1');
    const copied = pasteCanvasSelection(copyCanvasSelection([...inputs, oldNode], ['fusion:fusion']), 32, 32);
    assert.equal(copied[0].fusion!.ratio, '1:1');
    assert.equal(copied[0].fusion!.resolution, '4K');
    const emptied = deleteCanvasSelection([...inputs, oldNode], ['one']);
    const refilled = restoreWorkflowMain(emptied, oldNode.id, source('replacement'), 'replacement');
    assert.equal(refilled.find(node => node.id === oldNode.id)!.fusion!.ratio, '1:1');
    assert.equal(refilled.find(node => node.id === oldNode.id)!.fusion!.resolution, '4K');
    const legacy = { ...source('legacy'), fusion: { ...defaultFusion(), ratio: '3:4', resolution: '2K' } };
    const legacyEmpty = deleteCanvasSelection([legacy], ['legacy'])[0];
    assert.equal(legacyEmpty.nodeOnly, true);
    assert.equal(legacyEmpty.fusion!.ratio, '3:4');
    assert.equal(legacyEmpty.fusion!.resolution, '2K');
    assert.equal(store.writes(), writes, 'new, copy, delete and refill must never update preferences');
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
