import { createPatch } from 'diff';

import type { ApplyResult, CodeChangeSet, FilePatch, PatchPreview, PatchPreviewItem, Result } from '../../shared/contracts';

import { DatabaseService } from './databaseService';
import { err, ok, toAppError } from './errors';
import { WorkspaceService } from './workspaceService';

export class PatchService {
  private readonly pendingById = new Map<string, CodeChangeSet>();

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly database: DatabaseService
  ) {}

  cacheChangeSets(changeSets: CodeChangeSet[]): void {
    for (const changeSet of changeSets) {
      if (changeSet.status === 'pending') {
        this.pendingById.set(changeSet.id, changeSet);
      }
    }
  }

  registerChangeSet(changeSet: CodeChangeSet): Result<CodeChangeSet> {
    try {
      this.pendingById.set(changeSet.id, changeSet);
      this.database.safeCall(() => this.database.saveChangeSet(changeSet));
      return ok(changeSet);
    } catch (error) {
      return err('DATABASE_ERROR', 'Failed to persist change set', toAppError(error));
    }
  }

  previewPatch(filePatches: FilePatch[]): Result<PatchPreview> {
    try {
      const files: PatchPreviewItem[] = filePatches.map((filePatch) => ({
        path: filePatch.path,
        originalContent: filePatch.originalContent,
        newContent: filePatch.newContent,
        unifiedDiff: createPatch(filePatch.path, filePatch.originalContent, filePatch.newContent)
      }));

      return ok({ files });
    } catch (error) {
      return err('PATCH_PREVIEW_FAILED', 'Unable to generate patch preview', toAppError(error));
    }
  }

  getChangeSet(changeSetId: string): CodeChangeSet | undefined {
    return this.pendingById.get(changeSetId);
  }

  async applyPatch(changeSetId: string, selectedFiles?: string[]): Promise<Result<ApplyResult>> {
    const changeSet = this.pendingById.get(changeSetId);
    if (!changeSet) {
      return err('PATCH_APPLY_FAILED', `Change set not found: ${changeSetId}`);
    }

    const selectedSet = new Set(selectedFiles ?? changeSet.filePatches.map((item) => item.path));

    const appliedFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const filePatch of changeSet.filePatches) {
      if (!selectedSet.has(filePatch.path)) {
        skippedFiles.push(filePatch.path);
        continue;
      }

      const writeResult = await this.workspaceService.writeFile(
        filePatch.path,
        filePatch.newContent,
        filePatch.expectedSha256
      );

      if (!writeResult.ok) {
        skippedFiles.push(filePatch.path);
        changeSet.status = 'failed';
        this.database.safeCall(() => this.database.updateChangeSetStatus(changeSet.id, 'failed'));
        return err('PATCH_APPLY_FAILED', `Failed applying patch for ${filePatch.path}`, writeResult.error);
      }

      appliedFiles.push(filePatch.path);
    }

    changeSet.status = 'applied';
    this.pendingById.delete(changeSet.id);
    this.database.safeCall(() => this.database.updateChangeSetStatus(changeSet.id, 'applied'));

    return ok({
      appliedFiles,
      skippedFiles
    });
  }

  discardChangeSet(changeSetId: string): Result<void> {
    const changeSet = this.pendingById.get(changeSetId);
    if (!changeSet) {
      return err('PATCH_APPLY_FAILED', `Change set not found: ${changeSetId}`);
    }

    changeSet.status = 'discarded';
    this.pendingById.delete(changeSetId);
    this.database.safeCall(() => this.database.updateChangeSetStatus(changeSetId, 'discarded'));
    return ok(undefined);
  }
}
