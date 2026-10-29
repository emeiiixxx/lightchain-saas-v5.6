import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentPlacementBaseline, placeAgentImageBatch } from '../src/design-workbench/agent-image-placement';
import { imageBounds, selectionBounds } from '../src/design-workbench/canvas-selection';
import { imageBatchFitZoom, placeAddedImages, restoreCanvasContentGroups } from '../src/design-workbench/canvas-image-additions';
import type { CanvasImage } from '../src/design-workbench/useCanvas';

const viewport = { x: 0, y: 0, width: 1000, height: 800 };
test('tiny visible canvas still produces a positive finite fit zoom', () => {
  for (const height of [0, 1, 24, 25]) {
    const zoom = imageBatchFitZoom({ width: 4096, height: 4096 }, { width: 1, height }, 24);
    assert.ok(Number.isFinite(zoom) && zoom > 0 && zoom <= 1);
  }
});
function tile(id: string, x: number, y: number, extra: Partial<CanvasImage> = {}): CanvasImage {
  return { id, name: `${id}.png`, image: {} as HTMLImageElement, url: '', x, y, width: 100, height: 100, addedAt: 1, ...extra };
}
function output(id: string, extra: Partial<CanvasImage> = {}) {
  const { x: _x, y: _y, ...item } = tile(id, 0, 0, extra);
  return item;
}
function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

test('a later round starts below all canvas content regardless of conversation or distance', () => {
  const own = tile('own', 2000, 100, { contentGroupId: 'conversation-a' });
  const unrelated = [tile('other-1', 0, 0), tile('other-2', 140, 0), tile('other-3', 280, 1000)];
  const [placed] = placeAgentImageBatch([output('new')], [...unrelated, own], viewport);
  assert.equal(placed.x, 0);
  assert.equal(placed.y, 1340);
});

test('a batch wider than the visible canvas remains a horizontal row and is centered on an empty canvas', () => {
  const placed = placeAgentImageBatch([output('a', { width: 800 }), output('b', { width: 900 }), output('c', { width: 1000 })], [], viewport, { filenameTopSpace: 24 });
  assert.equal(placed[1].x - placed[0].x, 880);
  assert.equal(placed[2].x - placed[1].x, 980);
  assert.equal(new Set(placed.map(item => item.y)).size, 1);
  const bounds = selectionBounds(placed);
  near(bounds.x + bounds.width / 2, 500);
  near(bounds.y - 24 + (bounds.height + 24) / 2, 400);
});

test('placement bounds include isolated objects without adjacency or date ranking', () => {
  const clustered = [tile('a', 1000, 0), tile('b', 1580, 0), tile('c', 2160, 0)];
  const all = [tile('near', 0, 0), ...clustered];
  assert.deepEqual(agentPlacementBaseline(all), selectionBounds(all));
  const old = tile('old', -1050, -50, { addedAt: 1 });
  const recent = tile('recent', 950, -50, { addedAt: 2 });
  assert.deepEqual(agentPlacementBaseline([recent, old]), selectionBounds([recent, old]));
});

