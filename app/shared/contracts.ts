export type ISODateTime = string;

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export type AppErrorCode =
  | 'INVALID_INPUT'
  | 'WORKSPACE_NOT_OPEN'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'FILE_NOT_FOUND'
  | 'HASH_MISMATCH'
  | 'OPENAI_KEY_MISSING'
  | 'OPENAI_REQUEST_FAILED'
  | 'PATCH_PREVIEW_FAILED'
  | 'PATCH_APPLY_FAILED'
  | 'COMMAND_DENIED'
  | 'COMMAND_NOT_FOUND'
  | 'COMMAND_EXECUTION_FAILED'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

export interface WorkspaceMeta {
  rootPath: string;
  name: string;
  openedAt: ISODateTime;
}

export type FileType = 'file' | 'directory';

export interface FileNode {
  path: string;
  name: string;
  type: FileType;
  size?: number;
  mtimeMs?: number;
  children?: FileNode[];
}

export interface ReadFileResult {
  content: string;
  encoding: 'utf-8';
  sha256: string;
}

export interface FilePatch {
  path: string;
  originalContent: string;
  newContent: string;
  expectedSha256?: string;
}

export interface PatchPreviewItem {
  path: string;
  unifiedDiff: string;
  originalContent: string;
  newContent: string;
}

export interface PatchPreview {
  files: PatchPreviewItem[];
}

export type ChangeSetStatus = 'pending' | 'applied' | 'discarded' | 'failed';

export interface CodeChangeSet {
  id: string;
  sessionId: string;
  source: 'ai' | 'manual';
  summary: string;
  createdAt: ISODateTime;
  status: ChangeSetStatus;
  filePatches: FilePatch[];
  proposedCommands: CommandProposal[];
}

export type CommandPolicyDecision = 'pending' | 'approved' | 'denied';

export interface CommandProposal {
  id: string;
  sessionId: string;
  command: string;
  cwd: string;
  createdAt: ISODateTime;
  decision: CommandPolicyDecision;
  reason?: string;
}

export interface CommandRunHandle {
  runId: string;
  proposalId: string;
  startedAt: ISODateTime;
}

export interface CommandOutputEvent {
  runId: string;
  stream: 'stdout' | 'stderr' | 'exit';
  chunk?: string;
  code?: number;
  timestamp: ISODateTime;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: ISODateTime;
}

export interface ChatTurnInput {
  sessionId: string;
  prompt: string;
  activeFilePath?: string;
  selectedFilePaths: string[];
  maxContextFiles: number;
}

export type ChatEvent =
  | { type: 'token'; turnId: string; token: string }
  | { type: 'assistant_message'; turnId: string; message: ChatMessage }
  | { type: 'proposed_patch'; turnId: string; changeSet: CodeChangeSet }
  | { type: 'proposed_command'; turnId: string; command: CommandProposal }
  | { type: 'error'; turnId: string; error: AppError }
  | { type: 'done'; turnId: string };

export interface ApplyResult {
  appliedFiles: string[];
  skippedFiles: string[];
}

export interface AppSettings {
  model: string;
  temperature: number;
  maxContextFiles: number;
  requireCommandConfirmation: boolean;
  requirePatchConfirmation: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  maxContextFiles: 6,
  requireCommandConfirmation: true,
  requirePatchConfirmation: true
};

export interface PersistedSession {
  sessionId: string;
  messages: ChatMessage[];
  pendingChangeSets: CodeChangeSet[];
}

export const IPCChannels = {
  selectWorkspace: 'workspace:select',
  openWorkspace: 'workspace:open',
  listTree: 'workspace:listTree',
  readFile: 'workspace:readFile',
  writeFile: 'workspace:writeFile',
  startChatTurn: 'ai:startChatTurn',
  chatEvent: 'ai:chatEvent',
  previewPatch: 'patch:preview',
  applyPatch: 'patch:apply',
  discardChangeSet: 'patch:discard',
  requestCommand: 'shell:requestCommand',
  runCommand: 'shell:runCommand',
  commandOutput: 'shell:output',
  setOpenAIKey: 'settings:setKey',
  clearOpenAIKey: 'settings:clearKey',
  hasOpenAIKey: 'settings:hasKey',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  loadSession: 'session:load'
} as const;

export type IPCChannel = (typeof IPCChannels)[keyof typeof IPCChannels];
