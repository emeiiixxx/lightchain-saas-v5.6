import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix, resolve } from 'node:path';
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
    generateBundle: { order: 'post', handler(_options, bundle) {
      const canonical = new Map<string, string>();
      for (const [name, path] of files) {
        const source = readFileSync(path);
        const fileName = `assets/design-workbench/ocr/${name}`;
        this.emitFile({ type: 'asset', fileName, source });
        canonical.set(createHash('sha256').update(source).digest('hex'), fileName);
      }
      // Vite also emits the SDK's default worker/WASM, although our recognizer
      // supplies its own stable same-origin URLs. Share byte-identical files;
      // keep both default-SDK references and our explicit worker config valid.
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (asset.type !== 'asset' || !/\.(?:js|mjs|wasm)$/.test(fileName)) continue;
        const target = canonical.get(createHash('sha256').update(asset.source).digest('hex'));
        if (!target || fileName === target) continue;
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue;
          chunk.code = chunk.code.replaceAll(fileName, target)
            .replaceAll(posix.basename(fileName), posix.relative(posix.dirname(chunk.fileName), target));
          chunk.referencedFiles = chunk.referencedFiles.map(name => name === fileName ? target : name);
        }
        delete bundle[fileName];
      }
    } },
  };
}
