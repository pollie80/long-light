// Puts the built game on GitHub Pages: dist/index.html and the link preview picture, on the gh-pages branch.
// That branch only ever holds the latest build, so it is replaced each time.
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const remote = git(['remote', 'get-url', 'origin']);
const sha = git(['rev-parse', '--short', 'HEAD']);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'long-light-pages-'));
fs.copyFileSync('dist/index.html', path.join(tmp, 'index.html'));
fs.copyFileSync('assets/og.jpg', path.join(tmp, 'og.jpg'));
fs.writeFileSync(path.join(tmp, '.nojekyll'), '');
git(['init', '-q', '-b', 'gh-pages'], tmp);
git(['config', 'core.autocrlf', 'false'], tmp);
git(['add', '.'], tmp);
git(['commit', '-q', '-m', `Publish build of ${sha}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`], tmp);
git(['push', '-q', '--force', remote, 'gh-pages'], tmp);
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* Windows sometimes holds on to git's files for a moment; it is only a temp folder. */
}
console.log(`published ${sha}`);
