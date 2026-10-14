import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await mkdir(new URL('www/', root), { recursive: true });
await copyFile(new URL('index.html', root), new URL('www/index.html', root));
console.log(`Web assets copied to ${fileURLToPath(new URL('www/', root))}`);
