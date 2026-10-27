import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrangeImages, canvasNodes, deleteCanvasSelection, restoreWorkflowMain, workflowSources, type CanvasImage } from '../src/canvas.ts';
import { canvasLayoutGroups, withCanvasLayoutGroups } from '../src/canvas-layout-groups.ts';
import { withCanvasOriginOrder } from '../src/canvas-origin-order.ts';

const image = (id: string, extra: Partial<CanvasImage> = {}): CanvasImage => ({
  id, name: id, url: id, x: 0, y: 0, width: 100, height: 100, ...extra,
});
const editor = (id: string, inputs: string[]): CanvasImage => image(id, {
  nodeOnly: true, fusion: { kind: 'merge', prompt: '', ratio: 'auto', resolution: '2K',
    references: inputs.map(sourceImageId => ({ id: sourceImageId, sourceImageId, name: sourceImageId, url: sourceImageId })) },
});
const snapshot = (items: CanvasImage[], previous: CanvasImage[] = []) =>
  withCanvasLayoutGroups(withCanvasOriginOrder(items, previous), previous);
const replaceInputs = (items: CanvasImage[], id: string, inputs: string[]) =>
  items.map(item => item.id === id ? { ...item, fusion: { ...item.fusion!, references: editor(id, inputs).fusion!.references } } : item);
const nodes = (items: CanvasImage[]) => new Map(canvasNodes(arrangeImages(items)).map(item => [item.id, item]));

function twoGroups() {
  let items = snapshot(['a1', 'b1', 'b2', 'a2'].map(id => image(id)));
  items = snapshot([...items, editor('a', ['a1', 'a2'])], items);
  return snapshot([...items, editor('b', ['b1', 'b2'])], items);
}

test('deleting the oldest main input preserves the existing group and its position in the group sequence', () => {
  const before = twoGroups();
  const original = canvasLayoutGroups(before);
  const after = snapshot(replaceInputs(before.filter(item => item.id !== 'a1'), 'a', ['a2']), before);
  const state = canvasLayoutGroups(after);
  const group = original.owners['a:fusion'];
  assert.equal(state.owners['a:fusion'], group);
  assert.equal(state.groupOrder[group], original.groupOrder[group]);
  const placed = nodes(after);
  assert(placed.get('a:fusion')!.x < placed.get('b:fusion')!.x);
});

test('replacing all inputs with later uploads keeps the original group sequence and releases detached media', () => {
  const before = twoGroups();
  const original = canvasLayoutGroups(before);
  const uploaded = snapshot([...before, image('late1'), image('late2')], before);
  const after = snapshot(replaceInputs(uploaded, 'a', ['late1', 'late2']), uploaded);
  const state = canvasLayoutGroups(after);
  const group = original.owners['a:fusion'];
  assert.equal(state.owners['a:fusion'], group);
  assert.equal(state.owners.late1, group);
  assert.equal(state.owners.late2, group);
  assert.equal(state.owners.a1, undefined);
  assert.equal(state.owners.a2, undefined);
  const placed = nodes(after);
  assert(placed.get('a:fusion')!.x < placed.get('b:fusion')!.x);
  assert(placed.get('a1')!.y > placed.get('a:fusion')!.y);
});

test('removing one cross-group reference does not merge the previously separate group into its remaining source', () => {
  const before = twoGroups();
  const cross = snapshot([...before, editor('cross', ['a1', 'b1'])], before);
  const original = canvasLayoutGroups(cross);
  const after = snapshot(replaceInputs(cross, 'cross', ['a1']), cross);
  const state = canvasLayoutGroups(after);
  assert.equal(state.owners['cross:fusion'], original.owners['cross:fusion']);
  assert.notEqual(state.owners['cross:fusion'], state.owners['a:fusion']);
  assert.equal(state.owners.a1, original.owners.a1);
  assert.equal(state.owners.b1, original.owners.b1);
  assert.equal(state.groupSortOrder![state.owners['cross:fusion']], original.groupSortOrder![original.owners['cross:fusion']]);
  const placed = nodes(after);
  const source = placed.get('a:fusion')!;
  assert(placed.get('cross:fusion')!.x >= source.x + source.width + 240);
  assert(placed.get('b:fusion')!.x < placed.get('cross:fusion')!.x, 'removing a dependency must not pull the existing group ahead of its old source');
});

