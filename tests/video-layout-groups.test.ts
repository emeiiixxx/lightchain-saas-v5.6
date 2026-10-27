import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CanvasImage } from '../src/canvas.ts';
import { createMaterialWorkflow, type MaterialWorkflow } from '../src/material-workflow.ts';
import { arrangeVideoWorkflowMedia, reconcileVideoWorkflowLayout } from '../src/video-workflow-layout.ts';
import type { VideoLayoutState } from '../src/video-layout-groups.ts';

const image = (id: string): CanvasImage => ({ id, name: id, url: id, x: 0, y: 0, width: 100, height: 100 });
const node = (id: string, sources: string[]): MaterialWorkflow => ({ ...createMaterialWorkflow(0, 0, 'quick'), id,
  references: sources.map(sourceImageId => ({ id: sourceImageId, sourceImageId, name: sourceImageId, url: sourceImageId, kind: 'image' })) });
const reconcile = (images: CanvasImage[], nodes: MaterialWorkflow[], saved?: VideoLayoutState) =>
  reconcileVideoWorkflowLayout(images, [], nodes, [], saved);
const arrange = (images: CanvasImage[], nodes: MaterialWorkflow[], saved: VideoLayoutState) =>
  arrangeVideoWorkflowMedia(images, [], nodes, [], saved);

test('video nodes join one existing group or create a distinct group when inputs span multiple groups', () => {
  const images = ['a', 'b', 'fresh', 'cross-fresh'].map(image);
  const initial = [node('a-node', ['a']), node('b-node', ['b'])];
  const before = reconcile(images, initial);
  const same = [...initial, node('same', ['a', 'fresh'])];
  const joined = reconcile(images, same, before);
  assert.equal(joined.owners.same, before.owners['a-node']);
  assert.equal(joined.owners.fresh, before.owners.a);
  const all = [...same, node('cross', ['a', 'b', 'cross-fresh'])];
  const crossed = reconcile(images, all, joined);
  assert.notEqual(crossed.owners.cross, before.owners.a);
  assert.notEqual(crossed.owners.cross, before.owners.b);
  assert.equal(crossed.owners['cross-fresh'], crossed.owners.cross);
  assert.equal(crossed.owners.a, before.owners.a);
  assert.equal(crossed.owners.b, before.owners.b);
});

test('removing a cross-group input preserves both group identity and its original position after all source groups', () => {
  const images = ['a', 'b'].map(image);
  const initial = [node('a-node', ['a']), node('b-node', ['b'])];
  const before = reconcile(images, initial);
  const joined = [...initial, node('cross', ['a', 'b'])];
  const cross = reconcile(images, joined, before);
  const changed = [...initial, node('cross', ['a'])];
  const after = reconcile(images, changed, cross);
  assert.equal(after.owners.cross, cross.owners.cross);
  assert.equal(after.groupSortOrder![after.owners.cross], cross.groupSortOrder![cross.owners.cross]);
  const placed = arrange(images, changed, after);
  assert(placed.get('cross')!.x > placed.get('b-node')!.x);
  assert.deepEqual(reconcile(images, joined, cross), cross, 'undo restores the saved group state');
});

test('changing an earlier group to reference a later group does not reorder either group', () => {
  const images = ['a', 'b'].map(image);
  const initial = [node('a-node', ['a']), node('b-node', ['b'])];
  const before = reconcile(images, initial);
  const changed = [node('a-node', ['b']), initial[1]];
  const after = reconcile(images, changed, before);
  assert.equal(after.owners['a-node'], before.owners['a-node']);
  assert.equal(after.owners.b, before.owners.b);
  assert.equal(after.owners.a, undefined, 'a disconnected former input returns to the standalone area');
  const placed = arrange(images, changed, after);
  assert(placed.get('a-node')!.x < placed.get('b-node')!.x);
  assert(placed.get('a')!.y > placed.get('a-node')!.y + 533);
});

test('legacy snapshots derive missing frozen placement keys once and keep them after reference changes', () => {
  const images = ['a', 'b'].map(image);
  const initial = [node('a-node', ['a']), node('b-node', ['b']), node('cross', ['a', 'b'])];
  const legacy = reconcile(images, initial);
  delete legacy.groupSortOrder;
  const migrated = reconcile(images, initial, legacy);
  const changed = [initial[0], initial[1], node('cross', ['a'])];
  const after = reconcile(images, changed, migrated);
  assert.deepEqual(after.groupSortOrder, migrated.groupSortOrder);
  assert(arrange(images, changed, after).get('cross')!.x > arrange(images, changed, after).get('b-node')!.x);
});

test('video arrangement wraps the sixth group across stages and places detached items below the actual result bounds', () => {
  let images = ['a', 'b'].map(image);
  let nodes = [node('a-node', ['a']), node('b-node', ['b'])];
  let state = reconcile(images, nodes);
  nodes = [...nodes, node('cross', ['a', 'b'])];
  state = reconcile(images, nodes, state);
  for (const id of ['d', 'e', 'f']) {
    images = [...images, image(id)];
    nodes = [...nodes, node(`${id}-node`, [id])];
    state = reconcile(images, nodes, state);
  }
  images = [...images, image('standalone')];
  state = reconcile(images, nodes, state);
  const placed = arrange(images, nodes, state);
  const firstRowBottom = Math.max(...['a-node', 'b-node', 'cross', 'd-node', 'e-node'].map(id => placed.get(id)!.y + 533));
  assert.equal(placed.get('f-node')!.y, firstRowBottom + 240);
  assert.equal(placed.get('standalone')!.y, placed.get('f-node')!.y + 533 + 240);
  assert.deepEqual(arrange(images, nodes, state), placed);
});
