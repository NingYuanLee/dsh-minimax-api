import { mkdir, open, readFile, stat, unlink, utimes } from 'node:fs/promises';
import { dirname } from 'node:path';

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but this user cannot signal it.
    return error?.code === 'EPERM';
  }
}

async function readPid(lockPath) {
  try {
    const pid = Number((await readFile(lockPath, 'utf8')).trim());
    return Number.isInteger(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

// Exclusive lock shared by every Host process using this data directory.
// A live owner is waited out. A dead owner's file is removed. An empty file
// left by a crash is removed only after it stops being touched.
export async function withFileLock(lockPath, operation, { timeoutMs = 30000, pollMs = 40 } = {}) {
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  const started = Date.now();
  for (;;) {
    let handle;
    try {
      handle = await open(lockPath, 'wx');
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const pid = await readPid(lockPath);
      const info = await stat(lockPath).catch(() => undefined);
      const abandoned = !pid && info && Date.now() - info.mtimeMs > 10000;
      if ((pid && !pidAlive(pid)) || abandoned) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() - started > timeoutMs) throw new Error('数据目录正被另一个进程占用');
      await new Promise(resolve => setTimeout(resolve, pollMs));
      continue;
    }
    const beat = setInterval(() => {
      const now = new Date();
      utimes(lockPath, now, now).catch(() => {});
    }, 5000);
    beat.unref?.();
    try {
      await handle.writeFile(String(process.pid));
      return await operation();
    } finally {
      clearInterval(beat);
      await handle.close();
      await unlink(lockPath).catch(() => {});
    }
  }
}