test('replacing an existing group input with a later group keeps both groups in their saved sequence', () => {
  const before = twoGroups();
  const original = canvasLayoutGroups(before);
  const after = snapshot(replaceInputs(before, 'a', ['a2', 'b1']), before);
  const state = canvasLayoutGroups(after);
  const group = original.owners['a:fusion'];
  assert.equal(state.owners['a:fusion'], group);
  assert.equal(state.groupSortOrder![group], original.groupSortOrder![group]);
  assert.equal(state.owners.b1, original.owners.b1);
  const placed = nodes(after);
  assert(placed.get('a:fusion')!.x < placed.get('b:fusion')!.x);
});

test('later uploads remain after a cross-group ordering boundary even when its later original source is deleted', () => {
  const before = twoGroups();
  const cross = snapshot([...before, editor('cross', ['a1', 'b1'])], before);
  const kept = cross.filter(item => !['b1', 'b2', 'b', 'a2'].includes(item.id));
  const detached = snapshot(replaceInputs(replaceInputs(kept, 'a', ['a1']), 'cross', ['a1']), cross);
  const next = snapshot([...detached, image('new1'), image('new2'), editor('new', ['new1', 'new2'])], detached);
  const state = canvasLayoutGroups(next);
  assert(state.groupSortOrder![state.owners['new:fusion']] > state.groupSortOrder![state.owners['cross:fusion']]);
  const placed = nodes(next);
  assert(placed.get('cross:fusion')!.x < placed.get('new:fusion')!.x);
});

test('a new node with one existing source group extends it and adopts its independent input', () => {
  const before = twoGroups();
  const next = snapshot([...before, image('new'), editor('child', ['a1', 'new'])], before);
  const state = canvasLayoutGroups(next);
  assert.equal(state.owners['child:fusion'], state.owners['a:fusion']);
  assert.equal(state.owners.new, state.owners['a:fusion']);
});

test('new independent groups follow existing groups after old source removal, and undo restores membership', () => {
  const before = twoGroups();
  const changed = snapshot(replaceInputs(before.filter(item => item.id !== 'a1'), 'a', ['a2']), before);
  const next = snapshot([...changed, image('new1'), image('new2'), editor('new', ['new1', 'new2'])], changed);
  const state = canvasLayoutGroups(next);
  assert(state.groupOrder[state.owners['new:fusion']] > state.groupOrder[state.owners['b:fusion']]);
  assert.deepEqual(snapshot(before, next), before, 'restoring a saved snapshot must preserve its own ordering metadata');
});

test('fully detached empty nodes and copied instances do not retain previous group ownership', () => {
  const before = twoGroups();
  const empty = snapshot(replaceInputs(before, 'a', []), before);
  assert.equal(canvasLayoutGroups(empty).owners['a:fusion'], undefined);
  const source = before.find(item => item.id === 'a1')!;
  const copy = snapshot([...before, { ...source, id: 'copy' }], before);
  assert.equal(canvasLayoutGroups(copy).owners.copy, undefined);
  const connected = snapshot([...copy, editor('copy-node', ['copy'])], copy);
  const state = canvasLayoutGroups(connected);
  assert.notEqual(state.owners.copy, state.owners.a1);
});

test('direct batch processing keeps one source/result group without a shared editor', () => {
  const items = snapshot([
    image('one', { layoutTaskId: 'direct' }), image('two', { layoutTaskId: 'direct' }),
    image('one-result', { sourceImageId: 'one' }), image('two-result', { sourceImageId: 'two' }),
  ]);
  const state = canvasLayoutGroups(items);
  assert.equal(state.owners.one, state.owners.two);
  assert.equal(state.owners['one-result'], state.owners.two);
  assert.equal(state.owners['two-result'], state.owners.two);
});

