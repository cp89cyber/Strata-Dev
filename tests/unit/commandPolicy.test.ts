import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from '@main/services/databaseService';
import { ShellService } from '@main/services/shellService';
import { WorkspaceService } from '@main/services/workspaceService';

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0, tmpRoots.length).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

describe('shell command policy', () => {
  it('requires explicit confirmation token', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-shell-'));
    tmpRoots.push(root);

    const dbPath = path.join(root, 'test.sqlite');

    const workspaceService = new WorkspaceService();
    await workspaceService.openWorkspace(root);
    const database = new DatabaseService(dbPath);
    const shellService = new ShellService(workspaceService, database);

    const proposalResult = shellService.requestCommand('session-1', 'echo hello', '.');
    expect(proposalResult.ok).toBe(true);

    if (proposalResult.ok) {
      const runResult = await shellService.runCommand(proposalResult.value.id, false as unknown as true);
      expect(runResult.ok).toBe(false);
      if (!runResult.ok) {
        expect(runResult.error.code).toBe('COMMAND_DENIED');
      }
    }

    database.close();
  });

  it('blocks commands outside workspace cwd', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-shell-'));
    tmpRoots.push(root);

    const dbPath = path.join(root, 'test.sqlite');

    const workspaceService = new WorkspaceService();
    await workspaceService.openWorkspace(root);
    const database = new DatabaseService(dbPath);
    const shellService = new ShellService(workspaceService, database);

    const proposalResult = shellService.requestCommand('session-1', 'ls', '../');
    expect(proposalResult.ok).toBe(false);
    if (!proposalResult.ok) {
      expect(proposalResult.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
    }

    database.close();
  });
});
