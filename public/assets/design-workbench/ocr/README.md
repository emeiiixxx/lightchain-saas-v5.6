# Text editing OCR assets

Text recognition runs locally with the official `@paddleocr/paddleocr-js` 0.4.2 SDK and PP-OCRv5 mobile detection/recognition models. It does not call a paid OCR API or upload image crops to a recognition service.

- Upstream: https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js
- Models: original ONNX archives from PaddlePaddle's model distribution, listed in `model-source.json`.
- License: Apache-2.0; see `PaddleOCR-LICENSE.txt`.
- Runtime: ONNX Runtime Web 1.24.3, pinned to match the SDK's prebuilt worker. Its MIT license and third-party notices are included.
- `ocr-assets.ts` serves/copies the official SDK worker, matching WASM files and dependency licenses into `paddle-0.4.2/` during development and publishing.

The browser uses a dedicated worker and single-thread WASM, so GitHub Pages does not need cross-origin isolation headers. Model and runtime URLs are on the same origin as the Demo. Only the selected crop is recognized; returned coordinates are converted back to original-image pixels. Existing image modification remains a local visual simulation.
