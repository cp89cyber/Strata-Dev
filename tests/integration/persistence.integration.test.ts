import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { CodeChangeSet } from '@shared/contracts';
import { DatabaseService } from '@main/services/databaseService';

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0, tmpRoots.length).map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
    })
  );
});

describe('database persistence integration', () => {
  it('loads messages and pending change sets for a session', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-db-'));
    tmpRoots.push(root);

    const database = new DatabaseService(path.join(root, 'test.sqlite'));

    database.saveMessage({
      id: 'm1',
      sessionId: 'session-42',
      role: 'user',
      content: 'Hello',
      createdAt: new Date().toISOString()
    });

    const changeSet: CodeChangeSet = {
      id: 'cs-42',
      sessionId: 'session-42',
      source: 'ai',
      summary: 'Pending patch',
      createdAt: new Date().toISOString(),
      status: 'pending',
      filePatches: [
        {
          path: 'src/index.ts',
          originalContent: 'old',
          newContent: 'new'
        }
      ],
      proposedCommands: []
    };

    database.saveChangeSet(changeSet);

    const loaded = database.loadSession('session-42');
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.pendingChangeSets).toHaveLength(1);
    expect(loaded.pendingChangeSets[0].id).toBe('cs-42');

    database.close();
  });
});
