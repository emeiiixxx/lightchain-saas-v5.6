import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Keep the official worker and its matching ONNX runtime on the Demo's origin.
// Models and their provenance live in public/assets/design-workbench/ocr; no paid API is used.
export function designWorkbenchOcrAssets(): Plugin {
  const root = resolve('node_modules');
  const workerRoot = resolve(root, '@paddleocr/paddleocr-js/dist/assets');
  const workerFile = readdirSync(workerRoot).find(name => /^worker-entry-.*\.js$/.test(name));
  if (!workerFile) throw new Error('PaddleOCR worker asset is missing');
  const runtimePrefix = 'paddle-0.4.2/';
  const files = new Map<string, string>([
    [`${runtimePrefix}worker.js`, resolve(workerRoot, workerFile)],
    ['OpenCV-LICENSE.txt', resolve(root, '@techstark/opencv-js/LICENSE')],
    ['js-yaml-LICENSE.txt', resolve(root, 'js-yaml/LICENSE')],
    ...['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']
      .map(name => [`${runtimePrefix}${name}`, resolve(root, 'onnxruntime-web/dist', name)] as [string, string]),
  ]);
  return {
    name: 'design-workbench-ocr-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split('?')[0].replace(/^\/assets\/design-workbench\/ocr\//, '');
        const file = request.url?.startsWith('/assets/design-workbench/ocr/') && name ? files.get(name) : undefined;
        if (!file) return next();
        response.setHeader('Content-Type', /\.m?js$/.test(name!) ? 'text/javascript' : name!.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        createReadStream(file).on('error', next).pipe(response);
      });
    },
    generateBundle() {
      for (const [name, path] of files) this.emitFile({ type: 'asset', fileName: `assets/design-workbench/ocr/${name}`, source: readFileSync(path) });
    },
  };
}
