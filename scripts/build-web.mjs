import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const output = new URL('www/', root);
await mkdir(output, { recursive: true });
await copyFile(new URL('design.html', root), new URL('www/index.html', root));

// Bundle Firebase locally: no dependency on Google CDN JS module requests to enable buttons.
await build({
  entryPoints: [fileURLToPath(new URL('chambea-v1.js', root))],
  outfile: fileURLToPath(new URL('www/chambea-v1.js', root)),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome112', 'safari16'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
});
console.log('CHAMBEA native web assets prepared with bundled Firebase');
