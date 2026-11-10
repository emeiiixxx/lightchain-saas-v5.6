import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useCanvas, type CanvasImage } from '../src/design-workbench/useCanvas';
import { selectionBounds } from '../src/design-workbench/canvas-selection';
import { IMAGE_FILENAME_TOP_SPACE } from '../src/design-workbench/canvas-renderer';

// Exercise the actual hook and React updates without launching a browser.
// Pixel painting is outside this state/geometry suite. Reduced motion makes
// camera targets deterministic; the existing motion implementation is reused.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Element', 'Image', 'localStorage', 'MouseEvent'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver: class {
    constructor(private callback: (entries: unknown[]) => void) {}
    observe(target: Element) { this.callback([{ target, contentRect: { width: 1600, height: 1000 } }]); }
    disconnect() {}
  },
});
Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
Object.defineProperty(dom.window.HTMLImageElement.prototype, 'decode', { value: async () => {} });
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { value: () => null });
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getBoundingClientRect', {
  value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 1600, bottom: 1000, width: 1600, height: 1000, toJSON() {} }),
});

type Board = ReturnType<typeof useCanvas>;
type Asset = Omit<CanvasImage, 'x' | 'y'>;
function asset(name: string, width = 100, height = 100): Asset {
  const image = new dom.window.Image();
  image.src = `http://localhost/${name}.png`;
  Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } });
  return { id: name, name: `${name}.png`, image, url: image.src, mimeType: 'image/png', width, height };
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
}
async function withCanvas(run: (board: () => Board) => Promise<void>) {
  dom.window.localStorage.clear();
  const host = document.createElement('div');
  document.body.appendChild(host);
  let current!: Board;
  function Harness() {
    current = useCanvas(() => {}, 'dark');
    return createElement('div', null, createElement('canvas', { ref: current.canvasRef }));
  }
  const root = createRoot(host);
  try {
    await act(async () => { root.render(createElement(Harness)); });
    assert.equal(current.restored, true);
    assert.deepEqual(current.size, { width: 1600, height: 1000 });
    await run(() => current);
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
  }
}

test('manual additions select the batch and use current arranged content bounds plus filename space', async () => {
  await withCanvas(async board => {
    await act(async () => { board().addImages([asset('one', 100, 120), asset('two', 150, 120)]); });
    const first = board().images;
    assert.deepEqual(board().selectedIds, first.map(item => item.id));
    assert.equal(first[1].x - first[0].x, first[0].width + 80);
    assert.equal(first[1].y, first[0].y);
    assert.equal(first[0].contentGroupId, first[1].contentGroupId);
    const oldBounds = selectionBounds(first);
    const beforeLargeZoom = board().camera.zoom;
    await act(async () => { board().addImages([asset('large', 5000, 200)]); });
    const large = board().images.at(-1)!;
    const view = board().camera;
    assert.ok(view.zoom < beforeLargeZoom, 'shrink only when the new batch cannot fit');
    assert.ok(large.x * view.zoom + view.x >= 0 && (large.x + large.width) * view.zoom + view.x <= board().size.width);
    assert.ok(large.y * view.zoom + view.y - IMAGE_FILENAME_TOP_SPACE >= 0 && (large.y + large.height) * view.zoom + view.y <= board().size.height);
    near(large.y, oldBounds.y + oldBounds.height + 80 + IMAGE_FILENAME_TOP_SPACE / board().camera.zoom);
    assert.deepEqual(board().selectedIds, [large.id]);
    await act(async () => { board().arrange('vertical'); });
    const arranged = board().images.map(item => ({ ...item }));
    const arrangedBounds = selectionBounds(arranged);
    const arrangedZoom = board().camera.zoom;
    await act(async () => { board().addImages([asset('after-arrange')]); });
    const appended = board().images.at(-1)!;
    assert.equal(board().camera.zoom, arrangedZoom);
    near(appended.y, arrangedBounds.y + arrangedBounds.height + 80 + IMAGE_FILENAME_TOP_SPACE / arrangedZoom);
    assert.deepEqual(board().images.slice(0, -1), arranged, 'adding must not move existing arranged content');
  });
});

