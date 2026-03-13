import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import * as path from 'path';
import { parseModFolder } from './services/modParser';
import { GlossaryManager } from './services/glossary';
import { TranslationService } from './services/translator';
import { ProjectManager } from './services/project';
import { ConfigManager } from './services/configManager';
import { LegacyTranslationService } from './services/legacyTranslation';
import { exportMod } from './services/exporter';
import type { IPCContext } from '../types/ipc';
import type { Project } from '../types/project';

// IPC handler modules
import * as dialogHandlers from './ipc/dialogHandlers';
import * as projectHandlers from './ipc/projectHandlers';
import * as glossaryHandlers from './ipc/glossaryHandlers';
import * as aiHandlers from './ipc/aiHandlers';
import * as exportHandlers from './ipc/exportHandlers';
import * as keywordHandlers from './ipc/keywordHandlers';
import * as notificationHandlers from './ipc/notificationHandlers';
import * as legacyHandlers from './ipc/legacyHandlers';
import * as fileHandlers from './ipc/fileHandlers';

let mainWindow: BrowserWindow | null;
let glossaryManager: GlossaryManager;
let translationService: TranslationService;
let projectManager: ProjectManager;
let configManager: ConfigManager;
let legacyTranslationService: LegacyTranslationService;
let isQuitting = false;

/**
 * Returns the directory where user config files are persisted.
 * In packaged app: config/ next to executable
 * In dev: config/ in project root
 */
function getConfigDir(): string {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'config');
  }
  return path.join(app.getAppPath(), 'config');
}

/**
 * Returns the directory containing bundled read-only data.
 */
function getDataDir(): string {
  return path.join(__dirname, 'data');
}

/**
 * Create the main application window
 */
function createWindow(): void {
  // Hide the default native menu bar
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: '远行星号 MOD 翻译工具',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  configManager = new ConfigManager(getConfigDir(), getDataDir());
  configManager.initialize();

  glossaryManager = new GlossaryManager();
  translationService = new TranslationService();
  projectManager = new ProjectManager();
  legacyTranslationService = new LegacyTranslationService();

  // Load persisted AI config into translation service (always, not just when key exists)
  const savedConfig = configManager.getModelConfig();
  translationService.configure(savedConfig);

  createWindow();

  // Shared context for IPC handler modules
  const ctx: IPCContext = {
    getMainWindow: () => mainWindow!,
    glossaryManager,
    translationService,
    projectManager,
    configManager,
    legacyTranslationService,
    parseModFolder,
    exportMod,
  };

  dialogHandlers.register(ctx);
  projectHandlers.register(ctx);
  glossaryHandlers.register(ctx);
  aiHandlers.register(ctx);
  exportHandlers.register(ctx);
  keywordHandlers.register(ctx);
  notificationHandlers.register(ctx);
  legacyHandlers.register(ctx);
  fileHandlers.register(ctx);

  /**
   * Auto-save project data sent from renderer
   * Used by auto-save timer and before-close handler
   */
  ipcMain.handle('project:autoSave', async (_, projectData: Project) => {
    try {
      if (!projectData || (!projectData.projectFilePath && !projectData.modPath)) {
        return { success: false, error: 'no_path' };
      }
      const saved = await projectManager.saveProject(projectData);
      return { success: true, data: { projectFilePath: saved.projectFilePath } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Confirm-before-close: renderer responds with whether to proceed
   * Safety timeout: force close after 5 seconds if renderer is unresponsive
   */
  let closeTimer: NodeJS.Timeout | null = null;
  mainWindow!.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow!.webContents.send('app:before-close');
    closeTimer = setTimeout(() => {
      isQuitting = true;
      if (mainWindow) mainWindow.close();
    }, 5000);
  });

  ipcMain.on('app:close-confirmed', () => {
    if (closeTimer) clearTimeout(closeTimer);
    isQuitting = true;
    if (mainWindow) mainWindow.close();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
