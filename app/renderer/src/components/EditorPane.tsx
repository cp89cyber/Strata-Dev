import Editor from '@monaco-editor/react';

interface EditorPaneProps {
  path: string | null;
  content: string;
  dirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
}

export const EditorPane = ({ path, content, dirty, onChange, onSave }: EditorPaneProps) => {
  if (!path) {
    return (
      <section className="editor-empty">
        <h3>No file selected</h3>
        <p>Pick a file from the tree to edit it.</p>
      </section>
    );
  }

  return (
    <section className="editor-pane">
      <header className="editor-header">
        <div className="editor-path">
          {path}
          {dirty ? <span className="dirty-dot">*</span> : null}
        </div>
        <button className="btn" onClick={onSave}>
          Save
        </button>
      </header>
      <Editor
        value={content}
        language="typescript"
        theme="vs-dark"
        onChange={(value) => onChange(value ?? '')}
        options={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 13,
          minimap: { enabled: false },
          smoothScrolling: true,
          scrollBeyondLastLine: false
        }}
      />
    </section>
  );
};
