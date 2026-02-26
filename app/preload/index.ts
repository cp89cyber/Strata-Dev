import { contextBridge, ipcRenderer } from 'electron';

import type {
  AppSettings,
  ChatEvent,
  ChatTurnInput,
  CommandOutputEvent,
  FilePatch,
  PersistedSession,
  Result,
  WorkspaceMeta
} from '../shared/contracts';
import { IPCChannels } from '../shared/contracts';

export interface StrataApi {
  selectWorkspace: () => Promise<Result<WorkspaceMeta>>;
  openWorkspace: (path: string) => Promise<Result<WorkspaceMeta>>;
  listTree: (path?: string, depth?: number) => Promise<Result<import('../shared/contracts').FileNode[]>>;
  readFile: (path: string) => Promise<Result<import('../shared/contracts').ReadFileResult>>;
  writeFile: (input: { path: string; content: string; expectedSha256?: string }) => Promise<Result<void>>;
  startChatTurn: (input: ChatTurnInput) => Promise<Result<{ turnId: string }>>;
  previewPatch: (filePatches: FilePatch[]) => Promise<Result<import('../shared/contracts').PatchPreview>>;
  applyPatch: (changeSetId: string, selectedFiles?: string[]) => Promise<Result<import('../shared/contracts').ApplyResult>>;
  discardChangeSet: (changeSetId: string) => Promise<Result<void>>;
  requestCommand: (input: { sessionId: string; command: string; cwd: string }) => Promise<Result<import('../shared/contracts').CommandProposal>>;
  runCommand: (proposalId: string, confirmed: true) => Promise<Result<import('../shared/contracts').CommandRunHandle>>;
  setOpenAIKey: (key: string) => Promise<Result<void>>;
  clearOpenAIKey: () => Promise<Result<void>>;
  hasOpenAIKey: () => Promise<Result<boolean>>;
  getSettings: () => Promise<Result<AppSettings>>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<Result<AppSettings>>;
  loadSession: (sessionId?: string) => Promise<Result<PersistedSession>>;
  onChatEvent: (listener: (event: ChatEvent) => void) => () => void;
  onCommandOutput: (listener: (payload: { sessionId: string; event: CommandOutputEvent }) => void) => () => void;
}

const invoke = <T>(channel: string, payload?: unknown): Promise<Result<T>> => ipcRenderer.invoke(channel, payload);

const api: StrataApi = {
  selectWorkspace: () => invoke(IPCChannels.selectWorkspace),
  openWorkspace: (path) => invoke(IPCChannels.openWorkspace, { path }),
  listTree: (path = '.', depth = 3) => invoke(IPCChannels.listTree, { path, depth }),
  readFile: (path) => invoke(IPCChannels.readFile, { path }),
  writeFile: (input) => invoke(IPCChannels.writeFile, input),
  startChatTurn: (input) => invoke(IPCChannels.startChatTurn, input),
  previewPatch: (filePatches) => invoke(IPCChannels.previewPatch, { filePatches }),
  applyPatch: (changeSetId, selectedFiles) => invoke(IPCChannels.applyPatch, { changeSetId, selectedFiles }),
  discardChangeSet: (changeSetId) => invoke(IPCChannels.discardChangeSet, { changeSetId }),
  requestCommand: (input) => invoke(IPCChannels.requestCommand, input),
  runCommand: (proposalId, confirmed) => invoke(IPCChannels.runCommand, { proposalId, confirmed }),
  setOpenAIKey: (key) => invoke(IPCChannels.setOpenAIKey, { key }),
  clearOpenAIKey: () => invoke(IPCChannels.clearOpenAIKey),
  hasOpenAIKey: () => invoke(IPCChannels.hasOpenAIKey),
  getSettings: () => invoke(IPCChannels.getSettings),
  updateSettings: (partial) => invoke(IPCChannels.updateSettings, partial),
  loadSession: (sessionId) => invoke(IPCChannels.loadSession, { sessionId }),
  onChatEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: ChatEvent) => listener(payload);
    ipcRenderer.on(IPCChannels.chatEvent, wrapped);
    return () => ipcRenderer.off(IPCChannels.chatEvent, wrapped);
  },
  onCommandOutput: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; event: CommandOutputEvent }
    ) => listener(payload);
    ipcRenderer.on(IPCChannels.commandOutput, wrapped);
    return () => ipcRenderer.off(IPCChannels.commandOutput, wrapped);
  }
};

contextBridge.exposeInMainWorld('strata', api);
