import { describe, expect, it } from 'vitest';

import { chatTurnInputSchema, runCommandInputSchema, writeFileInputSchema } from '@shared/validation';

describe('ipc payload validation', () => {
  it('rejects malformed chat turn payload', () => {
    const parsed = chatTurnInputSchema.safeParse({
      sessionId: '',
      prompt: '',
      selectedFilePaths: [],
      maxContextFiles: 0
    });

    expect(parsed.success).toBe(false);
  });

  it('requires confirmed=true for command execution', () => {
    const parsed = runCommandInputSchema.safeParse({ proposalId: 'abc', confirmed: false });
    expect(parsed.success).toBe(false);
  });

  it('accepts write file payload with optimistic hash', () => {
    const parsed = writeFileInputSchema.safeParse({
      path: 'src/file.ts',
      content: 'const a = 1;',
      expectedSha256: 'abc123'
    });

    expect(parsed.success).toBe(true);
  });
});
