import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

test('switching workspaces preserves each Flow canvas selection, drag and marquee handlers', async () => {
  const dom = new JSDOM('<main tabindex="0"><div id="root"></div></main>', { pretendToBeVisual: true, url: 'http://localhost' });
  const { window } = dom;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'SVGElement', 'Node', 'MouseEvent', 'KeyboardEvent']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
  }
  Object.assign(globalThis, {
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  });
  window.ResizeObserver = globalThis.ResizeObserver;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: this.offsetWidth, bottom: this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight }; };
  window.DOMMatrixReadOnly = class { m22 = 1; };
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get() { return this.style.width.endsWith('px') ? parseFloat(this.style.width) : 1000; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get() { return this.style.height.endsWith('px') ? parseFloat(this.style.height) : 800; } });
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;

  const cache = path.resolve('node_modules/.cache/lc-workspace-isolation-test');
  await mkdir(cache, { recursive: true });
  const bundled = await build({ entryPoints: ['src/components/ReactFlowCanvas.tsx'], bundle: true, packages: 'external', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env.BASE_URL': '"/"' }, write: false });
  const modulePath = path.join(cache, 'adapter.mjs');
  await writeFile(modulePath, bundled.outputFiles[0].text);
  const { createElement: h, useState, useCallback, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { ReactFlowProvider } = await import('@xyflow/react');
  const { ReactFlowCanvas } = await import(pathToFileURL(modulePath).href);
  const state = {};
  const noop = () => {};
  let showVideo;
  function Scene({ name }) {
    const [selected, setSelected] = useState([]);
    const [points, setPoints] = useState([{ x: 100, y: 100 }, { x: 300, y: 100 }]);
    state[name] = { selected, points, clear: () => setSelected([]) };
    const move = useCallback(positions => setPoints(previous => previous.map((point, index) => positions.get(`${name}-${index}`) ?? point)), [name]);
    return h('section', { 'data-scene': name }, h(ReactFlowCanvas, {
      view: { x: 0, y: 0, zoom: 1 }, selectedIds: selected, hand: false, referenceMode: false, snap: false,
      onView: noop, onSelection: setSelected, onPositions: move, onSelecting: noop,
      onDragStart: noop, onDragEnd: noop, onGuides: noop,
    }, ...points.map((point, index) => h('div', {
      key: index, 'data-canvas-id': `${name}-${index}`,
      style: { left: point.x, top: point.y, width: 100, height: 100 },
    }, `${name}-${index}`))));
  }
  function Workspaces() {
    const [video, setVideo] = useState(false); showVideo = setVideo;
    // Match the old application shell: both canvases could inherit one provider.
    // Each adapter must still own an independent store.
    return h(ReactFlowProvider, null, h(Scene, { name: 'fusion' }), video && h(Scene, { name: 'video' }));
  }
  const root = createRoot(document.getElementById('root'));
  const mouse = (target, type, x = 120, y = 120) => target.dispatchEvent(new window.MouseEvent(type, {
    bubbles: true, cancelable: true, view: window, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: x, clientY: y,
  }));
  const pointer = (target, type, x = 120, y = 120) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, clientX: x, clientY: y });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: 'mouse' } });
    target.dispatchEvent(event);
  };
  const click = async id => act(async () => {
    const target = document.querySelector(`[data-canvas-id="${id}"]`);
    assert.ok(target, `visible node ${id}`);
    pointer(target, 'pointerdown'); mouse(target, 'mousedown');
    pointer(target, 'pointerup'); mouse(window, 'mouseup'); mouse(target, 'click');
  });
  try {
    await act(async () => root.render(h(Workspaces)));
    await click('fusion-0');
    assert.deepEqual(state.fusion.selected, ['fusion-0'], 'initial left click works');
    await act(async () => showVideo(true));
    await click('video-0');
    assert.deepEqual(state.video.selected, ['video-0']);
    await act(async () => showVideo(false));
    await act(async () => state.fusion.clear());
    await click('fusion-1');
    assert.deepEqual(state.fusion.selected, ['fusion-1'], 'left click must still work after leaving video');
    await act(async () => {
      const target = document.querySelector('[data-canvas-id="fusion-1"]');
      pointer(target, 'pointerdown', 320, 120); mouse(target, 'mousedown', 320, 120);
    });
    await act(async () => mouse(window, 'mousemove', 324, 120));
    await act(async () => mouse(window, 'mousemove', 364, 150));
    await act(async () => {
      pointer(window, 'pointerup', 364, 150); mouse(window, 'mouseup', 364, 150);
    });
    assert.deepEqual(state.fusion.points[1], { x: 340, y: 130 }, 'drag remains attached to the fusion store');
    await act(async () => state.fusion.clear());
    const pane = document.querySelector('[data-scene="fusion"] .react-flow__pane');
    await act(async () => pointer(pane, 'pointerdown', 50, 50));
    await act(async () => pointer(pane, 'pointermove', 600, 300));
    await act(async () => { pointer(pane, 'pointerup', 600, 300); mouse(pane, 'click', 600, 300); });
    assert.deepEqual(state.fusion.selected, ['fusion-0', 'fusion-1'], 'marquee remains functional');
    for (let cycle = 0; cycle < 2; cycle++) {
      const fusionSelection = [...state.fusion.selected];
      await act(async () => showVideo(true));
      await click('video-1');
      assert.deepEqual(state.video.selected, ['video-1']);
      assert.deepEqual(state.fusion.selected, fusionSelection, 'video selection never overwrites fusion selection');
      await act(async () => showVideo(false));
      await click('fusion-0');
      assert.ok(state.fusion.selected.includes('fusion-0'));
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(cache, { recursive: true, force: true });
  }
});
