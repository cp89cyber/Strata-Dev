import { dialog, ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { ZodSchema } from 'zod';

import { IPCChannels, type Result } from '../shared/contracts';
import {
  applyPatchInputSchema,
  chatTurnInputSchema,
  discardPatchInputSchema,
  listTreeInputSchema,
  loadSessionInputSchema,
  openWorkspaceInputSchema,
  previewPatchInputSchema,
  readFileInputSchema,
  requestCommandInputSchema,
  runCommandInputSchema,
  setKeyInputSchema,
  updateSettingsInputSchema,
  writeFileInputSchema
} from '../shared/validation';

import { AIService } from './services/aiService';
import { DatabaseService } from './services/databaseService';
import { err, ok } from './services/errors';
import { PatchService } from './services/patchService';
import { SettingsService } from './services/settingsService';
import { ShellService } from './services/shellService';
import { WorkspaceService } from './services/workspaceService';

interface HandlerServices {
  getMainWindow: () => Electron.BrowserWindow | null;
  workspaceService: WorkspaceService;
  settingsService: SettingsService;
  patchService: PatchService;
  shellService: ShellService;
  aiService: AIService;
  database: DatabaseService;
}

const validate = <T>(schema: ZodSchema<T>, input: unknown): Result<T> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err('INVALID_INPUT', 'Invalid payload', parsed.error.flatten());
  }

  return ok(parsed.data);
};

export const registerIpcHandlers = ({
  getMainWindow,
  workspaceService,
  settingsService,
  patchService,
  shellService,
  aiService,
  database
}: HandlerServices): void => {
  const sendToRenderer = (channel: string, payload: unknown) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(channel, payload);
  };

  shellService.onOutput((sessionId, event) => {
    sendToRenderer(IPCChannels.commandOutput, {
      sessionId,
      event
    });
  });

  ipcMain.handle(IPCChannels.selectWorkspace, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return err('INTERNAL_ERROR', 'Main window is unavailable');
    }

    const selection = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return err('INVALID_INPUT', 'Workspace selection was cancelled');
    }

    return workspaceService.openWorkspace(selection.filePaths[0]);
  });

  ipcMain.handle(IPCChannels.openWorkspace, async (_event, payload) => {
    const parsed = validate(openWorkspaceInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return workspaceService.openWorkspace(parsed.value.path);
  });

  ipcMain.handle(IPCChannels.listTree, async (_event, payload) => {
    const parsed = validate(listTreeInputSchema, payload ?? {});
    if (!parsed.ok) {
      return parsed;
    }

    return workspaceService.listTree(parsed.value.path, parsed.value.depth);
  });

  ipcMain.handle(IPCChannels.readFile, async (_event, payload) => {
    const parsed = validate(readFileInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return workspaceService.readFile(parsed.value.path);
  });

  ipcMain.handle(IPCChannels.writeFile, async (_event, payload) => {
    const parsed = validate(writeFileInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return workspaceService.writeFile(parsed.value.path, parsed.value.content, parsed.value.expectedSha256);
  });

  ipcMain.handle(IPCChannels.startChatTurn, async (_event, payload) => {
    const parsed = validate(chatTurnInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return aiService.startChatTurn(parsed.value, (chatEvent) => {
      sendToRenderer(IPCChannels.chatEvent, chatEvent);
    });
  });

  ipcMain.handle(IPCChannels.previewPatch, async (_event, payload) => {
    const parsed = validate(previewPatchInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return patchService.previewPatch(parsed.value.filePatches);
  });

  ipcMain.handle(IPCChannels.applyPatch, async (_event, payload) => {
    const parsed = validate(applyPatchInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return patchService.applyPatch(parsed.value.changeSetId, parsed.value.selectedFiles);
  });

  ipcMain.handle(IPCChannels.discardChangeSet, async (_event, payload) => {
    const parsed = validate(discardPatchInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return patchService.discardChangeSet(parsed.value.changeSetId);
  });

  ipcMain.handle(IPCChannels.requestCommand, async (_event, payload) => {
    const parsed = validate(requestCommandInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return shellService.requestCommand(parsed.value.sessionId, parsed.value.command, parsed.value.cwd);
  });

  ipcMain.handle(IPCChannels.runCommand, async (_event, payload) => {
    const parsed = validate(runCommandInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return shellService.runCommand(parsed.value.proposalId, parsed.value.confirmed);
  });

  ipcMain.handle(IPCChannels.setOpenAIKey, async (_event, payload) => {
    const parsed = validate(setKeyInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return settingsService.setOpenAIKey(parsed.value.key);
  });

  ipcMain.handle(IPCChannels.clearOpenAIKey, async () => settingsService.clearOpenAIKey());
  ipcMain.handle(IPCChannels.hasOpenAIKey, async () => settingsService.hasOpenAIKey());
  ipcMain.handle(IPCChannels.getSettings, async () => ok(settingsService.getSettings()));

  ipcMain.handle(IPCChannels.updateSettings, async (_event, payload) => {
    const parsed = validate(updateSettingsInputSchema, payload);
    if (!parsed.ok) {
      return parsed;
    }

    return settingsService.updateSettings(parsed.value);
  });

  ipcMain.handle(IPCChannels.loadSession, async (_event, payload) => {
    const parsed = validate(loadSessionInputSchema, payload ?? {});
    if (!parsed.ok) {
      return parsed;
    }

    const sessionId = parsed.value.sessionId ?? database.getLastSessionId() ?? uuidv4();
    const session = database.safeCall(() => database.loadSession(sessionId));
    patchService.cacheChangeSets(session.pendingChangeSets);
    return ok(session);
  });
};
