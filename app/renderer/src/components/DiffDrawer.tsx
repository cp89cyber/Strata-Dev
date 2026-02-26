import { useEffect, useMemo, useState } from 'react';

import { DiffEditor } from '@monaco-editor/react';

import type { CodeChangeSet } from '@shared/contracts';

interface DiffDrawerProps {
  changeSets: CodeChangeSet[];
  onApply: (changeSetId: string, selectedFiles: string[]) => Promise<void>;
  onDiscard: (changeSetId: string) => Promise<void>;
}

export const DiffDrawer = ({ changeSets, onApply, onDiscard }: DiffDrawerProps) => {
  const [selectedChangeSetId, setSelectedChangeSetId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  useEffect(() => {
    if (changeSets.length === 0) {
      setSelectedChangeSetId(null);
      setSelectedFilePath(null);
      setSelectedFiles([]);
      return;
    }

    const nextChangeSetId = selectedChangeSetId && changeSets.some((set) => set.id === selectedChangeSetId)
      ? selectedChangeSetId
      : changeSets[0].id;

    setSelectedChangeSetId(nextChangeSetId);
  }, [changeSets, selectedChangeSetId]);

  const selectedChangeSet = useMemo(
    () => changeSets.find((item) => item.id === selectedChangeSetId) ?? null,
    [changeSets, selectedChangeSetId]
  );

  useEffect(() => {
    if (!selectedChangeSet) {
      setSelectedFilePath(null);
      setSelectedFiles([]);
      return;
    }

    setSelectedFiles((prev) =>
      prev.length > 0 ? prev.filter((path) => selectedChangeSet.filePatches.some((patch) => patch.path === path)) : selectedChangeSet.filePatches.map((patch) => patch.path)
    );

    if (!selectedFilePath || !selectedChangeSet.filePatches.some((patch) => patch.path === selectedFilePath)) {
      setSelectedFilePath(selectedChangeSet.filePatches[0]?.path ?? null);
    }
  }, [selectedChangeSet, selectedFilePath]);

  const selectedPatch = selectedChangeSet?.filePatches.find((patch) => patch.path === selectedFilePath) ?? null;

  if (changeSets.length === 0) {
    return (
      <section className="diff-drawer empty">
        <h3>Patches</h3>
        <p>No pending patch proposals.</p>
      </section>
    );
  }

  if (!selectedChangeSet) {
    return null;
  }

  return (
    <section className="diff-drawer">
      <header className="panel-header">
        <h3>Patches</h3>
      </header>

      <div className="changeset-list">
        {changeSets.map((changeSet) => (
          <button
            key={changeSet.id}
            className={`changeset-button ${changeSet.id === selectedChangeSet.id ? 'active' : ''}`}
            onClick={() => setSelectedChangeSetId(changeSet.id)}
          >
            <span>{changeSet.summary || 'AI patch'}</span>
            <small>{new Date(changeSet.createdAt).toLocaleTimeString()}</small>
          </button>
        ))}
      </div>

      <div className="changeset-file-list">
        {selectedChangeSet.filePatches.map((patch) => {
          const checked = selectedFiles.includes(patch.path);
          return (
            <label key={patch.path} className={`file-select-row ${patch.path === selectedFilePath ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  setSelectedFiles((prev) =>
                    checked ? prev.filter((path) => path !== patch.path) : [...prev, patch.path]
                  );
                }}
              />
              <button type="button" onClick={() => setSelectedFilePath(patch.path)}>
                {patch.path}
              </button>
            </label>
          );
        })}
      </div>

      <div className="diff-viewer">
        {selectedPatch ? (
          <DiffEditor
            language="typescript"
            original={selectedPatch.originalContent}
            modified={selectedPatch.newContent}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 13,
              renderSideBySide: true
            }}
          />
        ) : (
          <p>Select a file to preview changes.</p>
        )}
      </div>

      <footer className="changeset-actions">
        <button
          className="btn btn-accent"
          onClick={() => onApply(selectedChangeSet.id, selectedFiles)}
          disabled={selectedFiles.length === 0}
        >
          Apply Selected
        </button>
        <button className="btn" onClick={() => onDiscard(selectedChangeSet.id)}>
          Discard
        </button>
      </footer>
    </section>
  );
};
