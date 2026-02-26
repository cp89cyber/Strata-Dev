import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { CodeChangeSet } from '@shared/contracts';
import { DatabaseService } from '@main/services/databaseService';
import { sha256 } from '@main/services/hash';
import { PatchService } from '@main/services/patchService';
import { WorkspaceService } from '@main/services/workspaceService';

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0, tmpRoots.length).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

describe('patch service', () => {
  it('generates preview diff and applies file patch with hash precondition', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-patch-'));
    tmpRoots.push(root);

    const dbPath = path.join(root, 'test.sqlite');

    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    const filePath = path.join(root, 'src', 'hello.ts');
    await fs.writeFile(filePath, 'export const value = 1;\n', 'utf-8');

    const workspaceService = new WorkspaceService();
    const openResult = await workspaceService.openWorkspace(root);
    expect(openResult.ok).toBe(true);

    const database = new DatabaseService(dbPath);
    const patchService = new PatchService(workspaceService, database);

    const original = await fs.readFile(filePath, 'utf-8');
    const changeSet: CodeChangeSet = {
      id: 'cs-1',
      sessionId: 'session-1',
      source: 'ai',
      summary: 'update value',
      createdAt: new Date().toISOString(),
      status: 'pending',
      filePatches: [
        {
          path: 'src/hello.ts',
          originalContent: original,
          newContent: 'export const value = 2;\n',
          expectedSha256: sha256(original)
        }
      ],
      proposedCommands: []
    };

    const preview = patchService.previewPatch(changeSet.filePatches);
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.value.files[0].unifiedDiff).toContain('-export const value = 1;');
      expect(preview.value.files[0].unifiedDiff).toContain('+export const value = 2;');
    }

    const register = patchService.registerChangeSet(changeSet);
    expect(register.ok).toBe(true);

    const apply = await patchService.applyPatch(changeSet.id);
    expect(apply.ok).toBe(true);

    const updated = await fs.readFile(filePath, 'utf-8');
    expect(updated).toBe('export const value = 2;\n');

    database.close();
  });

  it('fails patch apply when expected hash mismatches', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-patch-'));
    tmpRoots.push(root);

    const dbPath = path.join(root, 'test.sqlite');

    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    const filePath = path.join(root, 'src', 'hello.ts');
    await fs.writeFile(filePath, 'export const value = 1;\n', 'utf-8');

    const workspaceService = new WorkspaceService();
    await workspaceService.openWorkspace(root);

    const database = new DatabaseService(dbPath);
    const patchService = new PatchService(workspaceService, database);

    const changeSet: CodeChangeSet = {
      id: 'cs-2',
      sessionId: 'session-1',
      source: 'ai',
      summary: 'conflict',
      createdAt: new Date().toISOString(),
      status: 'pending',
      filePatches: [
        {
          path: 'src/hello.ts',
          originalContent: 'export const value = 1;\n',
          newContent: 'export const value = 999;\n',
          expectedSha256: 'deadbeef'
        }
      ],
      proposedCommands: []
    };

    patchService.registerChangeSet(changeSet);
    const apply = await patchService.applyPatch(changeSet.id);
    expect(apply.ok).toBe(false);
    if (!apply.ok) {
      expect(apply.error.code).toBe('PATCH_APPLY_FAILED');
    }

    database.close();
  });
});
