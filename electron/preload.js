const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialog
  selectModFolder: () => ipcRenderer.invoke('dialog:selectModFolder'),

  // Mod parsing
  parseMod: (modPath) => ipcRenderer.invoke('mod:parse', modPath),

  // Project
  createEmptyProject: () => ipcRenderer.invoke('project:createEmpty'),
  createProject: (modPath) => ipcRenderer.invoke('project:create', modPath),
  saveProject: (projectData) => ipcRenderer.invoke('project:save', projectData),
  loadProject: () => ipcRenderer.invoke('project:load'),

  // Project glossary
  getGlossary: (projectId) => ipcRenderer.invoke('glossary:getAll', projectId),
  addGlossaryEntry: (entry) => ipcRenderer.invoke('glossary:add', entry),
  updateGlossaryEntry: (entry) => ipcRenderer.invoke('glossary:update', entry),
  removeGlossaryEntry: (id) => ipcRenderer.invoke('glossary:remove', id),
  importGlossary: (projectId) => ipcRenderer.invoke('glossary:import', projectId),
  exportGlossary: (projectId) => ipcRenderer.invoke('glossary:export', projectId),

  // Public / built-in glossary
  getBuiltinGlossary: () => ipcRenderer.invoke('glossary:getBuiltin'),
  saveBuiltinGlossary: (entries) => ipcRenderer.invoke('glossary:saveBuiltin', entries),
  resetBuiltinGlossary: () => ipcRenderer.invoke('glossary:resetBuiltin'),
  importBuiltinGlossary: () => ipcRenderer.invoke('glossary:importBuiltin'),
  exportBuiltinGlossary: () => ipcRenderer.invoke('glossary:exportBuiltin'),

  // AI Translation
  configureAI: (config) => ipcRenderer.invoke('ai:configure', config),
  getAIConfig: () => ipcRenderer.invoke('ai:getConfig'),
  resetAIConfig: () => ipcRenderer.invoke('ai:resetConfig'),
  getDefaultPrompts: () => ipcRenderer.invoke('ai:getDefaultPrompts'),
  translate: (data) => ipcRenderer.invoke('ai:translate', data),
  polish: (data) => ipcRenderer.invoke('ai:polish', data),

  // Export
  exportMod: (data) => ipcRenderer.invoke('export:mod', data),

  // System notification
  sendNotification: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),

  // Legacy translation (old version Chinese mod support)
  loadLegacyMod: () => ipcRenderer.invoke('legacy:load'),
  getLegacyInfo: () => ipcRenderer.invoke('legacy:getInfo'),
  matchLegacy: (data) => ipcRenderer.invoke('legacy:match', data),
  clearLegacy: () => ipcRenderer.invoke('legacy:clear'),

  // Keyword extraction
  extractKeywords: (modPath) => ipcRenderer.invoke('mod:extractKeywords', modPath),
  aiExtractKeywords: (data) => ipcRenderer.invoke('ai:extractKeywords', data),

  // Unified keyword extraction (structural + AI with incremental updates)
  extractAllKeywords: (data) => ipcRenderer.invoke('keywords:extractAll', data),
  translateKeywords: (data) => ipcRenderer.invoke('keywords:translate', data),
  onKeywordBatch: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('keywords:batch', handler);
    return handler;
  },
  removeKeywordBatchListener: (handler) => {
    ipcRenderer.removeListener('keywords:batch', handler);
  },

  // Auto-save (used by timer and close handler)
  autoSaveProject: (projectData) => ipcRenderer.invoke('project:autoSave', projectData),

  // Close confirmation
  onBeforeClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:before-close', handler);
    return handler;
  },
  removeBeforeCloseListener: (handler) => {
    ipcRenderer.removeListener('app:before-close', handler);
  },
  confirmClose: () => ipcRenderer.send('app:close-confirmed'),
});

