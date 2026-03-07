const { app, BrowserWindow, ipcMain, dialog, Menu, Notification } = require('electron');
const path = require('path');
const { parseModFolder } = require('./services/modParser');
const { GlossaryManager } = require('./services/glossary');
const { TranslationService } = require('./services/translator');
const { ProjectManager } = require('./services/project');
const { ConfigManager } = require('./services/configManager');
const { exportMod } = require('./services/exporter');

// Fields that indicate proper nouns / keyword candidates
const KEYWORD_NAME_FIELDS = new Set([
  'name', 'displayName', 'displayNameWithArticle',
  'displayNameLong', 'displayNameLongWithArticle',
  'hullName', 'designation',
]);

/** Safely lowercase a glossary/keyword entry's source field. Returns null for malformed items. */
const safeTermLower = (item) =>
  item && typeof item.source === 'string' ? item.source.trim().toLowerCase() : null;

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
    configManager.saveModelConfig(config);
    return { success: true };
  });

  ipcMain.handle('ai:translate', async (_, { entries, glossary, config }) => {
    try {
      // Merge project glossary with built-in public glossary
      const builtinGlossary = configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(glossary || [])];
      const results = await translationService.translateBatch(entries, mergedGlossary, config);
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai:polish', async (_, { entry, glossary, config }) => {
    try {
      const builtinGlossary = configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(glossary || [])];
      const result = await translationService.polish(entry, mergedGlossary, config);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai:getConfig', async () => {
    // Persisted config is the source of truth; mask the API key
    const config = configManager.getModelConfig();
    return {
      ...config,
      apiKey: '',
      hasApiKey: !!config.apiKey,
    };
  });

  ipcMain.handle('ai:resetConfig', async () => {
    const defaults = configManager.resetModelConfig();
    translationService.configure(defaults);
    return { success: true, data: defaults };
  });

  ipcMain.handle('ai:getDefaultPrompts', async () => {
    return translationService.getDefaultPrompts();
  });

  // Public / built-in glossary
  ipcMain.handle('glossary:getBuiltin', async () => {
    return configManager.getBuiltinGlossary();
  });

  ipcMain.handle('glossary:saveBuiltin', async (_, entries) => {
    return configManager.saveBuiltinGlossary(entries);
  });

  ipcMain.handle('glossary:resetBuiltin', async () => {
    const entries = configManager.resetBuiltinGlossary();
    return { success: true, data: entries };
  });

  ipcMain.handle('glossary:importBuiltin', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'JSON / CSV文件', extensions: ['json', 'csv'] }],
      title: '导入公共词库',
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const ext = require('path').extname(filePath).toLowerCase();
    let entries;
    if (ext === '.json') {
      entries = JSON.parse(require('fs').readFileSync(filePath, 'utf-8'));
    } else {
      const tmp = await glossaryManager.importFromCSV(filePath, '__builtin__');
      entries = tmp.entries.map(({ source, target, category }) => ({ source, target, category }));
    }
    configManager.saveBuiltinGlossary(entries);
    return { success: true, data: entries };
  });

  ipcMain.handle('glossary:exportBuiltin', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'JSON文件', extensions: ['json'] }],
      defaultPath: 'builtin_glossary.json',
      title: '导出公共词库',
    });
    if (result.canceled) return null;
    const entries = configManager.getBuiltinGlossary();
    require('fs').writeFileSync(result.filePath, JSON.stringify(entries, null, 2), 'utf-8');
    return { success: true, exported: entries.length };
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

  // ─── System notification ───────────────────────────────────────────────
  ipcMain.handle('app:notify', async (_, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return { success: true };
    }
    return { success: false };
  });

  // ─── Unified keyword extraction (structural + AI with incremental updates) ───

  ipcMain.handle('keywords:extractAll', async (_, { modPath, glossary }) => {
    try {
      const parsed = await parseModFolder(modPath);

      // Build builtin glossary dedup set early (used for both phases)
      const builtinGlossaryEntries = configManager.getBuiltinGlossary() || [];
      const builtinTerms = new Set(builtinGlossaryEntries.map(safeTermLower).filter(Boolean));
      const projectTerms = new Set((glossary || []).map(safeTermLower).filter(Boolean));

      // Phase 1: Structural extraction (filter against builtin glossary)
      const seen = new Set();
      const structKeywords = [];
      for (const entry of parsed.entries) {
        if (KEYWORD_NAME_FIELDS.has(entry.field) && entry.original && !seen.has(entry.original.toLowerCase())) {
          const lc = entry.original.toLowerCase();
          seen.add(lc);
          // Skip if already in builtin or project glossary
          if (builtinTerms.has(lc) || projectTerms.has(lc)) continue;
          structKeywords.push({
            source: entry.original,
            target: '',
            category: '通用',
            context: entry.context,
            file: entry.file,
            extractType: 'structure',
          });
        }
      }

      // Send structural results immediately
      if (structKeywords.length > 0) {
        mainWindow.webContents.send('keywords:batch', {
          keywords: structKeywords,
          phase: 'structure',
        });
      }

      // Phase 2: AI extraction with incremental batch updates
      const textSamples = [];
      const seenText = new Set();
      for (const entry of parsed.entries) {
        if (entry.original && entry.original.length >= 10 && !seenText.has(entry.original)) {
          seenText.add(entry.original);
          textSamples.push({
            text: entry.original,
            context: entry.context || entry.file,
          });
        }
      }

      const MAX_AI_SAMPLES = 200;
      const sampled = textSamples.length > MAX_AI_SAMPLES
        ? textSamples.slice(0, MAX_AI_SAMPLES)
        : textSamples;

      // Build dedup set from structural results + existing glossaries
      const existingTerms = new Set([...seen, ...builtinTerms, ...projectTerms]);

      let aiCount = 0;
      await translationService.extractKeywords(sampled, {}, (batchKeywords) => {
        // Filter against structural results and glossaries
        const newKeywords = batchKeywords
          .filter(kw => !existingTerms.has(kw.source.toLowerCase()))
          .map(kw => ({
            ...kw,
            target: '',
            extractType: 'ai',
          }));

        // Add to dedup set for future batches
        for (const kw of newKeywords) {
          existingTerms.add(kw.source.toLowerCase());
        }

        if (newKeywords.length > 0) {
          aiCount += newKeywords.length;
          mainWindow.webContents.send('keywords:batch', {
            keywords: newKeywords,
            phase: 'ai',
          });
        }
      });

      // Signal completion
      mainWindow.webContents.send('keywords:batch', {
        keywords: [],
        phase: 'complete',
      });

      return { success: true, total: { structure: structKeywords.length, ai: aiCount } };
    } catch (err) {
      mainWindow.webContents.send('keywords:batch', {
        keywords: [],
        phase: 'complete',
      });
      return { success: false, error: err.message };
    }
  });

  // Keyword translation (separate from extraction, uses builtin glossary for context)
  ipcMain.handle('keywords:translate', async (_, { keywords }) => {
    try {
      // Merge builtin glossary for translation reference
      const builtinGlossary = configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const results = await translationService.translateKeywords(keywords, builtinGlossary);
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Legacy keyword extraction from MOD folder (kept for compatibility)
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

  // AI-enhanced keyword extraction
  ipcMain.handle('ai:extractKeywords', async (_, { modPath, glossary }) => {
    try {
      const parsed = await parseModFolder(modPath);

      // Collect text samples from all translatable entries (descriptions, dialogues, etc.)
      // Group by file to preserve context and avoid duplicates
      const textSamples = [];
      const seen = new Set();
      for (const entry of parsed.entries) {
        if (entry.original && entry.original.length >= 10 && !seen.has(entry.original)) {
          seen.add(entry.original);
          textSamples.push({
            text: entry.original,
            context: entry.context || entry.file,
          });
        }
      }

      // Limit total samples to avoid excessive API calls
      const MAX_AI_SAMPLES = 200;
      const sampled = textSamples.length > MAX_AI_SAMPLES
        ? textSamples.slice(0, MAX_AI_SAMPLES)
        : textSamples;

      // Merge glossary for deduplication (uses module-level safeTermLower)
      const builtinGlossary = (configManager.getBuiltinGlossary() || [])
        .map(safeTermLower).filter(Boolean);
      const projectGlossary = (glossary || [])
        .map(safeTermLower).filter(Boolean);
      const existingTerms = new Set([...builtinGlossary, ...projectGlossary]);

      const keywords = (await translationService.extractKeywords(sampled)) || [];

      // Filter out terms already in glossaries (skip malformed keyword entries)
      const filtered = keywords.filter(kw => {
        if (!kw || typeof kw.source !== 'string') return false;
        const term = kw.source.trim().toLowerCase();
        return term && !existingTerms.has(term);
      });

      return { success: true, data: filtered };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

