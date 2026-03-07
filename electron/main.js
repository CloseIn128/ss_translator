const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { parseModFolder } = require('./services/modParser');
const { GlossaryManager } = require('./services/glossary');
const { TranslationService } = require('./services/translator');
const { ProjectManager } = require('./services/project');
const { ConfigManager } = require('./services/configManager');
const { exportMod } = require('./services/exporter');

// IPC handler modules
const dialogHandlers = require('./ipc/dialogHandlers');
const projectHandlers = require('./ipc/projectHandlers');
const glossaryHandlers = require('./ipc/glossaryHandlers');
const aiHandlers = require('./ipc/aiHandlers');
const exportHandlers = require('./ipc/exportHandlers');
const keywordHandlers = require('./ipc/keywordHandlers');
const notificationHandlers = require('./ipc/notificationHandlers');

let mainWindow;
let glossaryManager;
let translationService;
let projectManager;
let configManager;

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

