import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrangeImages, canvasNodes, canvasSafeArea, fitImages, boundsOf, type CanvasImage } from '../src/canvas.ts';
const fixtures = (count: number): CanvasImage[] => Array.from({ length: count }, (_, i) => ({
  id: String(i), name: String(i), url: '', x: i * 17, y: -i * 53,
  width: 240 + i % 3 * 60, height: 300 + i % 4 * 90,
  fusion: i % 3 !== 0 ? { prompt: 'keep me', ratio: 'auto', resolution: '2K' } : undefined,
}));
function assertNoOverlap(items: CanvasImage[]) {
  const nodes = canvasNodes(items);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
      `${a.id} overlaps ${b.id}`);
  }
}
for (const viewport of [{width:1816,height:1180},{width:1280,height:752},{width:1024,height:852},{width:640,height:1100}]) {
  test(`arrange and fit ${viewport.width}x${viewport.height}`, () => {
    for (const count of [1,2,3,7,20]) {
      const input = fixtures(count), original = JSON.stringify(input);
      const arranged = arrangeImages(input, 0, viewport);
      assert.equal(JSON.stringify(input), original);
      assert.deepEqual(arranged.map(n=>n.id),input.map(n=>n.id));
      assert.deepEqual(arrangeImages(arranged,0,viewport),arranged);
      for(const n of arranged) if(n.fusion) {
        assert.equal(n.fusion.position!.x - n.x - n.width,80);
        const editor = canvasNodes([n]).find(node => node.id === `${n.id}:fusion`)!;
        assert.equal(editor.y + editor.height / 2,n.y + n.height / 2);
        assert.equal(n.fusion.prompt,'keep me');
      }
      assertNoOverlap(arranged);
      const related = boundsOf(canvasNodes(arranged.filter(n=>n.fusion)));
      if (related) for (const standalone of arranged.filter(n=>!n.fusion)) {
        assert(standalone.y > related.y + related.height);
      }
      const nodes=canvasNodes(arranged),b=boundsOf(nodes)!,a=canvasSafeArea(viewport.width,viewport.height),v=fitImages(nodes,viewport.width,viewport.height);
      assert(v.zoom<=1&&v.zoom>=.03);
      assert(b.x*v.zoom+v.x>=a.x-1e-6);
      assert(b.y*v.zoom+v.y>=a.y-1e-6);
      assert((b.x+b.width)*v.zoom+v.x<=a.x+a.width+1e-6);
      assert((b.y+b.height)*v.zoom+v.y<=a.y+a.height+1e-6);
    }
  });
}
test('viewport aspect ratio changes the arranged column count',()=>{
  const input=fixtures(12).map(n=>({...n, width:240, height:300, fusion:undefined}));
  const wide=arrangeImages(input,0,{width:2000,height:650});
  const tall=arrangeImages(input,0,{width:700,height:1200});
  assert(wide.filter(n=>n.y===0).length>tall.filter(n=>n.y===0).length);
});
test('empty and minimum zoom are defined',()=>{
  assert.deepEqual(arrangeImages([]),[]);
  assert.deepEqual(fitImages([],100,100),{x:0,y:0,zoom:1});
  assert.equal(fitImages([{...fixtures(1)[0],width:1e6,height:1e6}],1000,800).zoom,.03);
});

test('source chains retain their relationships and standalone images occupy the bottom zone',()=>{
 const image=(id:string,sourceImageId?:string):CanvasImage=>({id,name:id,url:'',x:20,y:90,width:100,height:150,sourceImageId});
 const input=[image('solo'),image('child','root'),{...image('root'),fusion:{prompt:'keep',ratio:'auto',resolution:'2K'}},image('grandchild','child'),image('orphan','deleted')];
 const arranged=arrangeImages(input,50);
 const get=(id:string)=>arranged.find(n=>n.id===id)!;
 assert.equal(get('root').x,50);
 assert(get('child').x>=get('root').x+get('root').width+80);
 assert(get('grandchild').x>=get('child').x+get('child').width+80);
 assert.deepEqual(arranged.map(n=>[n.id,n.sourceImageId]),input.map(n=>[n.id,n.sourceImageId]));
 assertNoOverlap(arranged);
 const group=boundsOf(canvasNodes(arranged.filter(n=>['root','child','grandchild'].includes(n.id))))!;
 for(const id of ['solo','orphan']) assert(get(id).y>group.y+group.height);
 assert.deepEqual(arrangeImages(arranged,50),arranged);
});

