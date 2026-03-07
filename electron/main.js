const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { parseModFolder } = require('./services/modParser');
const { GlossaryManager } = require('./services/glossary');
const { TranslationService } = require('./services/translator');
const { ProjectManager } = require('./services/project');
const { exportMod } = require('./services/exporter');

// Fields that indicate proper nouns / keyword candidates
const KEYWORD_NAME_FIELDS = new Set([
  'name', 'displayName', 'displayNameWithArticle',
  'displayNameLong', 'displayNameLongWithArticle',
  'hullName', 'designation',
]);

let mainWindow;
let glossaryManager;
let translationService;
let projectManager;

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
  glossaryManager = new GlossaryManager();
  translationService = new TranslationService();
  projectManager = new ProjectManager();

  createWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers() {
  // Dialog: select mod folder
  ipcMain.handle('dialog:selectModFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择MOD文件夹',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Parse mod folder
  ipcMain.handle('mod:parse', async (_, modPath) => {
    try {
      const entries = await parseModFolder(modPath);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Project management
  ipcMain.handle('project:create', async (_, modPath) => {
    try {
      const project = await projectManager.createProject(modPath);
      return { success: true, data: project };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:save', async (_, projectData) => {
    try {
      await projectManager.saveProject(projectData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:load', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: '翻译项目', extensions: ['sst'] }],
        title: '打开翻译项目',
      });
      if (result.canceled) return null;
      const project = await projectManager.loadProject(result.filePaths[0]);
      return { success: true, data: project };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Glossary
  ipcMain.handle('glossary:getAll', async (_, projectId) => {
    return glossaryManager.getAll(projectId);
  });

  ipcMain.handle('glossary:add', async (_, entry) => {
    return glossaryManager.add(entry);
  });

  ipcMain.handle('glossary:update', async (_, entry) => {
    return glossaryManager.update(entry);
  });

  ipcMain.handle('glossary:remove', async (_, id) => {
    return glossaryManager.remove(id);
  });

  ipcMain.handle('glossary:import', async (_, projectId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'CSV文件', extensions: ['csv'] }],
      title: '导入名词库',
    });
    if (result.canceled) return null;
    return glossaryManager.importFromCSV(result.filePaths[0], projectId);
  });

  ipcMain.handle('glossary:export', async (_, projectId) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'CSV文件', extensions: ['csv'] }],
      title: '导出名词库',
    });
    if (result.canceled) return null;
    return glossaryManager.exportToCSV(result.filePath, projectId);
  });

  // AI Translation
  ipcMain.handle('ai:configure', async (_, config) => {
    translationService.configure(config);
    return { success: true };
  });

  ipcMain.handle('ai:translate', async (_, { entries, glossary, config }) => {
    try {
      const results = await translationService.translateBatch(entries, glossary, config);
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai:polish', async (_, { entry, glossary, config }) => {
    try {
      const result = await translationService.polish(entry, glossary, config);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai:getConfig', async () => {
    return translationService.getConfig();
  });

  // Export
  ipcMain.handle('export:mod', async (_, { projectData, outputPath }) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择导出目录',
      });
      if (result.canceled) return null;
      await exportMod(projectData, result.filePaths[0]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Keyword extraction from MOD folder
  ipcMain.handle('mod:extractKeywords', async (_, modPath) => {
    try {
      const parsed = await parseModFolder(modPath);
      // Extract entries from name/title fields as keyword candidates
      const seen = new Set();
      const keywords = [];
      for (const entry of parsed.entries) {
        if (KEYWORD_NAME_FIELDS.has(entry.field) && entry.original && !seen.has(entry.original)) {
          seen.add(entry.original);
          keywords.push({
            original: entry.original,
            context: entry.context,
            file: entry.file,
          });
        }
      }
      return { success: true, data: keywords };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

