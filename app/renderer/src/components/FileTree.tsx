import type { FileNode } from '@shared/contracts';

interface FileTreeProps {
  nodes: FileNode[];
  activeFilePath: string | null;
  selectedContextFiles: string[];
  onOpenFile: (path: string) => void;
  onSetContext: (path: string) => void;
}

const TreeBranch = ({
  nodes,
  activeFilePath,
  selectedContextFiles,
  onOpenFile,
  onSetContext,
  depth
}: FileTreeProps & { depth: number }) => {
  return (
    <ul className="tree-list" style={{ paddingLeft: `${depth === 0 ? 0 : 14}px` }}>
      {nodes.map((node) => {
        if (node.type === 'directory') {
          return (
            <li key={node.path}>
              <details open>
                <summary className="tree-dir">{node.name}</summary>
                {node.children ? (
                  <TreeBranch
                    nodes={node.children}
                    activeFilePath={activeFilePath}
                    selectedContextFiles={selectedContextFiles}
                    onOpenFile={onOpenFile}
                    onSetContext={onSetContext}
                    depth={depth + 1}
                  />
                ) : null}
              </details>
            </li>
          );
        }

        const isActive = node.path === activeFilePath;
        const isSelected = selectedContextFiles.includes(node.path);

        return (
          <li key={node.path} className={`tree-file-row ${isActive ? 'active' : ''}`}>
            <button className="tree-file-button" onClick={() => onOpenFile(node.path)}>
              {node.name}
            </button>
            <label className="context-toggle" title="Include file in AI context">
              <input type="checkbox" checked={isSelected} onChange={() => onSetContext(node.path)} />
              <span>ctx</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
};

export const FileTree = (props: FileTreeProps) => (
  <div className="file-tree">
    <TreeBranch {...props} depth={0} />
  </div>
);