const material = (id: string, extra: Partial<CanvasImage> = {}): CanvasImage => ({
  id, name: id, url: `current:${id}`, x: 800, y: -100, width: 100, height: 150, ...extra,
});
const batchEditor = (id: string, inputs: CanvasImage[]): CanvasImage => ({
  ...material(id), nodeOnly: true,
  fusion: { kind: 'flat', batchFlat: true, prompt: 'preserve this prompt', ratio: 'auto', resolution: '2K',
    references: inputs.map(input => ({ id: `ref:${input.id}`, name: input.name, sourceImageId: input.id, url: input.url })) },
});
const layoutPayload = (items: CanvasImage[]) => items.map(({ x: _x, y: _y, fusion, ...item }) => ({
  ...item, fusion: fusion && { ...fusion, position: undefined },
}));
// An extremely tall, narrow viewport makes a single column the best fitting
// arrangement, so these assertions test group order rather than packing choices.
const singleColumnViewport = { width: 240, height: 100000 };
function arrangeRegression(input: CanvasImage[], viewport = singleColumnViewport) {
  const original = JSON.stringify(input);
  const arranged = arrangeImages(input, 0, viewport);
  assert.equal(JSON.stringify(input), original, 'layout must not mutate its input');
  assert.deepEqual(arranged.map(item => item.id), input.map(item => item.id), 'layout must retain every record');
  assert.deepEqual(layoutPayload(arranged), layoutPayload(input), 'layout must not rewrite stored relationships');
  assert.deepEqual(arrangeImages(arranged, 0, viewport), arranged, 'repeated layout must be stable');
  assertNoOverlap(arranged);
  return arranged;
}
function visibleNode(items: CanvasImage[], id: string) {
  const node = canvasNodes(items).find(item => item.id === id);
  assert(node, `missing visible node ${id}`);
  return node;
}

test('one task gathers old and new standalone inputs by image ID in reference order', () => {
  const old = Array.from({ length: 4 }, (_, i) => material(`old-${i}`, { layoutTaskId: 'removed-task' }));
  const recent = Array.from({ length: 4 }, (_, i) => material(`new-${i}`));
  const referenceOrder = [recent[2], old[3], recent[0], old[0], old[2], recent[3], old[1], recent[1]];
  const editor = batchEditor('batch', referenceOrder);
  editor.fusion!.references = editor.fusion!.references!.map(reference => ({ ...reference, url: `restored:${reference.sourceImageId}` }));
  editor.fusion!.references.push({ id: 'missing', name: 'deleted input', sourceImageId: 'missing-image', url: 'missing:url' });
  const arranged = arrangeRegression([...old, ...recent, editor]);
  const inputs = referenceOrder.map(input => visibleNode(arranged, input.id));
  const task = visibleNode(arranged, 'batch:fusion');
  for (const input of inputs) assert.equal(input.x + input.width + 80, task.x);
  for (let i = 1; i < inputs.length; i++) assert.equal(inputs[i].y, inputs[i - 1].y + inputs[i - 1].height + 120);
});

test('a shared standalone input stays with its valid original owner even when another editor appears first', () => {
  const shared = material('shared', { layoutTaskId: 'original' });
  const firstOwn = material('first-own');
  const originalOwn = material('original-own');
  const first = batchEditor('first', [shared, firstOwn]);
  const original = batchEditor('original', [originalOwn, shared]);
  const arranged = arrangeRegression([shared, firstOwn, originalOwn, first, original]);
  const sharedNode = visibleNode(arranged, shared.id);
  const ownerInput = visibleNode(arranged, originalOwn.id);
  const ownerEditor = visibleNode(arranged, 'original:fusion');
  assert.equal(sharedNode.x, ownerInput.x);
  assert.equal(sharedNode.y, ownerInput.y + ownerInput.height + 120);
  assert.equal(sharedNode.x + sharedNode.width + 80, ownerEditor.x);
  assert(visibleNode(arranged, 'first:fusion').x > ownerEditor.x, 'the consuming task follows its shared-input owner');
});

