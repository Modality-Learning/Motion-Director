// The studio app (app/): React, Tailwind and shadcn/ui, served under /studio/ by the Motion Director server.
// `npm run dev` runs it through Vite with hot reloading; `npm run build` (and `prepare`, on install from git)
// writes dist/app, which the server serves when it isn't in development.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: at('./app'),
  base: '/studio/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': at('./app/src'), '@kit': at('./kit') } },
  server: { fs: { allow: [at('.')] } },
  build: { outDir: at('./dist/app'), emptyOutDir: true },
  test: {
    root: at('.'),
    include: ['app/src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: [at('./app/src/test/setup.ts')],
  },
});