test('sequential results append to the previous tile and only the new result avoids a concurrent obstacle', () => {
  const previous = tile('first-result', 0, 0, { contentGroupId: 'a' });
  const concurrent = tile('toolbar-result', 140, 0, { generating: true, width: 100, height: 180, contentGroupId: 'b' });
  const lower = tile('offscreen', 140, 450, { height: 100 });
  const existing = [previous, concurrent, lower];
  const snapshot = JSON.stringify(existing);
  const [placed] = placeAgentImageBatch([output('next')], existing, viewport, { appendAfter: previous, filenameTopSpace: 24 });
  assert.equal(placed.x, 180);
  assert.equal(placed.y, 814);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('rotated object edges and filename space participate in collision avoidance', () => {
  const previous = tile('first', 0, 0);
  // Its unrotated rectangle does not overlap the tile at x=180, but its rotated bounds do.
  const rotated = tile('rotated', 300, -100, { width: 20, height: 300, rotation: 90 });
  const [placed] = placeAgentImageBatch([output('next')], [previous, rotated], viewport, { appendAfter: previous, filenameTopSpace: 24 });
  assert.equal(placed.x, 180);
  near(placed.y, Math.max(previous.y + previous.height, imageBounds(rotated).y + imageBounds(rotated).height) + 240 + 24);
  const onlyName = tile('filename-conflict', 140, 120, { height: 40 });
  const [withName] = placeAgentImageBatch([output('name-aware')], [previous, onlyName], viewport, { appendAfter: previous, filenameTopSpace: 24 });
  assert.equal(withName.y, 424);
});

test('one append batch places each image independently and only the conflicting image moves down', () => {
  const previous = tile('first', 0, 0);
  const obstacle = tile('other-result', 280, 0, { width: 100, height: 120 });
  const result = placeAgentImageBatch([output('second'), output('third')], [previous, obstacle], viewport, { appendAfter: previous });
  assert.equal(result[0].y, 0);
  assert.equal(result[1].y, 360);
  assert.equal(result[1].x - result[0].x, 180);
  const [fallback] = placeAgentImageBatch([output('fallback')], [previous], viewport);
  assert.equal(fallback.x, 0);
  assert.equal(fallback.y, 340);
  assert.deepEqual(placeAgentImageBatch([], [previous], viewport), []);
});

test('manual addition uses the current bottom of every object, not the latest addition batch', () => {
  const existing = [tile('latest-upload', 0, 0, { addedAt: 20, additionBatchId: 'latest' }),
    tile('older-generated', 800, 2000, { origin: 'generated', addedAt: 1, height: 600 })];
  const snapshot = JSON.stringify(existing);
  const [first] = placeAddedImages([output('new')], existing, viewport, { filenameTopSpace: 80 });
  assert.equal(first.y - 80, 2680);
  assert.equal(JSON.stringify(existing), snapshot);
  // Arrangement/movement changes the live geometry without changing dates.
  const rearranged = existing.map(item => ({ ...item, y: item.id === 'latest-upload' ? 3000 : 0 }));
  const [afterArrangement] = placeAddedImages([output('new')], rearranged, viewport, { filenameTopSpace: 80 });
  assert.equal(afterArrangement.y - 80, 3180);
});

test('right-click additions retain their exact world anchor and varying widths stay 80px apart', () => {
  const items = [output('small', { width: 70, height: 180 }), output('wide', { width: 600, height: 200 }), output('third', { width: 300 })];
  const existing = [tile('occupied', 300, 200)];
  const result = placeAddedImages(items, existing, viewport, { point: { x: 320, y: 240 }, filenameTopSpace: 80 });
  assert.deepEqual(result.map(item => ({ x: item.x, y: item.y })), [{ x: 320, y: 240 }, { x: 470, y: 240 }, { x: 1150, y: 240 }]);
  assert.equal(result[2].x + result[2].width > viewport.width, true);
});

test('empty manual additions center their full row including filename space', () => {
  const result = placeAddedImages([output('first', { width: 800 }), output('second', { width: 500, height: 200 })], [], viewport, { filenameTopSpace: 60 });
  const bounds = selectionBounds(result);
  near(bounds.x + bounds.width / 2, 500);
  near(bounds.y - 60 + (bounds.height + 60) / 2, 400);
});

test('logical source groups survive user regrouping and follow source ancestry in restored data', () => {
  const items = [
    tile('downstream', 0, 0, { generationParentId: 'generated', groupId: 'manual-b' }),
    tile('generated', 0, 0, { generationParentId: 'source', groupId: 'manual-c' }),
    tile('source', 0, 0, { additionBatchId: 'addition-a', groupId: 'manual-a' }),
    tile('source-sibling', 0, 0, { additionBatchId: 'addition-a', groupId: 'manual-b' }),
    tile('independent', 0, 0, { additionBatchId: 'addition-b', groupId: 'manual-a' }),
    tile('round-one', 0, 0, { agentConversationId: 'conversation', generationBatchId: 'round-1', generationPlacement: 'agent' }),
    tile('round-two', 0, 0, { agentConversationId: 'conversation', generationBatchId: 'round-2', generationPlacement: 'agent' }),
    tile('explicit', 0, 0, { contentGroupId: 'explicit-group', generationParentId: 'source' }),
  ];
  const snapshot = JSON.stringify(items);
  const restored = restoreCanvasContentGroups(items);
  const groups = new Map(restored.map(item => [item.id, item.contentGroupId]));
  for (const id of ['downstream', 'generated', 'source', 'source-sibling']) assert.equal(groups.get(id), 'added:addition-a');
  assert.equal(groups.get('independent'), 'added:addition-b');
  assert.equal(groups.get('round-one'), 'agent:conversation');
  assert.equal(groups.get('round-two'), 'agent:conversation');
  assert.equal(groups.get('explicit'), 'explicit-group');
  assert.deepEqual(restored.map(item => item.groupId), items.map(item => item.groupId));
  assert.deepEqual(restoreCanvasContentGroups(restored), restored);
  assert.equal(JSON.stringify(items), snapshot);
});
