import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';

import type {
  AppSettings,
  ChatEvent,
  ChatMessage,
  CodeChangeSet,
  CommandOutputEvent,
  CommandProposal,
  FileNode,
  WorkspaceMeta
} from '@shared/contracts';
import { DEFAULT_SETTINGS } from '@shared/contracts';

interface FileBuffer {
  content: string;
  sha256: string;
  dirty: boolean;
}

interface AppState {
  sessionId: string;
  workspace: WorkspaceMeta | null;
  tree: FileNode[];
  openFiles: string[];
  activeFilePath: string | null;
  selectedContextFiles: string[];
  fileBuffers: Record<string, FileBuffer>;
  messages: ChatMessage[];
  streamingByTurn: Record<string, string>;
  pendingChangeSets: CodeChangeSet[];
  commandProposals: CommandProposal[];
  terminalEvents: CommandOutputEvent[];
  settings: AppSettings;
  hasOpenAIKey: boolean;
  activeTurns: number;
  isThinking: boolean;
  errorMessage: string | null;
  showSettings: boolean;
  initialize: () => Promise<void>;
  openWorkspaceFromDialog: () => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (relativePath: string) => Promise<void>;
  setActiveFile: (relativePath: string) => void;
  toggleContextFile: (relativePath: string) => void;
  updateActiveFileContent: (content: string) => void;
  saveActiveFile: () => Promise<void>;
  setError: (message: string | null) => void;
  sendPrompt: (prompt: string) => Promise<void>;
  handleChatEvent: (event: ChatEvent) => void;
  handleCommandOutput: (payload: { sessionId: string; event: CommandOutputEvent }) => void;
  applyChangeSet: (changeSetId: string, selectedFiles?: string[]) => Promise<void>;
  discardChangeSet: (changeSetId: string) => Promise<void>;
  runCommandProposal: (proposalId: string) => Promise<void>;
  setSettingsVisible: (visible: boolean) => void;
  setOpenAIKey: (key: string) => Promise<void>;
  clearOpenAIKey: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

const capEvents = <T>(input: T[], max: number): T[] => (input.length <= max ? input : input.slice(input.length - max));

export const useAppStore = create<AppState>((set, get) => ({
  sessionId: uuidv4(),
  workspace: null,
  tree: [],
  openFiles: [],
  activeFilePath: null,
  selectedContextFiles: [],
  fileBuffers: {},
  messages: [],
  streamingByTurn: {},
  pendingChangeSets: [],
  commandProposals: [],
  terminalEvents: [],
  settings: DEFAULT_SETTINGS,
  hasOpenAIKey: false,
  activeTurns: 0,
  isThinking: false,
  errorMessage: null,
  showSettings: false,

  initialize: async () => {
    const [settingsResult, keyResult, sessionResult] = await Promise.all([
      window.strata.getSettings(),
      window.strata.hasOpenAIKey(),
      window.strata.loadSession()
    ]);

    if (settingsResult.ok) {
      set({ settings: settingsResult.value });
    }

    if (keyResult.ok) {
      set({ hasOpenAIKey: keyResult.value });
    }

    if (sessionResult.ok) {
      set({
        sessionId: sessionResult.value.sessionId,
        messages: sessionResult.value.messages,
        pendingChangeSets: sessionResult.value.pendingChangeSets
      });
    }
  },

  openWorkspaceFromDialog: async () => {
    const result = await window.strata.selectWorkspace();
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set({ workspace: result.value, errorMessage: null, tree: [], openFiles: [], activeFilePath: null, fileBuffers: {} });
    await get().refreshTree();
  },

  refreshTree: async () => {
    const result = await window.strata.listTree('.', 4);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set({ tree: result.value });
  },

  openFile: async (relativePath: string) => {
    const cached = get().fileBuffers[relativePath];
    if (cached) {
      set((state) => ({
        activeFilePath: relativePath,
        openFiles: state.openFiles.includes(relativePath) ? state.openFiles : [...state.openFiles, relativePath]
      }));
      return;
    }

    const fileResult = await window.strata.readFile(relativePath);
    if (!fileResult.ok) {
      set({ errorMessage: fileResult.error.message });
      return;
    }

    set((state) => ({
      activeFilePath: relativePath,
      openFiles: state.openFiles.includes(relativePath) ? state.openFiles : [...state.openFiles, relativePath],
      fileBuffers: {
        ...state.fileBuffers,
        [relativePath]: {
          content: fileResult.value.content,
          sha256: fileResult.value.sha256,
          dirty: false
        }
      }
    }));
  },

  setActiveFile: (relativePath: string) => set({ activeFilePath: relativePath }),

  toggleContextFile: (relativePath: string) => {
    set((state) => {
      if (state.selectedContextFiles.includes(relativePath)) {
        return {
          selectedContextFiles: state.selectedContextFiles.filter((path) => path !== relativePath)
        };
      }

      return {
        selectedContextFiles: [...state.selectedContextFiles, relativePath].slice(0, state.settings.maxContextFiles)
      };
    });
  },

  updateActiveFileContent: (content: string) => {
    const activeFilePath = get().activeFilePath;
    if (!activeFilePath) {
      return;
    }

    set((state) => ({
      fileBuffers: {
        ...state.fileBuffers,
        [activeFilePath]: {
          ...state.fileBuffers[activeFilePath],
          content,
          dirty: true
        }
      }
    }));
  },

  saveActiveFile: async () => {
    const activeFilePath = get().activeFilePath;
    if (!activeFilePath) {
      return;
    }

    const buffer = get().fileBuffers[activeFilePath];
    if (!buffer) {
      return;
    }

    const writeResult = await window.strata.writeFile({
      path: activeFilePath,
      content: buffer.content,
      expectedSha256: buffer.sha256
    });

    if (!writeResult.ok) {
      set({ errorMessage: writeResult.error.message });
      return;
    }

    const readResult = await window.strata.readFile(activeFilePath);
    if (!readResult.ok) {
      set({ errorMessage: readResult.error.message });
      return;
    }

    set((state) => ({
      fileBuffers: {
        ...state.fileBuffers,
        [activeFilePath]: {
          content: readResult.value.content,
          sha256: readResult.value.sha256,
          dirty: false
        }
      }
    }));
  },

  setError: (message: string | null) => set({ errorMessage: message }),

  sendPrompt: async (prompt: string) => {
    const state = get();
    if (!prompt.trim()) {
      return;
    }

    const turnResult = await window.strata.startChatTurn({
      sessionId: state.sessionId,
      prompt,
      activeFilePath: state.activeFilePath ?? undefined,
      selectedFilePaths: state.selectedContextFiles,
      maxContextFiles: state.settings.maxContextFiles
    });

    if (!turnResult.ok) {
      set({ errorMessage: turnResult.error.message });
      return;
    }

    const optimisticUserMessage: ChatMessage = {
      id: uuidv4(),
      sessionId: state.sessionId,
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString()
    };

    set((prev) => ({
      messages: [...prev.messages, optimisticUserMessage],
      activeTurns: prev.activeTurns + 1,
      isThinking: true,
      errorMessage: null
    }));
  },

  handleChatEvent: (event: ChatEvent) => {
    if (event.type === 'token') {
      set((state) => ({
        streamingByTurn: {
          ...state.streamingByTurn,
          [event.turnId]: `${state.streamingByTurn[event.turnId] ?? ''}${event.token}`
        }
      }));
      return;
    }

    if (event.type === 'assistant_message') {
      set((state) => {
        const deduped = state.messages.filter(
          (message) => !(message.role === 'assistant' && message.createdAt === event.message.createdAt && message.content === event.message.content)
        );

        const nextStreaming = { ...state.streamingByTurn };
        delete nextStreaming[event.turnId];

        return {
          messages: [...deduped, event.message],
          streamingByTurn: nextStreaming
        };
      });
      return;
    }

    if (event.type === 'proposed_patch') {
      set((state) => ({
        pendingChangeSets: [event.changeSet, ...state.pendingChangeSets]
      }));
      return;
    }

    if (event.type === 'proposed_command') {
      set((state) => ({
        commandProposals: [event.command, ...state.commandProposals]
      }));
      return;
    }

    if (event.type === 'error') {
      set({ errorMessage: event.error.message });
      return;
    }

    if (event.type === 'done') {
      set((state) => {
        const nextStreaming = { ...state.streamingByTurn };
        const streamText = nextStreaming[event.turnId];
        delete nextStreaming[event.turnId];

        const maybeAssistantMessage =
          streamText && streamText.trim().length > 0
            ? {
                id: uuidv4(),
                sessionId: state.sessionId,
                role: 'assistant' as const,
                content: streamText,
                createdAt: new Date().toISOString()
              }
            : null;

        const nextActiveTurns = Math.max(0, state.activeTurns - 1);

        return {
          streamingByTurn: nextStreaming,
          messages: maybeAssistantMessage ? [...state.messages, maybeAssistantMessage] : state.messages,
          activeTurns: nextActiveTurns,
          isThinking: nextActiveTurns > 0
        };
      });
    }
  },

  handleCommandOutput: ({ event }) => {
    set((state) => ({
      terminalEvents: capEvents([...state.terminalEvents, event], 2000)
    }));
  },

  applyChangeSet: async (changeSetId: string, selectedFiles?: string[]) => {
    const result = await window.strata.applyPatch(changeSetId, selectedFiles);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set((state) => ({
      pendingChangeSets: state.pendingChangeSets.filter((item) => item.id !== changeSetId)
    }));

    const activeFilePath = get().activeFilePath;
    if (activeFilePath && result.value.appliedFiles.includes(activeFilePath)) {
      await get().openFile(activeFilePath);
    }

    await get().refreshTree();
  },

  discardChangeSet: async (changeSetId: string) => {
    const result = await window.strata.discardChangeSet(changeSetId);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set((state) => ({
      pendingChangeSets: state.pendingChangeSets.filter((item) => item.id !== changeSetId)
    }));
  },

  runCommandProposal: async (proposalId: string) => {
    const result = await window.strata.runCommand(proposalId, true);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set((state) => ({
      commandProposals: state.commandProposals.map((proposal) =>
        proposal.id === proposalId
          ? {
              ...proposal,
              decision: 'approved'
            }
          : proposal
      )
    }));
  },

  setSettingsVisible: (visible: boolean) => set({ showSettings: visible }),

  setOpenAIKey: async (key: string) => {
    const result = await window.strata.setOpenAIKey(key);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set({ hasOpenAIKey: true, errorMessage: null });
  },

  clearOpenAIKey: async () => {
    const result = await window.strata.clearOpenAIKey();
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set({ hasOpenAIKey: false, errorMessage: null });
  },

  updateSettings: async (partial: Partial<AppSettings>) => {
    const result = await window.strata.updateSettings(partial);
    if (!result.ok) {
      set({ errorMessage: result.error.message });
      return;
    }

    set({ settings: result.value, errorMessage: null });
  }
}));
