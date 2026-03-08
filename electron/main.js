const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { parseModFolder } = require('./services/modParser');
const { GlossaryManager } = require('./services/glossary');
const { TranslationService } = require('./services/translator');
const { ProjectManager } = require('./services/project');
const { ConfigManager } = require('./services/configManager');
const { LegacyTranslationService } = require('./services/legacyTranslation');
const { exportMod } = require('./services/exporter');

// IPC handler modules
const dialogHandlers = require('./ipc/dialogHandlers');
const projectHandlers = require('./ipc/projectHandlers');
const glossaryHandlers = require('./ipc/glossaryHandlers');
const aiHandlers = require('./ipc/aiHandlers');
const exportHandlers = require('./ipc/exportHandlers');
const keywordHandlers = require('./ipc/keywordHandlers');
const notificationHandlers = require('./ipc/notificationHandlers');
const legacyHandlers = require('./ipc/legacyHandlers');

let mainWindow;
let glossaryManager;
let translationService;
let projectManager;
let configManager;
let legacyTranslationService;
let isQuitting = false;

/** Returns the directory where user config files are persisted. */
function getConfigDir() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'config');
  }
  return path.join(app.getAppPath(), 'config');
}

/** Returns the directory containing bundled read-only data. */
function getDataDir() {
  return path.join(__dirname, 'data');
}

function createWindow() {
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
  const ctx = {
    getMainWindow: () => mainWindow,
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

  // Auto-save project data sent from renderer
  ipcMain.handle('project:autoSave', async (_, projectData) => {
    try {
      if (!projectData || (!projectData.projectFilePath && !projectData.modPath)) {
        return { success: false, error: 'no_path' };
      }
      const saved = await projectManager.saveProject(projectData);
      return { success: true, data: { projectFilePath: saved.projectFilePath } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Confirm-before-close: renderer responds with whether to proceed
  // Safety timeout: force close after 5 seconds if renderer is unresponsive
  let closeTimer = null;
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.webContents.send('app:before-close');
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

