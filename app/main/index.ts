import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';

import { registerIpcHandlers } from './ipc';
import { AIService } from './services/aiService';
import { DatabaseService } from './services/databaseService';
import { PatchService } from './services/patchService';
import { SettingsService } from './services/settingsService';
import { ShellService } from './services/shellService';
import { WorkspaceService } from './services/workspaceService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

app.whenReady().then(() => {
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