test('an invalid shared-input owner falls back to the first referencing editor', () => {
  for (const staleOwner of ['deleted-editor', 'unrelated-editor']) {
    const shared = material('shared', { layoutTaskId: staleOwner });
    const firstOwn = material('first-own');
    const secondOwn = material('second-own');
    const unrelatedOwn = material('unrelated-own');
    const unrelated = batchEditor('unrelated-editor', [unrelatedOwn]);
    const first = batchEditor('first', [firstOwn, shared]);
    const second = batchEditor('second', [shared, secondOwn]);
    const arranged = arrangeRegression([shared, firstOwn, secondOwn, unrelatedOwn, unrelated, first, second]);
    const sharedNode = visibleNode(arranged, shared.id);
    const firstInput = visibleNode(arranged, firstOwn.id);
    const firstEditor = visibleNode(arranged, 'first:fusion');
    assert.equal(sharedNode.x, firstInput.x, staleOwner);
    assert.equal(sharedNode.y, firstInput.y + firstInput.height + 120, staleOwner);
    assert.equal(sharedNode.x + sharedNode.width + 80, firstEditor.x, staleOwner);
    assert(visibleNode(arranged, 'second:fusion').x > firstEditor.x, staleOwner);
  }
});

test('a cross-group reference does not adopt an existing single-input workflow tree', () => {
  const source = material('source', { fusion: { prompt: 'original workflow', ratio: 'auto', resolution: '2K' } });
  const output = material('output', { generatedByEditorId: source.id });
  const fresh = material('fresh');
  const consumer = batchEditor('consumer', [source, fresh]);
  consumer.fusion!.references![0].url = 'restored:source';
  const arranged = arrangeRegression([source, output, fresh, consumer]);
  const originalSource = visibleNode(arranged, source.id);
  const originalEditor = visibleNode(arranged, 'source:fusion');
  const originalOutput = visibleNode(arranged, output.id);
  const consumerInput = visibleNode(arranged, fresh.id);
  const consumerEditor = visibleNode(arranged, 'consumer:fusion');
  assert.equal(originalEditor.x, originalSource.x + originalSource.width + 80);
  assert.equal(originalOutput.x, originalEditor.x + originalEditor.width + 80);
  assert(consumerInput.x > originalOutput.x + originalOutput.width);
  assert.equal(consumerEditor.x, consumerInput.x + consumerInput.width + 80);
});

test('complete groups follow editor creation order even when the later task uses older inputs', () => {
  const oldA = material('old-a'), oldB = material('old-b');
  const newA = material('new-a'), newB = material('new-b');
  const first = batchEditor('first-task', [newB, newA]);
  const second = batchEditor('second-task', [oldB, oldA]);
  const arranged = arrangeRegression([oldA, oldB, newA, newB, first, second]);
  const firstBounds = boundsOf(canvasNodes(arranged.filter(item => [newA.id, newB.id, first.id].includes(item.id))))!;
  const secondBounds = boundsOf(canvasNodes(arranged.filter(item => [oldA.id, oldB.id, second.id].includes(item.id))))!;
  assert.equal(firstBounds.x, secondBounds.x, 'the tall viewport must pack complete groups in one column');
  assert(secondBounds.y >= firstBounds.y + firstBounds.height + 240);
});

test('direct-operation groups keep their first result order even after an editor is added later', () => {
  for (const addEditor of [false, true]) {
    const old = material('old');
    const recent = material('recent');
    const firstResult = material('first-result', { sourceImageId: recent.id, operation: 'cutout' });
    const laterResult = material('later-result', { sourceImageId: old.id, operation: 'cutout' });
    const addedEditor = material('added-editor', { nodeOnly: true, editorSourceId: recent.id,
      fusion: { prompt: 'added after both results', ratio: 'auto', resolution: '2K' } });
    const arranged = arrangeRegression([old, recent, firstResult, laterResult, ...(addEditor ? [addedEditor] : [])]);
    const firstBounds = boundsOf(canvasNodes(arranged.filter(item => [recent.id, firstResult.id, addedEditor.id].includes(item.id))))!;
    const secondBounds = boundsOf(canvasNodes(arranged.filter(item => [old.id, laterResult.id].includes(item.id))))!;
    assert.equal(firstBounds.x, secondBounds.x, 'the tall viewport must pack direct-operation groups in one column');
    assert(secondBounds.y >= firstBounds.y + firstBounds.height + 240, `added editor: ${addEditor}`);
  }
});
