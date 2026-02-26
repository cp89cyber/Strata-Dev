import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isWithinRoot, resolveInsideWorkspace } from '@main/services/security';

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0, tmpRoots.length).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

describe('security path constraints', () => {
  it('accepts paths that stay inside workspace root', () => {
    expect(isWithinRoot('/tmp/workspace', '/tmp/workspace/src/file.ts')).toBe(true);
  });

  it('rejects paths outside workspace root', () => {
    expect(isWithinRoot('/tmp/workspace', '/tmp/other')).toBe(false);
  });

  it('blocks traversal outside root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-sec-'));
    tmpRoots.push(root);

    await expect(resolveInsideWorkspace(root, '../escape.txt', { mustExist: false })).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_WORKSPACE'
    });
  });

  it('rejects symlink escapes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-sec-'));
    tmpRoots.push(root);

    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-sec-out-'));
    tmpRoots.push(outsideDir);

    const symlinkPath = path.join(root, 'link-outside');
    await fs.symlink(outsideDir, symlinkPath);

    await expect(resolveInsideWorkspace(root, 'link-outside', { mustExist: true })).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_WORKSPACE'
    });
  });
});
