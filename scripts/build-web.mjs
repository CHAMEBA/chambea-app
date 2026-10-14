import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await mkdir(new URL('www/', root), { recursive: true });
await copyFile(new URL('design.html', root), new URL('www/index.html', root));
await copyFile(new URL('cloud-bridge.js', root), new URL('www/cloud-bridge.js', root));
await copyFile(new URL('interactions-v3.js', root), new URL('www/interactions-v3.js', root));
await copyFile(new URL('beta-online.js', root), new URL('www/beta-online.js', root));
console.log(`Web assets copied to ${fileURLToPath(new URL('www/', root))}`);
