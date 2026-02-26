import { useEffect } from 'react';

import { ChatPanel } from './components/ChatPanel';
import { DiffDrawer } from './components/DiffDrawer';
import { EditorPane } from './components/EditorPane';
import { FileTree } from './components/FileTree';
import { SettingsModal } from './components/SettingsModal';
import { TerminalPanel } from './components/TerminalPanel';
import { useAppStore } from './state/useAppStore';

export default function App() {
  const workspace = useAppStore((state) => state.workspace);
  const tree = useAppStore((state) => state.tree);
  const openFiles = useAppStore((state) => state.openFiles);
  const activeFilePath = useAppStore((state) => state.activeFilePath);
  const selectedContextFiles = useAppStore((state) => state.selectedContextFiles);
  const fileBuffers = useAppStore((state) => state.fileBuffers);
  const messages = useAppStore((state) => state.messages);
  const streamingByTurn = useAppStore((state) => state.streamingByTurn);
  const pendingChangeSets = useAppStore((state) => state.pendingChangeSets);
  const commandProposals = useAppStore((state) => state.commandProposals);
  const terminalEvents = useAppStore((state) => state.terminalEvents);
  const settings = useAppStore((state) => state.settings);
  const hasOpenAIKey = useAppStore((state) => state.hasOpenAIKey);
  const isThinking = useAppStore((state) => state.isThinking);
  const errorMessage = useAppStore((state) => state.errorMessage);
  const showSettings = useAppStore((state) => state.showSettings);

  const initialize = useAppStore((state) => state.initialize);
  const openWorkspaceFromDialog = useAppStore((state) => state.openWorkspaceFromDialog);
  const refreshTree = useAppStore((state) => state.refreshTree);
  const openFile = useAppStore((state) => state.openFile);
  const setActiveFile = useAppStore((state) => state.setActiveFile);
  const toggleContextFile = useAppStore((state) => state.toggleContextFile);
  const updateActiveFileContent = useAppStore((state) => state.updateActiveFileContent);
  const saveActiveFile = useAppStore((state) => state.saveActiveFile);
  const sendPrompt = useAppStore((state) => state.sendPrompt);
  const handleChatEvent = useAppStore((state) => state.handleChatEvent);
  const handleCommandOutput = useAppStore((state) => state.handleCommandOutput);
  const applyChangeSet = useAppStore((state) => state.applyChangeSet);
  const discardChangeSet = useAppStore((state) => state.discardChangeSet);
  const runCommandProposal = useAppStore((state) => state.runCommandProposal);
  const setSettingsVisible = useAppStore((state) => state.setSettingsVisible);
  const setOpenAIKey = useAppStore((state) => state.setOpenAIKey);
  const clearOpenAIKey = useAppStore((state) => state.clearOpenAIKey);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setError = useAppStore((state) => state.setError);

  useEffect(() => {
    void initialize();

    const unsubscribeChat = window.strata.onChatEvent((event) => {
      handleChatEvent(event);
    });

    const unsubscribeShell = window.strata.onCommandOutput((payload) => {
      handleCommandOutput(payload);
    });

    return () => {
      unsubscribeChat();
      unsubscribeShell();
    };
  }, [initialize, handleChatEvent, handleCommandOutput]);

  const activeBuffer = activeFilePath ? fileBuffers[activeFilePath] : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Strata Dev</h1>
          <p>{workspace ? `Workspace: ${workspace.rootPath}` : 'No workspace open'}</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-accent" onClick={() => void openWorkspaceFromDialog()}>
            Open Folder
          </button>
          <button className="btn" onClick={() => void refreshTree()} disabled={!workspace}>
            Refresh Tree
          </button>
          <button className="btn" onClick={() => setSettingsVisible(true)}>
            Settings
          </button>
        </div>
      </header>

      {errorMessage ? (
        <section className="error-banner" onClick={() => setError(null)} role="button" tabIndex={0}>
          <strong>Error:</strong> {errorMessage}
        </section>
      ) : null}

      <main className="main-grid">
        <aside className="sidebar panel">
          <header className="panel-header">
            <h3>Files</h3>
          </header>
          <FileTree
            nodes={tree}
            activeFilePath={activeFilePath}
            selectedContextFiles={selectedContextFiles}
            onOpenFile={(path) => void openFile(path)}
            onSetContext={toggleContextFile}
          />
        </aside>

        <section className="workspace-pane panel">
          <div className="tab-row">
            {openFiles.map((filePath) => (
              <button
                key={filePath}
                className={`tab-button ${activeFilePath === filePath ? 'active' : ''}`}
                onClick={() => setActiveFile(filePath)}
              >
                {filePath}
              </button>
            ))}
          </div>

          <EditorPane
            path={activeFilePath}
            content={activeBuffer?.content ?? ''}
            dirty={Boolean(activeBuffer?.dirty)}
            onChange={updateActiveFileContent}
            onSave={() => void saveActiveFile()}
          />

          <DiffDrawer
            changeSets={pendingChangeSets}
            onApply={async (changeSetId, selectedFiles) => applyChangeSet(changeSetId, selectedFiles)}
            onDiscard={async (changeSetId) => discardChangeSet(changeSetId)}
          />
        </section>

        <aside className="agent-pane panel">
          <ChatPanel
            messages={messages}
            streamingByTurn={streamingByTurn}
            isThinking={isThinking}
            onSend={sendPrompt}
          />
        </aside>
      </main>

      <TerminalPanel proposals={commandProposals} events={terminalEvents} onRunProposal={runCommandProposal} />

      {!workspace ? (
        <section className="overlay-card">
          <h2>Open a project folder</h2>
          <p>This MVP runs on one workspace at a time and scopes all edits/commands to that folder.</p>
          <button className="btn btn-accent" onClick={() => void openWorkspaceFromDialog()}>
            Select Workspace
          </button>
        </section>
      ) : null}

      {!hasOpenAIKey ? (
        <section className="overlay-card key-warning">
          <h2>API key required</h2>
          <p>Add your OpenAI API key in Settings to enable chat and code actions.</p>
          <button className="btn" onClick={() => setSettingsVisible(true)}>
            Open Settings
          </button>
        </section>
      ) : null}

      <SettingsModal
        visible={showSettings}
        hasOpenAIKey={hasOpenAIKey}
        settings={settings}
        onClose={() => setSettingsVisible(false)}
        onSaveKey={setOpenAIKey}
        onClearKey={clearOpenAIKey}
        onUpdateSettings={updateSettings}
      />
    </div>
  );
}
