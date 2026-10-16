import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await mkdir(new URL('www/', root), { recursive: true });
await copyFile(new URL('design.html', root), new URL('www/index.html', root));
await copyFile(new URL('chambea-v1.js', root), new URL('www/chambea-v1.js', root));
console.log(`Web assets copied to ${fileURLToPath(new URL('www/', root))}`);
