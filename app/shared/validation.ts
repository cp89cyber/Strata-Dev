import { z } from 'zod';

export const relPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\u0000'), 'Path contains null byte');

export const openWorkspaceInputSchema = z.object({
  path: z.string().min(1)
});

export const listTreeInputSchema = z.object({
  path: z.string().default('.'),
  depth: z.number().int().min(1).max(8).default(3)
});

export const readFileInputSchema = z.object({
  path: relPathSchema
});

export const writeFileInputSchema = z.object({
  path: relPathSchema,
  content: z.string(),
  expectedSha256: z.string().optional()
});

export const chatTurnInputSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  activeFilePath: z.string().optional(),
  selectedFilePaths: z.array(z.string()),
  maxContextFiles: z.number().int().min(1).max(30)
});

export const previewPatchInputSchema = z.object({
  filePatches: z.array(
    z.object({
      path: z.string().min(1),
      originalContent: z.string(),
      newContent: z.string(),
      expectedSha256: z.string().optional()
    })
  )
});

export const applyPatchInputSchema = z.object({
  changeSetId: z.string().min(1),
  selectedFiles: z.array(z.string()).optional()
});

export const discardPatchInputSchema = z.object({
  changeSetId: z.string().min(1)
});

export const requestCommandInputSchema = z.object({
  sessionId: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1)
});

export const runCommandInputSchema = z.object({
  proposalId: z.string().min(1),
  confirmed: z.literal(true)
});

export const setKeyInputSchema = z.object({
  key: z.string().min(10)
});

export const updateSettingsInputSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxContextFiles: z.number().int().min(1).max(30).optional(),
  requireCommandConfirmation: z.boolean().optional(),
  requirePatchConfirmation: z.boolean().optional()
});

export const loadSessionInputSchema = z.object({
  sessionId: z.string().min(1).optional()
});
