import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutConnectedGroup, type FlowLayoutVertex } from '../src/canvas-connected-layout.ts';
import { placeConnectedGroupStages, type ConnectedLayoutGroup } from '../src/canvas-group-placement.ts';

const vertex = (id: string, sources: string[] = [], height = 100): FlowLayoutVertex => ({
  id, sources, width: 100, height, kind: 'workflow',
});
const group = (...vertices: FlowLayoutVertex[]): ConnectedLayoutGroup => ({
  vertices, layout: layoutConnectedGroup(vertices, {}),
});
const point = (layout: ReturnType<typeof placeConnectedGroupStages>, id: string) => layout.positions.get(id)!;

test('the five-group row limit spans dependency stages', () => {
  const stages = [
    [group(vertex('a')), group(vertex('b'))],
    [group(vertex('c', ['a', 'b'])), group(vertex('d')), group(vertex('e')), group(vertex('f'))],
  ];
  const placed = placeConnectedGroupStages(stages, {});
  for (const [index, id] of ['a', 'b', 'c', 'd', 'e'].entries()) {
    assert.deepEqual(point(placed, id), { x: index * 340, y: 0 });
  }
  assert.deepEqual(point(placed, 'f'), { x: 0, y: 340 });
  assert.deepEqual(placeConnectedGroupStages(stages, {}), placed);
});

test('different group heights share the full row center across dependency stages', () => {
  const stages = [
    [group(vertex('a', [], 100)), group(vertex('b', [], 300))],
    [group(vertex('c', ['a', 'b'], 200)), group(vertex('d', [], 400)), group(vertex('e', [], 150)), group(vertex('f', [], 120))],
  ];
  const placed = placeConnectedGroupStages(stages, {});
  for (const item of stages.flat().slice(0, 5)) {
    const node = item.vertices[0];
    assert.equal(point(placed, node.id).y + node.height / 2, 200);
  }
  assert.deepEqual(point(placed, 'f'), { x: 0, y: 640 });
});

test('a dependency that wraps keeps upstream positions and starts below the previous row', () => {
  const upstream = ['a', 'b', 'c', 'd', 'e'].map(id => group(vertex(id)));
  const downstream = [group(vertex('f', ['e'])), group(vertex('g'))];
  const before = placeConnectedGroupStages([upstream], {});
  const inputBefore = JSON.stringify([...upstream, ...downstream].map(item => item.vertices));
  const placed = placeConnectedGroupStages([upstream, downstream], {});
  for (const id of ['a', 'b', 'c', 'd', 'e']) assert.deepEqual(point(placed, id), point(before, id));
  assert.equal(point(placed, 'f').y, 340);
  assert.equal(point(placed, 'g').y, 340);
  assert(point(placed, 'f').x >= point(placed, 'e').x + 180, 'real upstream input stays to the left');
  assert.equal(point(placed, 'g').x, point(placed, 'f').x + 340);
  assert.equal(JSON.stringify([...upstream, ...downstream].map(item => item.vertices)), inputBefore);
  assert.equal(placed.positions.size, 7, 'shared inputs are not copied into the downstream group');
});

test('the next row follows the actual bottom of a cross-group branch', () => {
  const fresh: FlowLayoutVertex = { ...vertex('fresh', [], 200), kind: 'media' };
  const stages = [
    [group(vertex('a')), group(vertex('b'))],
    [group(fresh, vertex('join', ['a', 'b', 'fresh'])), group(vertex('d')), group(vertex('e')), group(vertex('f'))],
  ];
  const placed = placeConnectedGroupStages(stages, {});
  const firstRowBottom = Math.max(...stages.flat().slice(0, 5).flatMap(item =>
    item.vertices.map(node => point(placed, node.id).y + node.height)));
  assert.equal(point(placed, 'f').x, 0);
  assert.equal(point(placed, 'f').y, firstRowBottom + 240);
  assert.equal(point(placed, 'fresh').x, point(placed, 'b').x, 'new input remains beside its real upstream peer');
  assert.equal(point(placed, 'd').x, point(placed, 'join').x + 340, 'packing uses the actual group right edge');
});

test('a long dependency chain wraps after its fifth group', () => {
  const stages = Array.from({ length: 12 }, (_, index) => [
    group(vertex(String(index), index ? [String(index - 1)] : [])),
  ]);
  const placed = placeConnectedGroupStages(stages, {});
  for (let index = 0; index < 12; index++) {
    assert.equal(point(placed, String(index)).y, Math.floor(index / 5) * 340);
  }
});
