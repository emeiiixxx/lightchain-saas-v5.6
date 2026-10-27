import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { designWorkbenchOcrAssets } from './design-workbench-ocr-assets';
export default defineConfig({
  plugins: [react(), tailwindcss(), designWorkbenchOcrAssets()],
  build: { rollupOptions: { input: { main: 'index.html', designWorkbench: 'design-workbench/index.html' } } },
});
