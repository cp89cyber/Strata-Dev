import fs from 'node:fs/promises';
import path from 'node:path';

import type { FileNode, ReadFileResult, Result, WorkspaceMeta } from '../../shared/contracts';

import { err, ok, toAppError } from './errors';
import { sha256 } from './hash';
import { isWithinRoot, resolveInsideWorkspace, resolveWorkspaceRoot } from './security';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release']);

export class WorkspaceService {
  private workspace: WorkspaceMeta | null = null;

  get currentWorkspace(): WorkspaceMeta | null {
    return this.workspace;
  }

  async openWorkspace(workspacePath: string): Promise<Result<WorkspaceMeta>> {
    try {
      const rootPath = await resolveWorkspaceRoot(workspacePath);
      const meta: WorkspaceMeta = {
        rootPath,
        name: path.basename(rootPath),
        openedAt: new Date().toISOString()
      };

      this.workspace = meta;
      return ok(meta);
    } catch (error) {
      return err('INVALID_INPUT', 'Failed to open workspace directory', toAppError(error));
    }
  }

  private requireRoot(): string {
    if (!this.workspace) {
      throw {
        code: 'WORKSPACE_NOT_OPEN',
        message: 'No workspace is currently open'
      };
    }

    return this.workspace.rootPath;
  }

  async listTree(relativePath: string = '.', depth: number = 3): Promise<Result<FileNode[]>> {
    try {
      const rootPath = this.requireRoot();
      const target = await resolveInsideWorkspace(rootPath, relativePath, { mustExist: true });
      const stat = await fs.stat(target);

      if (!stat.isDirectory()) {
        return err('INVALID_INPUT', `${relativePath} is not a directory`);
      }

      const nodes = await this.walk(target, rootPath, depth);
      return ok(nodes);
    } catch (error) {
      return err('INTERNAL_ERROR', 'Failed to list workspace tree', toAppError(error));
    }
  }

  private async walk(absDirectoryPath: string, rootPath: string, depth: number): Promise<FileNode[]> {
    const entries = await fs.readdir(absDirectoryPath, { withFileTypes: true });

    const nodes = await Promise.all(
      entries
        .filter((entry) => entry.name !== '.' && entry.name !== '..')
        .filter((entry) => !IGNORED_DIRS.has(entry.name))
        .map(async (entry): Promise<FileNode | null> => {
          const absPath = path.join(absDirectoryPath, entry.name);
          const relPath = path.relative(rootPath, absPath) || '.';

          const entryStat = await fs.lstat(absPath);
          if (entryStat.isSymbolicLink()) {
            try {
              const resolved = await fs.realpath(absPath);
              if (!isWithinRoot(rootPath, resolved)) {
                return null;
              }
            } catch {
              return null;
            }
          }

          if (entry.isDirectory()) {
            const node: FileNode = {
              path: relPath,
              name: entry.name,
              type: 'directory'
            };

            if (depth > 1) {
              node.children = await this.walk(absPath, rootPath, depth - 1);
            }

            return node;
          }

          if (entry.isFile()) {
            return {
              path: relPath,
              name: entry.name,
              type: 'file',
              size: entryStat.size,
              mtimeMs: entryStat.mtimeMs
            };
          }

          return null;
        })
    );

    return nodes.filter((node): node is FileNode => node !== null).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(relativePath: string): Promise<Result<ReadFileResult>> {
    try {
      const rootPath = this.requireRoot();
      const absPath = await resolveInsideWorkspace(rootPath, relativePath, { mustExist: true });
      const content = await fs.readFile(absPath, 'utf-8');

      return ok({
        content,
        encoding: 'utf-8',
        sha256: sha256(content)
      });
    } catch (error) {
      return err('FILE_NOT_FOUND', `Unable to read file: ${relativePath}`, toAppError(error));
    }
  }

  async writeFile(relativePath: string, content: string, expectedSha256?: string): Promise<Result<void>> {
    try {
      const rootPath = this.requireRoot();
      const absPath = await resolveInsideWorkspace(rootPath, relativePath, { mustExist: false });

      let existingContent = '';
      let hadExistingFile = false;

      try {
        existingContent = await fs.readFile(absPath, 'utf-8');
        hadExistingFile = true;
      } catch {
        hadExistingFile = false;
      }

      if (expectedSha256 && hadExistingFile) {
        const actualSha = sha256(existingContent);
        if (actualSha !== expectedSha256) {
          return err('HASH_MISMATCH', 'File content hash mismatch. Reload and retry apply.', {
            path: relativePath,
            expectedSha256,
            actualSha
          });
        }
      }

      await fs.mkdir(path.dirname(absPath), { recursive: true });

      if (hadExistingFile) {
        const backupRoot = path.join(rootPath, '.strata-backups', Date.now().toString());
        const backupPath = path.join(backupRoot, relativePath);
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.writeFile(backupPath, existingContent, 'utf-8');
      }

      const tmpPath = `${absPath}.strata-tmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      await fs.writeFile(tmpPath, content, 'utf-8');
      await fs.rename(tmpPath, absPath);

      return ok(undefined);
    } catch (error) {
      return err('INTERNAL_ERROR', `Failed to write file: ${relativePath}`, toAppError(error));
    }
  }

  async readFilesForContext(relativePaths: string[]): Promise<Array<{ path: string; content: string; sha256: string }>> {
    const out: Array<{ path: string; content: string; sha256: string }> = [];

    for (const relativePath of relativePaths) {
      const fileResult = await this.readFile(relativePath);
      if (!fileResult.ok) {
        continue;
      }

      out.push({
        path: relativePath,
        content: fileResult.value.content,
        sha256: fileResult.value.sha256
      });
    }

    return out;
  }
}
