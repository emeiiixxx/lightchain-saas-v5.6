import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centerAddedFlowBranches, type LocalFlowVertex } from '../src/flow-local-centering.ts';
import { FLOW_BRANCH_GAP } from '../src/canvas-connected-layout.ts';
import { canvasNodes, createFusionEditor, createMergeEditor, type CanvasImage } from '../src/canvas.ts';
import { centerAddedFusionBranches } from '../src/fusion-local-centering.ts';
import { createMaterialWorkflow, materialWorkflowSize } from '../src/material-workflow.ts';
import { centerVideoFlowAddition, moveVideoFlowNodes, pinVideoFlowPositions } from '../src/video-flow-addition-layout.ts';

const v = (id: string, kind: LocalFlowVertex['kind'], sources: string[], x: number, y: number, height: number): LocalFlowVertex =>
  ({ id, kind, sources, x, y, width: 320, height });
const apply = (before: LocalFlowVertex[], after: LocalFlowVertex[], others: string[] = []) => {
  const positions = centerAddedFlowBranches(before, after, {
    owners: Object.fromEntries(after.map(item => [item.id, others.includes(item.id) ? 'other' : 'group'])),
    order: Object.fromEntries(after.map((item, i) => [item.id, i])),
  });
  return new Map(after.map(vertex => [vertex.id, { ...vertex, ...positions.get(vertex.id) }]));
};
const center = (vertex: LocalFlowVertex) => vertex.y + vertex.height / 2;
const stackCenter = (upper: LocalFlowVertex, lower: LocalFlowVertex) => (upper.y + lower.y + lower.height) / 2;

test('editors with partially shared inputs and their result trees are spaced and centered together', () => {
  const a = v('A', 'media', [], -600, 0, 300);
  const b = v('B', 'media', [], -600, 380, 150);
  const edit = v('editAB', 'workflow', ['A', 'B'], -200, 65, 400);
  const output = v('outAB', 'media', [edit.id], 200, -385, 1300);
  const extra = v('unrelated', 'media', [], 300, 500, 650);
  const other = v('otherGroup', 'workflow', ['A'], -40, -300, 100);
  const old = [a, b, edit, output, extra, other];
  const editA = v('editA', 'workflow', ['A'], -200, -50, 400);
  const added = apply(old, [...old, editA], [other.id]);
  assert(added.get(editA.id)!.y >= added.get(edit.id)!.y + edit.height + FLOW_BRANCH_GAP);
  assert.equal(stackCenter(added.get(edit.id)!, added.get(editA.id)!), stackCenter(a, b));
  assert.equal(center(added.get(output.id)!), center(added.get(edit.id)!));
  const prior = [...added.values()];
  const small = v('small', 'media', [editA.id], 200, -100, 300);
  const tall = v('tall', 'media', [editA.id], 200, 0, 600);
  const generated = apply(prior, [...prior, small, tall], [other.id]);
  const up = generated.get(output.id)!, s = generated.get(small.id)!, t = generated.get(tall.id)!;
  assert(s.y >= up.y + up.height + FLOW_BRANCH_GAP, 'results of different editors do not overlap');
  assert(t.y >= s.y + s.height + FLOW_BRANCH_GAP);
  assert.equal(stackCenter(s, t), center(generated.get(editA.id)!));
  assert.equal(center(up), center(generated.get(edit.id)!));
  assert.equal(stackCenter(generated.get(edit.id)!, generated.get(editA.id)!), stackCenter(a, b));
  for (const fixed of [a, b, extra, other]) assert.deepEqual(generated.get(fixed.id), fixed);
});

test('a later join sharing an input with its ancestor is not laid out as its sibling', () => {
  const a = v('A', 'media', [], 0, 10, 100);
  const first = v('first', 'workflow', ['A'], 400, 500, 200);
  const result = v('result', 'media', [first.id], 800, 500, 300);
  const previous = [a, first, result];
  const join = v('join', 'workflow', ['A', result.id], 0, 0, 240);
  const placed = apply(previous, [...previous, join]);
  for (const fixed of previous) assert.deepEqual(placed.get(fixed.id), fixed);
  const joined = placed.get(join.id)!;
  assert.equal(center(joined), stackCenter(a, result));
  assert(joined.x > result.x + result.width);
});

