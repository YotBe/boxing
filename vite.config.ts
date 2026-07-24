/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Serve and bundle MediaPipe's WASM runtime from node_modules so the deployed
 * app is self-contained: no runtime dependency on cdn.jsdelivr.net (which may
 * be blocked on gym/corporate networks). The detector still falls back to the
 * CDN if /wasm is missing.
 */
function mediapipeWasm(): Plugin {
  const wasmDir = path.resolve('node_modules/@mediapipe/tasks-vision/wasm');
  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use('/wasm', (req, res, next) => {
        const name = path.basename((req.url ?? '').split('?')[0]);
        const file = path.join(wasmDir, name);
        if (name && fs.existsSync(file)) {
          res.setHeader(
            'Content-Type',
            file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
          );
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
    closeBundle() {
      if (!fs.existsSync(wasmDir)) return;
      const out = path.resolve('dist/wasm');
      fs.mkdirSync(out, { recursive: true });
      for (const f of fs.readdirSync(wasmDir)) {
        fs.copyFileSync(path.join(wasmDir, f), path.join(out, f));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm()],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
  },
});
