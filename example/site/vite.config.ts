// The example site: an ordinary Vite + React app. It uses the repository's own React and Vite, so it needs no install.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: { port: 4340, strictPort: true },
});