for (const modifier of ['ctrlKey', 'metaKey'] as const) {
  test(`canvas toolbar focus: ${modifier} copies and pastes the selection at the pointer without moving the view`, async () => {
    await withCanvas(async board => {
      const canvas = board().canvasRef.current!;
      const toolbar = document.createElement('div');
      toolbar.dataset.canvasUi = ''; toolbar.setAttribute('role', 'toolbar');
      const button = toolbar.appendChild(document.createElement('button'));
      canvas.parentElement!.appendChild(toolbar);
      const press = async (target: HTMLElement, key: string) => {
        const event = new dom.window.KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), [modifier]: true, bubbles: true, cancelable: true });
        await act(async () => { target.focus(); target.dispatchEvent(event); });
        return event.defaultPrevented;
      };
      assert.equal(await press(button, 'v'), false, 'an empty canvas clipboard does not consume native paste');
      await act(async () => {
        board().addImages([asset('pair-a'), asset('pair-b', 40, 80)], { point: { x: -60, y: 140 } });
        board().zoomAt(2, { x: 500, y: 360 });
      });
      const originals = [...board().images], camera = { ...board().camera };
      assert.equal(await press(button, 'c'), true);
      assert.equal(board().canPaste, true);
      await act(async () => { canvas.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 760, clientY: 320 })); });
      const editor = toolbar.appendChild(document.createElement('textarea'));
      assert.equal(await press(editor, 'v'), false, 'native text paste remains available');
      const dialog = toolbar.appendChild(document.createElement('dialog'));
      dialog.setAttribute('open', '');
      assert.equal(await press(button, 'v'), false);
      dialog.remove();
      assert.equal(board().images.length, originals.length);
      assert.equal(await press(button, 'v'), true);
      const copies = board().images.slice(originals.length);
      assert.deepEqual(board().images.slice(0, originals.length), originals);
      assert.deepEqual(board().selectedIds, copies.map(item => item.id));
      assert.equal(copies.length, 2);
      const bounds = selectionBounds(copies);
      near(bounds.x * camera.zoom + camera.x, 760);
      near(bounds.y * camera.zoom + camera.y, 320);
      near(copies[1].x - copies[0].x, originals[1].x - originals[0].x);
      near(copies[1].y - copies[0].y, originals[1].y - originals[0].y);
      assert.deepEqual(board().camera, camera);
      await act(async () => { board().undo(); });
      assert.deepEqual(board().images, originals, 'one undo removes the entire pasted batch');
      await act(async () => { board().selectMany(originals.map(item => item.id)); });
      assert.equal(await press(button, 'd'), true);
      const duplicated = selectionBounds(board().images.slice(originals.length));
      near(duplicated.x, selectionBounds(originals).x + 32);
      near(duplicated.y, selectionBounds(originals).y + 32);
    });
  });
}

test('right-click records world coordinates at menu opening and adds there without changing the camera', async () => {
  await withCanvas(async board => {
    await act(async () => { board().zoomAt(2, { x: 800, y: 500 }); });
    const beforeMenu = { ...board().camera };
    await act(async () => {
      board().canvasRef.current!.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 240, clientY: 180 }));
    });
    const point = board().contextMenu!.worldPoint!;
    near(point.x, (240 - beforeMenu.x) / beforeMenu.zoom);
    near(point.y, (180 - beforeMenu.y) / beforeMenu.zoom);
    await act(async () => { board().zoomAt(0.5, { x: 300, y: 200 }); });
    const camera = { ...board().camera };
    await act(async () => { board().addImages([asset('right-one'), asset('right-two', 80, 160)], { point }); });
    assert.equal(board().images[0].x, point.x);
    assert.equal(board().images[0].y, point.y);
    assert.equal(board().images[1].x, point.x + 180);
    assert.deepEqual(board().camera, camera);
    assert.deepEqual(board().selectedIds, board().images.map(item => item.id));
  });
});

