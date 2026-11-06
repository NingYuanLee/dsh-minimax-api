import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const run = promisify(exec);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specifiers = [
  'dsh-minimax-byapi/locale/en.json',
  'dsh-minimax-byapi/locale/zh.json',
  'dsh-minimax-byapi/media/locale/en.json',
  'dsh-minimax-byapi/media/locale/zh.json',
  'dsh-minimax-byapi/icon',
  'dsh-minimax-byapi/media/icon',
];
const packed = [
  'locale/en.json',
  'locale/zh.json',
  'locale/media/en.json',
  'locale/media/zh.json',
  'assets/media.svg',
  'icon.svg',
  'lib/client.js',
  'cordis.patch.yml',
  'README.md',
  'README.zh.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'LICENSE',
];

test('every published specifier resolves to a readable file', async () => {
  for (const specifier of specifiers) {
    // Self-reference resolution exercises the package exports map the same way DSH does.
    const url = import.meta.resolve(specifier);
    assert.ok(url.startsWith('file:'), specifier + ' resolves inside the package');
    const text = await readFile(fileURLToPath(url), 'utf8');
    assert.ok(text.length > 0, specifier + ' is not empty');
    if (specifier.endsWith('.json')) JSON.parse(text);
  }
});

test('locale files carry the English display metadata', async () => {
  const rootLocale = JSON.parse(await readFile(resolve(root, 'locale/en.json'), 'utf8'));
  assert.ok(rootLocale.meta.title.trim().length > 0);
  assert.ok(/^[\x20-\x7e]+$/.test(rootLocale.meta.description), 'root en description stays ASCII like the manifest');
  const media = JSON.parse(await readFile(resolve(root, 'locale/media/en.json'), 'utf8'));
  assert.ok(media.meta.title.trim().length > 0);
  assert.ok(media.meta.description.trim().length > 0);
  const zh = JSON.parse(await readFile(resolve(root, 'locale/zh.json'), 'utf8'));
  assert.ok(zh.meta.title.trim().length > 0);
  assert.ok(zh.meta.description.trim().length > 0);
});

test('the bundle patch points at real package specifiers', async () => {
  const patch = await readFile(resolve(root, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /name: dsh-minimax-byapi\n/);
  assert.match(patch, /name: dsh-minimax-byapi\/media/);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(manifest.engines.dsh, 'engines.dsh gates installation');
});

test('the manifest follows the unified dsh baseline', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(manifest.dsh.manifestVersion, 1);
  assert.equal(manifest.engines.dsh, '>=0.2.1-rc.2 <0.3.0-0');
  assert.equal(manifest.engines.node, '>=22.19.0');
  // The 0.2.x dsh line ships prereleases (0.2.2-rc.1 and later). npm only lets a
  // prerelease satisfy a range whose comparators mention that same
  // [major, minor, patch] tuple, so `>=0.2.1-0 <0.3.0` alone would reject the
  // very versions the host runs. The union form is what the sibling plugins
  // declare; the second clause unlocks the 0.2.2 prerelease line.
  const baseline = {
    '@deepseek-ai/cordis': '>=4.0.4 <5.0.0',
    '@deepseek-ai/schemastery': '>=3.18.4 <4.0.0',
    '@deepseek-ai/dsh-credentials': '>=0.2.1-0 <0.3.0-0 || >=0.2.2-0 <0.3.0-0',
    '@deepseek-ai/dsh-llm-pi-ai': '>=0.2.1-0 <0.3.0-0 || >=0.2.2-0 <0.3.0-0',
    '@deepseek-ai/dsh-tools': '>=0.2.1-0 <0.3.0-0 || >=0.2.2-0 <0.3.0-0',
  };
  for (const [name, range] of Object.entries(baseline)) {
    assert.equal(manifest.peerDependencies[name], range, name);
  }
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-llm'], '>=0.2.1-0 <0.3.0-0 || >=0.2.2-0 <0.3.0-0');
  await assert.rejects(access(resolve(root, 'market/index.json')), { code: 'ENOENT' });
});

test('the installed tree satisfies the declared peer ranges', async () => {
  // npm reports an unmet peer as "invalid" and exits non-zero. The 0.2.x
  // prerelease line is the case that silently breaks: the plugin still loads,
  // but the route it registers is unusable.
  const peers = ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm-pi-ai'];
  const result = await run(`npm ls ${peers.join(' ')}`, { cwd: root }).catch(error => error);
  // A resolved exec carries no exit code; a rejected one carries the code.
  const code = result.code ?? 0;
  assert.equal(code, 0, `npm ls reported an unmet peer range:\n${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout + result.stderr, /invalid/i);
});

test('npm pack ships every runtime and display resource and nothing private', async () => {
  const { stdout } = await run('npm pack --dry-run --ignore-scripts --json', { cwd: root, maxBuffer: 8 * 1024 * 1024 });
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  assert.ok(start >= 0 && end > start, 'npm pack printed a JSON array');
  const result = JSON.parse(stdout.slice(start, end + 1));
  const files = new Set(result[0].files.map(file => file.path));
  for (const path of packed) assert.ok(files.has(path), 'packed: ' + path);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const path of files) {
    assert.ok(!path.startsWith('node_modules/'), 'node_modules leaked: ' + path);
    assert.ok(!path.startsWith('.local/'), '.local leaked: ' + path);
    assert.ok(!path.startsWith('test/'), 'test leaked: ' + path);
    assert.ok(!path.startsWith('.github/'), 'workflow leaked: ' + path);
    assert.ok(!path.startsWith('.env'), 'env file leaked: ' + path);
    assert.ok(!path.endsWith('.log'), 'log leaked: ' + path);
    assert.ok(!path.endsWith('.tgz'), 'tarball leaked: ' + path);
  }
});
