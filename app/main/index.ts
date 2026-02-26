import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, dialog } from 'electron';

import { registerIpcHandlers } from './ipc';
import { AIService } from './services/aiService';
import { DatabaseService } from './services/databaseService';
import { applyGpuRuntimePolicy } from './services/gpuRuntimePolicy';
import { formatNativeModuleRecoveryMessage, parseNativeModuleAbiMismatch } from './services/nativeModuleDiagnostics';
import { PatchService } from './services/patchService';
import { SettingsService } from './services/settingsService';
import { ShellService } from './services/shellService';
import { WorkspaceService } from './services/workspaceService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

applyGpuRuntimePolicy(app, process.platform, process.env);

let mainWindow: BrowserWindow | null = null;

const createMainWindow = (): BrowserWindow => {
  const preloadPath = path.resolve(__dirname, 'index.mjs');

  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Strata Dev',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererHtml = path.resolve(__dirname, '../../../dist/index.html');
    window.loadFile(rendererHtml);
  }

  return window;
};

const bootstrapApp = async (): Promise<void> => {
  const database = new DatabaseService(DatabaseService.resolveDbPath(app.getPath('userData')));
  const workspaceService = new WorkspaceService();
  const settingsService = new SettingsService(database);
  const patchService = new PatchService(workspaceService, database);
  const shellService = new ShellService(workspaceService, database);
  const aiService = new AIService(settingsService, workspaceService, patchService, shellService, database);

  mainWindow = createMainWindow();

  registerIpcHandlers({
    getMainWindow: () => mainWindow,
    workspaceService,
    settingsService,
    patchService,
    shellService,
    aiService,
    database
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });

  app.on('before-quit', () => {
    database.close();
  });
};

const handleStartupFailure = (error: unknown): void => {
  const mismatch = parseNativeModuleAbiMismatch(error);

  if (mismatch) {
    dialog.showErrorBox('Strata Dev Startup Error', formatNativeModuleRecoveryMessage(mismatch));
  } else {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    dialog.showErrorBox(
      'Strata Dev Startup Error',
      `The app failed to start.\n\n${message}\n\nCheck the main-process logs for the full stack trace.`
    );
  }

  console.error('Failed to bootstrap app', error);
  app.exit(1);
};

app.whenReady().then(bootstrapApp).catch(handleStartupFailure);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