test('toolbar placeholders keep exact pixels below all canvas content without moving existing objects', async () => {
  await withCanvas(async board => {
    await act(async () => { board().addImages([asset('source')], { point: { x: 0, y: 0 } }); });
    const source = board().images[0];
    await act(async () => { board().addImages([asset('obstacle', 300, 200)], { point: { x: 140, y: 0 } }); });
    const obstacle = board().images[1];
    await act(async () => { board().addImages([asset('chained-obstacle', 200, 200)], { point: { x: 960, y: 0 } }); });
    const chained = board().images[2];
    const original = board().images.map(item => ({ ...item }));
    const previousZoom = board().camera.zoom;
    let placeholders: CanvasImage[] = [];
    await act(async () => {
      placeholders = board().beginGeneration(source.id, 2, {
        taskRecordId: 'toolbar', outputSizes: [{ width: 500, height: 300 }, { width: 200, height: 600 }],
      });
    });
    assert.deepEqual(placeholders.map(item => [item.width, item.height]), [[500, 300], [200, 600]]);
    const filenameSpace = IMAGE_FILENAME_TOP_SPACE / Math.min(previousZoom, board().camera.zoom);
    assert.deepEqual(placeholders.map(item => item.x), [0, 580]);
    placeholders.forEach(item => near(item.y - filenameSpace, 440));
    assert.equal(placeholders[0].contentGroupId, source.contentGroupId);
    assert.deepEqual(board().images.find(item => item.id === source.id), source, 'references must remain in place');
    assert.deepEqual(board().images.find(item => item.id === obstacle.id), obstacle);
    assert.deepEqual(board().images.find(item => item.id === chained.id), chained);
    const camera = { ...board().camera };
    const before = board().images.map(item => ({ id: item.id, x: item.x, y: item.y }));
    await act(async () => { board().finishGeneration(placeholders.map(item => item.id), [asset('done-a', 500, 300), asset('done-b', 200, 600)]); });
    assert.deepEqual(board().images.map(item => ({ id: item.id, x: item.x, y: item.y })), before);
    assert.deepEqual(board().camera, camera);
    assert.ok(board().images.filter(item => placeholders.some(placeholder => placeholder.id === item.id)).every(item => !item.generating));
    const completed = board().images.map(item => ({ ...item }));
    await act(async () => { board().undo(); });
    assert.deepEqual(board().images, original, 'one undo removes the complete result row');
    await act(async () => { board().redo(); });
    assert.deepEqual(board().images, completed, 'redo restores the completed result row without loading');
    const currentObstacle = board().images.find(item => item.id === obstacle.id)!;
    const beforeCross = selectionBounds(board().images);
    let crossGroup: CanvasImage[] = [];
    await act(async () => { crossGroup = board().beginGeneration(source.id, 1, { sourceIds: [obstacle.id], outputSize: { width: 120, height: 150 }, taskRecordId: 'cross' }); });
    assert.equal(crossGroup[0].x, beforeCross.x);
    assert.ok(crossGroup[0].y >= beforeCross.y + beforeCross.height + 240 + IMAGE_FILENAME_TOP_SPACE);
    assert.deepEqual(board().images.find(item => item.id === source.id), source);
    assert.deepEqual(board().images.find(item => item.id === obstacle.id), currentObstacle);
    assert.notEqual(crossGroup[0].contentGroupId, source.contentGroupId);
    assert.notEqual(crossGroup[0].contentGroupId, obstacle.contentGroupId);
  });
});

