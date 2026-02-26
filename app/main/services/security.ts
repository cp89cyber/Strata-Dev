import fs from 'node:fs/promises';
import path from 'node:path';

import type { AppError } from '../../shared/contracts';

const normalize = (value: string): string => path.resolve(value);

export const isWithinRoot = (rootPath: string, candidatePath: string): boolean => {
  const root = normalize(rootPath);
  const candidate = normalize(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
};

const pathError = (candidatePath: string, rootPath: string): AppError => ({
  code: 'PATH_OUTSIDE_WORKSPACE',
  message: `Path is outside the active workspace: ${candidatePath}`,
  details: { candidatePath, rootPath }
});

export const resolveWorkspaceRoot = async (workspacePath: string): Promise<string> => {
  const real = await fs.realpath(workspacePath);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new Error('Workspace path is not a directory');
  }
  return real;
};

export const resolveInsideWorkspace = async (
  rootPath: string,
  relativePath: string,
  options?: { mustExist?: boolean }
): Promise<string> => {
  const root = normalize(rootPath);
  const joined = normalize(path.resolve(root, relativePath));

  if (!isWithinRoot(root, joined)) {
    throw pathError(joined, root);
  }

  if (options?.mustExist) {
    const real = await fs.realpath(joined);
    if (!isWithinRoot(root, real)) {
      throw pathError(real, root);
    }
    return real;
  }

  const parent = path.dirname(joined);
  const parentReal = await fs.realpath(parent);
  if (!isWithinRoot(root, parentReal)) {
    throw pathError(parentReal, root);
  }

  return joined;
};