test('legacy direct-batch ownership is established before a downstream node classifies its input groups', () => {
  const items = snapshot([
    image('one', { layoutTaskId: 'direct' }), image('two', { layoutTaskId: 'direct' }),
    image('one-result', { sourceImageId: 'one' }), image('two-result', { sourceImageId: 'two' }),
    editor('consumer', ['one-result', 'two-result']),
  ]);
  const state = canvasLayoutGroups(items);
  assert.equal(state.owners['consumer:fusion'], state.owners.one);
  assert.equal(state.owners['consumer:fusion'], state.owners.two);
});

test('a leftover direct-batch tag cannot reclaim a standalone input after it joins another group', () => {
  const before = snapshot([
    image('one', { layoutTaskId: 'direct' }), image('two', { layoutTaskId: 'direct' }),
    image('one-result', { sourceImageId: 'one' }), image('two-result', { sourceImageId: 'two' }),
    image('x1'), image('x2'), editor('x', ['x1', 'x2']),
  ]);
  const detached = snapshot(before.filter(item => item.id !== 'one-result'), before);
  assert.equal(canvasLayoutGroups(detached).owners.one, undefined);
  const joined = snapshot(replaceInputs(detached, 'x', ['x1', 'x2', 'one']), detached);
  const withResult = snapshot([...joined, image('new-cutout', { sourceImageId: 'one' })], joined);
  const state = canvasLayoutGroups(withResult);
  assert.equal(state.owners.one, state.owners['x:fusion']);
  assert.equal(state.owners['new-cutout'], state.owners['x:fusion']);
  assert.notEqual(state.owners['x:fusion'], state.owners.two);
  const directAgain = snapshot([...detached, image('new-cutout', { sourceImageId: 'one' })], detached);
  assert.notEqual(canvasLayoutGroups(directAgain).owners.one, canvasLayoutGroups(directAgain).owners.two);
});

test('legacy first-consumer hints preserve a live original owner before later references are classified', () => {
  const items = snapshot([
    image('shared', { layoutTaskId: 'original' }), image('first-own'), image('original-own'),
    editor('first', ['first-own', 'shared']), editor('original', ['original-own', 'shared']),
  ]);
  const state = canvasLayoutGroups(items);
  assert.equal(state.owners.shared, state.owners['original:fusion']);
  assert.equal(state.owners['original-own'], state.owners['original:fusion']);
  assert.equal(state.owners['first:fusion'], state.owners['original:fusion']);
});

test('refilling a source-less editor preserves its identity, original group order and existing result links', () => {
  const before = snapshot([
    image('main', { fusion: { kind: 'fusion', prompt: 'keep', ratio: 'auto', resolution: '2K' } }),
    image('result', { generatedByEditorId: 'main' }),
    image('later', { fusion: { kind: 'fusion', prompt: '', ratio: 'auto', resolution: '2K' } }),
  ]);
  const original = canvasLayoutGroups(before);
  const empty = snapshot(deleteCanvasSelection(before, ['main']), before);
  const filled = snapshot(restoreWorkflowMain(empty, 'main', image('replacement'), 'replacement'), empty);
  const restored = filled.find(item => item.id === 'main')!;
  const state = canvasLayoutGroups(filled);
  assert.equal(restored.nodeOnly, true);
  assert.deepEqual(workflowSources(filled, restored).map(item => item.id), ['replacement']);
  assert.equal(filled.find(item => item.id === 'result')!.generatedByEditorId, 'main');
  assert.equal(state.owners['main:fusion'], original.owners['main:fusion']);
  assert.equal(state.owners.result, original.owners.result);
  assert.equal(state.groupSortOrder![state.owners['main:fusion']], original.groupSortOrder![original.owners['main:fusion']]);
  const placed = nodes(filled);
  assert(placed.get('main:fusion')!.x < placed.get('later:fusion')!.x);
  assert(placed.get('result')!.x > placed.get('main:fusion')!.x);
});