test('sequential Agent output can continue beside its previous result while toolbar work occupies a lower row', async () => {
  await withCanvas(async board => {
    let first: CanvasImage[] = [];
    await act(async () => { first = board().beginGeneration(undefined, 1, { placement: 'agent', agentConversationId: 'chat-a', taskRecordId: 'round-one', generationIndex: 0, outputSize: { width: 200, height: 300 } }); });
    assert.equal(board().images.length, 1, 'unstarted images must not create waiting placeholders');
    const firstCamera = { ...board().camera };
    await act(async () => { board().finishGeneration([first[0].id], [asset('agent-first', 200, 300)]); });
    assert.deepEqual(board().camera, firstCamera);
    let toolbar: CanvasImage[] = [];
    await act(async () => { toolbar = board().beginGeneration(first[0].id, 1, { taskRecordId: 'parallel-toolbar', outputSize: { width: 200, height: 300 } }); });
    await act(async () => { board().setInteractionLocked(true); });
    const camera = { ...board().camera };
    const existing = board().images.map(item => ({ id: item.id, x: item.x, y: item.y }));
    let second: CanvasImage[] = [];
    await act(async () => { second = board().beginGeneration(undefined, 1, { placement: 'agent', agentConversationId: 'chat-a', taskRecordId: 'round-one', generationIndex: 1, outputSize: { width: 200, height: 300 } }); });
    assert.equal(second.length, 1, 'accepted sequential work must continue while a local editor is active');
    assert.equal(second[0].x, first[0].x + first[0].width + 80);
    assert.equal(second[0].y, first[0].y);
    assert.ok(toolbar[0].y >= first[0].y + first[0].height + 240);
    assert.equal(second[0].contentGroupId, first[0].contentGroupId);
    assert.deepEqual(board().camera, camera);
    assert.deepEqual(board().images.slice(0, -1).map(item => ({ id: item.id, x: item.x, y: item.y })), existing);
    await act(async () => { board().finishGeneration([second[0].id], [asset('agent-second', 200, 300)]); });
    assert.deepEqual(board().camera, camera);
    await act(async () => { board().setInteractionLocked(false); });
    const ownBounds = selectionBounds(board().images.filter(item => item.contentGroupId === first[0].contentGroupId));
    let nextRound: CanvasImage[] = [];
    await act(async () => { nextRound = board().beginGeneration(undefined, 1, { placement: 'agent', agentConversationId: 'chat-a', taskRecordId: 'round-two', generationIndex: 0, outputSize: { width: 100, height: 100 } }); });
    assert.equal(nextRound[0].contentGroupId, first[0].contentGroupId);
    assert.equal(nextRound[0].x, ownBounds.x);
    near(nextRound[0].y, ownBounds.y + ownBounds.height + 240 + IMAGE_FILENAME_TOP_SPACE);
  });
});

test('send-to-canvas always adds an independent image below current content and can undo each send', async () => {
  await withCanvas(async board => {
    let placeholders: CanvasImage[] = [];
    await act(async () => { placeholders = board().beginGeneration(undefined, 1, {
      placement: 'agent', agentConversationId: 'original-chat', taskRecordId: 'send-task',
      outputSize: { width: 100, height: 100 },
    }); });
    await act(async () => { board().finishGeneration([placeholders[0].id], [asset('send-result')]); });
    const original = { ...board().images[0] };
    const taskFilename = board().lookupImageFilename(original.taskResultId!);
    const sent: CanvasImage[] = [];
    for (let index = 0; index < 2; index++) {
      const before = [...board().images], bounds = selectionBounds(before), zoom = board().camera.zoom;
      let additions: CanvasImage[] = [];
      await act(async () => { additions = board().addImages([original], { focusMotion: 'generation' }); });
      assert.equal(additions.length, 1);
      const added = additions[0]; sent.push(added);
      assert.equal(board().images.length, before.length + 1);
      assert.deepEqual(board().images.slice(0, -1), before, 'existing images keep their positions and identities');
      assert.ok(!before.some(item => item.id === added.id));
      assert.equal(added.name, original.name, 'sending retains the name without allocating a new number or copy suffix');
      assert.equal(added.taskResultId, undefined);
      assert.equal(added.generationBatchId, undefined);
      assert.equal(added.generatedFile, undefined);
      assert.equal(added.agentConversationId, undefined);
      near(added.x, bounds.x);
      near(added.y, bounds.y + bounds.height + 80 + IMAGE_FILENAME_TOP_SPACE / zoom);
      assert.deepEqual(board().selectedIds, [added.id]);
      assert.equal(board().camera.zoom, zoom, 'sending does not zoom in');
      const top = added.y * zoom + board().camera.y - IMAGE_FILENAME_TOP_SPACE;
      assert.ok(top >= 0 && (added.y + added.height) * zoom + board().camera.y <= board().size.height);
    }
    assert.notEqual(sent[0].additionBatchId, sent[1].additionBatchId);
    await act(async () => { board().undo(); });
    assert.deepEqual(board().images, [original, sent[0]], 'one undo removes only the latest send');
    await act(async () => { board().redo(); });
    assert.deepEqual(board().images, [original, ...sent]);
    await act(async () => { board().renameImage(sent[1].id, 'sent-image-renamed.png'); });
    assert.deepEqual(board().lookupImageFilename(original.taskResultId!), taskFilename, 'renaming the new instance does not rename the generation task');
    const beforeLocked = [...board().images];
    await act(async () => { board().setInteractionLocked(true); });
    assert.deepEqual(board().addImages([original], { focusMotion: 'generation' }), []);
    assert.deepEqual(board().images, beforeLocked);
  });
});