test('adding an editor for A after an A+B editor works without Arrange on both Flow workspaces', () => {
  const images: CanvasImage[] = ['A', 'B'].map((id, i) => ({
    id, name: id, url: id, width: 320, height: 200, x: 0, y: i * 280,
  }));
  const merge = createMergeEditor(images, ['A', 'B'], 'first')!;
  const before = centerAddedFusionBranches(images, [...images, merge]);
  const second = createFusionEditor(before, 'A', 'second')!;
  const added = centerAddedFusionBranches(before, [...before, second]);
  assert.deepEqual(added.slice(0, 2), images);
  const nodes = canvasNodes(added);
  const firstBox = nodes.find(item => item.id === 'first:fusion')!;
  const secondBox = nodes.find(item => item.id === 'second:fusion')!;
  assert(secondBox.y >= firstBox.y + firstBox.height + FLOW_BRANCH_GAP);
  assert.equal((firstBox.y + secondBox.y + secondBox.height) / 2, 240);

  const material = (id: string, refs: CanvasImage[]) => ({
    ...createMaterialWorkflow(0, 0, 'quick'), id,
    references: refs.map(item => ({ id: item.id, sourceImageId: item.id, name: item.name, url: item.url, kind: 'image' as const })),
  });
  const initial = { images, workflows: [], materialWorkflows: [material('first', images)] };
  const videoBefore = centerVideoFlowAddition({ ...initial, materialWorkflows: [] }, initial);
  const video = centerVideoFlowAddition(videoBefore, {
    ...videoBefore, materialWorkflows: [...videoBefore.materialWorkflows, material('second', [images[0]])],
  });
  assert.deepEqual(video.images, images);
  const [upper, lower] = video.materialWorkflows;
  assert(lower.y >= upper.y + materialWorkflowSize(upper).height + FLOW_BRANCH_GAP);
  assert.equal((upper.y + lower.y + materialWorkflowSize(lower).height) / 2, 240);
});

test('a manually moved result does not push its upstream editor away from the input', () => {
  const input = v('input', 'media', [], 0, 0, 200);
  const editor = v('editor', 'workflow', [input.id], 400, -50, 300);
  const pinned = { ...v('pinned', 'media', [editor.id], 800, 0, 200), positionPinned: true };
  const result = v('result', 'media', [editor.id], 800, 300, 200);
  const unrelated = v('unrelated', 'workflow', [], 900, 300, 600);
  const previous = [input, editor, pinned, result, unrelated];
  const added = [...previous, v('newResult', 'media', [editor.id], 800, 600, 200)];
  const layout = apply(previous, added, [unrelated.id]);
  assert.deepEqual(layout.get(input.id), input);
  assert.deepEqual(layout.get(pinned.id), pinned);
  assert.deepEqual(layout.get(unrelated.id), unrelated);
  assert.equal(center(layout.get(editor.id)!), center(input), 'a result collision must not move the upstream anchor');
  const column = ['pinned', 'result', 'newResult'].map(id => layout.get(id)!).sort((a, b) => a.y - b.y);
  for (let i = 1; i < column.length; i++) {
    assert(column[i].y >= column[i - 1].y + column[i - 1].height + FLOW_BRANCH_GAP);
  }
  // Repeating the same addition from its already laid-out geometry cannot
  // accumulate offsets around the fixed result.
  assert.deepEqual(apply(previous, [...layout.values()], [unrelated.id]), layout);
});

test('new results center on a fixed editor without moving that editor or its input', () => {
  const input = v('input', 'media', [], 0, 0, 200);
  const editor = { ...v('editor', 'workflow', [input.id], 400, 700, 300), positionPinned: true };
  const first = v('first', 'media', [editor.id], 800, 700, 200);
  const previous = [input, editor, first];
  const placed = apply(previous, [...previous, v('second', 'media', [editor.id], 800, 700, 200)]);
  assert.deepEqual(placed.get(input.id), input);
  assert.deepEqual(placed.get(editor.id), editor);
  assert.equal(stackCenter(placed.get(first.id)!, placed.get('second')!), center(editor));
});

test('video dragging commits only the final displaced objects as manual positions', () => {
  const image: CanvasImage = { id: 'image', name: 'image', url: 'image', width: 320, height: 200, x: 0, y: 0 };
  const editor = createMaterialWorkflow(400, 0, 'quick');
  const initial = { images: [image], workflows: [], materialWorkflows: [editor] };
  const during = moveVideoFlowNodes(initial, new Map([[image.id, { x: 40, y: 60 }]]));
  assert.equal(during.images[0].positionPinned, undefined, 'pointer movement alone must not create a permanent pin');
  const returned = moveVideoFlowNodes(during, new Map([[image.id, { x: 0, y: 0 }]]));
  const unchanged = pinVideoFlowPositions(returned, []);
  assert.deepEqual(unchanged.images, initial.images);
  assert.deepEqual(unchanged.materialWorkflows, initial.materialWorkflows);
  const released = pinVideoFlowPositions(during, [image.id]);
  assert.equal(released.images[0].positionPinned, true);
  assert.deepEqual(released.materialWorkflows[0], editor, 'moving an image must not pin its editor');
});
