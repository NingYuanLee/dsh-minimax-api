import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withFileLock } from '../src/lock.js';

test('file lock admits only one holder at a time', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-minimax-lock-'));
  const lock = join(dir, 'tasks', 'a.lock');
  let inside = 0;
  let max = 0;
  await Promise.all([0, 1].map(() => withFileLock(lock, async () => {
    inside += 1;
    max = Math.max(max, inside);
    await new Promise(resolve => setTimeout(resolve, 40));
    inside -= 1;
  })));
  assert.equal(max, 1);
  await rm(dir, { recursive: true, force: true });
});

test('a dead owner lock is taken over', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-minimax-lock-'));
  const lock = join(dir, 'tasks', 'b.lock');
  await mkdir(join(dir, 'tasks'), { recursive: true });
  await writeFile(lock, '2147483000');
  let ran = false;
  await withFileLock(lock, async () => { ran = true; });
  assert.equal(ran, true);
  await rm(dir, { recursive: true, force: true });
});
