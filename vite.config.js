import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces dist/index.html: one self-contained file you can double-click.
export default defineConfig({
  plugins: [viteSingleFile()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 4000 },
});
