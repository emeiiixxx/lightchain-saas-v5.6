import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFusion, type CanvasImage, type FusionSettings } from '../src/canvas';
import { fusionCanvasReferenceCandidates } from '../src/fusion-canvas-references';

const image = (id: string, extra: Partial<CanvasImage> = {}): CanvasImage => ({
  id, name: id, url: '/assets/shared-demo.png', x: 0, y: 0, width: 360, height: 480, ...extra,
});
const reference = (id: string) => ({ id, sourceImageId: id, name: id, url: '/assets/shared-demo.png' });
const editor = (id: string, fusion: FusionSettings, extra: Partial<CanvasImage> = {}) =>
  image(id, { nodeOnly: true, fusion, ...extra });

test('canvas picker excludes all downstream results before clicking, regardless of storage order', () => {
  const items = [
    image('last-result', { generatedByEditorId: 'last-editor' }),
    editor('last-editor', defaultFusion('flat'), { editorSourceId: 'cutout' }),
    image('cutout', { sourceImageId: 'first-result' }),
    image('first-result', { generatedByEditorId: 'owner' }),
    editor('owner', { ...defaultFusion(), references: [reference('input')] }),
    image('input'),
    image('unrelated'),
    image('upstream'),
    image('pending', { generation: { taskId: 'task', status: 'running' } }),
  ];
  const original = structuredClone(items);
  assert.deepEqual(fusionCanvasReferenceCandidates(items, { target: 'owner' }).map(item => item.id), ['unrelated', 'upstream']);
  assert.deepEqual(items, original, 'opening the picker must not modify the canvas');
});

test('all linked input pickers disable downstream images without disabling independent instances of the same asset', () => {
  for (const kind of ['fusion', 'merge', 'batch', 'flat'] as const) {
    const settings = { ...defaultFusion(kind), ...(kind === 'flat' ? { batchFlat: true } : {}) };
    const target = { target: 'owner', ...(kind === 'batch' ? { role: 'main' as const } : {}) };
    const items = [
      editor('owner', settings),
      image('own-result', { generatedByEditorId: 'owner' }),
      editor('next', { ...defaultFusion('merge'), references: [reference('own-result')] }),
      image('next-result', { generatedByEditorId: 'next' }),
      image('independent-copy'),
    ];
    assert.deepEqual(fusionCanvasReferenceCandidates(items, target).map(item => item.id), ['independent-copy'], kind);
  }
});

test('rechecking candidates rejects a previously available result after its node becomes downstream', () => {
  const items = [
    editor('owner', defaultFusion()),
    image('own-result', { generatedByEditorId: 'owner' }),
    editor('next', defaultFusion('merge')),
    image('next-result', { generatedByEditorId: 'next' }),
  ];
  assert(fusionCanvasReferenceCandidates(items, { target: 'owner' }).some(item => item.id === 'next-result'));
  items[2] = { ...items[2], fusion: { ...items[2].fusion!, references: [reference('own-result')] } };
  assert(!fusionCanvasReferenceCandidates(items, { target: 'owner' }).some(item => item.id === 'next-result'));
});