test('sending into an empty canvas centers and selects the newly added image', async () => {
  await withCanvas(async board => {
    await act(async () => { board().addImages([asset('send-empty', 200, 300)], { focusMotion: 'generation' }); });
    const item = board().images[0], camera = board().camera;
    assert.equal(board().images.length, 1);
    assert.deepEqual(board().selectedIds, [item.id]);
    near(item.x + item.width / 2, 800);
    near((item.x + item.width / 2) * camera.zoom + camera.x, 800);
    assert.equal(camera.zoom, 1);
    await act(async () => { board().undo(); });
    assert.deepEqual(board().images, []);
  });
});

test('a sequential Agent batch stays atomic through undo around an intervening manual addition', async () => {
  await withCanvas(async board => {
    const request = {
      placement: 'agent' as const, agentConversationId: 'undo-chat', taskRecordId: 'undo-batch',
      outputSize: { width: 200, height: 300 },
    };
    let first: CanvasImage[] = [], second: CanvasImage[] = [];
    await act(async () => { first = board().beginGeneration(undefined, 1, { ...request, generationIndex: 0 }); });
    await act(async () => { board().finishGeneration([first[0].id], [asset('undo-first-completed', 200, 300)]); });
    await act(async () => { board().addImages([asset('between-agent-results')]); });
    const manualId = board().images.at(-1)!.id;
    await act(async () => { second = board().beginGeneration(undefined, 1, { ...request, generationIndex: 1 }); });
    await act(async () => { board().finishGeneration([second[0].id], [asset('undo-second-completed', 200, 300)]); });
    const resultIds = [first[0].id, second[0].id];
    const completed = board().images.filter(item => resultIds.includes(item.id)).map(item => ({ ...item }));
    assert.equal(board().images.length, 3);
    await act(async () => { board().undo(); });
    assert.deepEqual(board().images.map(item => item.id), resultIds, 'first undo removes only the intervening manual addition');
    assert.ok(board().images.every(item => !item.generating));
    assert.ok(!board().images.some(item => item.id === manualId));
    await act(async () => { board().undo(); });
    assert.deepEqual(board().images, [], 'second undo removes the whole Agent batch');
    await act(async () => { board().redo(); });
    assert.deepEqual(board().images, completed, 'redo restores both completed outputs, never their loading placeholders');
    await act(async () => { board().redo(); });
    assert.equal(board().images.length, 3);
    assert.ok(board().images.some(item => item.id === manualId));
    assert.deepEqual(board().images.filter(item => resultIds.includes(item.id)), completed);
  });
});
