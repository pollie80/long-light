// Builds the Windows desktop folder that gets uploaded to Steam: release/Long Light-win32-x64.
// Usage: npm run desktop
import { packager } from '@electron/packager';
import fs from 'node:fs';

const keep = (p) => p === '' || p === '/package.json' || p === '/Long Light.ico' || p === '/dist' || p.startsWith('/dist/') || p === '/desktop' || p.startsWith('/desktop/');
const out = await packager({
  dir: '.',
  name: 'Long Light',
  platform: 'win32',
  arch: 'x64',
  out: 'release',
  overwrite: true,
  icon: 'Long Light.ico',
  asar: true,
  prune: false,
  ignore: (p) => !keep(p.replaceAll('\\', '/')),
  appCopyright: 'Long Light',
  win32metadata: { ProductName: 'Long Light', FileDescription: 'Long Light' },
});
const dir = out[0];
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(`${d}/${e.name}`) : fs.statSync(`${d}/${e.name}`).size), 0);
console.log(`${dir}: ${(size(dir) / 1048576).toFixed(0)} MB`);
