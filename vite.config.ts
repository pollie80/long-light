import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The bundler leaves <link> icons as separate files, which a single-file game cannot have.
function inlineIcons(): Plugin {
  return {
    name: 'inline-icons',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(/\.\/assets\/(icon-\d+\.png)/g, (_, file: string) => {
          const data = readFileSync(resolve(__dirname, 'assets', file)).toString('base64');
          return `data:image/png;base64,${data}`;
        }),
    },
  };
}

// One self-contained HTML file, so the game runs from a double-click with no server.
export default defineConfig({
  base: './',
  plugins: [inlineIcons(), viteSingleFile()],
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 100_000, target: 'es2022' },
});
