import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeToolbarImageBatch } from '../src/design-workbench/toolbar-image-placement';
import { imageBounds, selectionBounds } from '../src/design-workbench/canvas-selection';
import { imageBatchFitZoom, restoreCanvasContentGroups } from '../src/design-workbench/canvas-image-additions';
import type { CanvasImage } from '../src/design-workbench/useCanvas';

function tile(id: string, x: number, y: number, extra: Partial<CanvasImage> = {}): CanvasImage {
  return { id, name: `${id}.png`, image: {} as HTMLImageElement, url: '', x, y, width: 100, height: 100, ...extra };
}
function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
const viewport = { x: 0, y: 0, width: 1000, height: 800 };

test('a large toolbar output starts below all existing content without moving it', () => {
  const existing = [tile('reference', 0, 0), tile('first', 140, 0), tile('second', 560, 0), tile('distant', 5000, 0)];
  const snapshot = JSON.stringify(existing);
  const [addition] = placeToolbarImageBatch([tile('output', 140, 0, { width: 2000, height: 200 })], existing, viewport, 24);
  assert.equal(addition.x, 0);
  assert.equal(addition.y, 364);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('different original rows contribute to one bottom edge without changing order or positions', () => {
  const existing = [tile('a', 160, 10, { width: 80 }), tile('b', 300, 25, { width: 120 }), tile('c', 470, 40, { width: 50 })];
  const snapshot = JSON.stringify(existing);
  const [addition] = placeToolbarImageBatch([tile('output', 140, 0, { width: 200 })], existing, viewport, 0);
  assert.deepEqual({ x: addition.x, y: addition.y }, { x: 160, y: 380 });
  assert.equal(JSON.stringify(existing), snapshot);
});

test('offscreen elements and pre-existing overlaps remain untouched while defining the bottom', () => {
  const existing = [tile('obstruction', 150, 0), tile('unrelated-a', 10, 1000), tile('unrelated-b', 50, 1000)];
  const snapshot = JSON.stringify(existing);
  const [addition] = placeToolbarImageBatch([tile('output', 140, 0)], existing, viewport, 24);
  assert.deepEqual({ x: addition.x, y: addition.y }, { x: 10, y: 1364 });
  assert.equal(JSON.stringify(existing), snapshot);
});

test('reference membership does not select the new row location', () => {
  const existing = [tile('source-a', 0, 0, { contentGroupId: 'a' }), tile('obstruction', 150, 0), tile('source-b', 300, 0, { contentGroupId: 'b' })];
  const [addition] = placeToolbarImageBatch([tile('output', 140, 0, { contentGroupId: 'new-group' })], existing, viewport, 24);
  assert.deepEqual({ x: addition.x, y: addition.y }, { x: 0, y: 364 });
  assert.equal(addition.contentGroupId, 'new-group');
});

test('rotated bounds and filename space are included in the row placement', () => {
  const rotated = tile('rotated', 260, -100, { width: 20, height: 300, rotation: 90 });
  const named = tile('filename-intersection', 140, 120, { height: 40 });
  const [addition] = placeToolbarImageBatch([tile('output', 140, 0)], [rotated, named], viewport, 24);
  near(addition.x, 120);
  near(addition.y - 24, 400);
});

test('concurrent and failed placeholders reserve the bottom without moving task or group data', () => {
  const running = tile('running-agent-result', 140, 0, {
    generating: true, taskResultId: 'task:result', generationBatchId: 'task', generationIndex: 2,
    contentGroupId: 'agent:conversation', agentConversationId: 'conversation', groupId: 'user-group',
  });
  const failed = tile('failed-result', 0, 1000, { generationFailed: true });
  const existing = [running, failed], snapshot = JSON.stringify(existing);
  const [addition] = placeToolbarImageBatch([tile('toolbar-output', 140, 0, { width: 700 })], existing, viewport, 24);
  assert.equal(addition.x, 0);
  assert.equal(addition.y, 1364);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('a complete output row keeps 80px horizontal gaps and a shared top', () => {
  const existing = [tile('source', 0, 200, { width: 1000, height: 100 })];
  const additions = placeToolbarImageBatch([tile('a', 0, 0, { width: 200 }), tile('b', 0, 0, { width: 300, height: 350 })], existing, viewport, 24);
  assert.deepEqual(additions.map(item => ({ x: item.x, y: item.y })), [{ x: 0, y: 564 }, { x: 280, y: 564 }]);
});

test('a later task starts beneath the complete previous placeholder row', () => {
  const existing = [tile('reference', 0, 0)];
  const first = placeToolbarImageBatch([tile('tall', 0, 0, { height: 300, generating: true }), tile('short', 0, 0, { height: 120, generating: true })], existing, viewport, 24);
  const [next] = placeToolbarImageBatch([tile('next', 0, 0)], [...existing, ...first], viewport, 24);
  assert.equal(next.x, 0);
  assert.equal(next.y, 928);
});

test('objects above the reference keep their positions', () => {
  const existing = [tile('upper-far', 140, -250), tile('upper-near', 140, -110), tile('reference', 0, 0)];
  const snapshot = JSON.stringify(existing);
  const [addition] = placeToolbarImageBatch([tile('output', 140, 0)], existing, viewport, 24);
  assert.equal(addition.y, 364);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('an empty canvas centers the complete row including the filename area', () => {
  const additions = placeToolbarImageBatch([tile('a', 0, 0, { width: 200 }), tile('b', 0, 0, { width: 300, height: 350 })], [], viewport, 24);
  const bounds = selectionBounds(additions);
  near(bounds.x + bounds.width / 2, 500);
  near(bounds.y - 24 + (bounds.height + 24) / 2, 400);
  assert.equal(additions[1].x - additions[0].x, 280);
});

test('a rotated lower placeholder defines the actual bottom and retains its state', () => {
  const source = tile('reference', 0, 0);
  const running = tile('rotated-running', 250, 200, { width: 40, height: 200, rotation: 90, generating: true,
    taskResultId: 'task:result', generationBatchId: 'task', contentGroupId: 'agent:conversation', groupId: 'user-group' });
  const existing = [source, running], snapshot = JSON.stringify(existing);
  const [addition] = placeToolbarImageBatch([tile('output', 140, 0, { width: 300, height: 350 })], existing, viewport, 24);
  near(addition.y - 24, imageBounds(running).y + imageBounds(running).height + 240);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('small visible areas always produce a positive finite focus scale', () => {
  for (const viewport of [{ width: 1, height: 1 }, { width: 0, height: 24 }, { width: -100, height: 0 }]) {
    const zoom = imageBatchFitZoom({ width: 2048, height: 2048 }, viewport, 24);
    assert.ok(Number.isFinite(zoom) && zoom > 0);
  }
});

test('legacy Agent groups match restored conversation identifiers', () => {
  const [restored] = restoreCanvasContentGroups([tile('legacy', 0, 0, { generationPlacement: 'agent', generationBatchId: 'batch' })]);
  assert.equal(restored.contentGroupId, 'agent:legacy-agent:batch');
});
