import { contextBridge, ipcRenderer, webFrame } from 'electron';

/**
 * Preload script for Electron renderer process
 * Exposes safe IPC APIs to the renderer through contextBridge
 */

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialog
  selectModFolder: () => ipcRenderer.invoke('dialog:selectModFolder'),

  // Mod parsing
  parseMod: (modPath: string) => ipcRenderer.invoke('mod:parse', modPath),

  // Project
  createEmptyProject: () => ipcRenderer.invoke('project:createEmpty'),
  createProject: (modPath: string) => ipcRenderer.invoke('project:create', modPath),
  saveProject: (projectData: any) => ipcRenderer.invoke('project:save', projectData),
  loadProject: () => ipcRenderer.invoke('project:load'),

  // Project glossary
  getGlossary: (projectId: string) => ipcRenderer.invoke('glossary:getAll', projectId),
  addGlossaryEntry: (entry: any) => ipcRenderer.invoke('glossary:add', entry),
  updateGlossaryEntry: (entry: any) => ipcRenderer.invoke('glossary:update', entry),
  removeGlossaryEntry: (id: string) => ipcRenderer.invoke('glossary:remove', id),
  importGlossary: (projectId: string) => ipcRenderer.invoke('glossary:import', projectId),
  exportGlossary: (projectId: string) => ipcRenderer.invoke('glossary:export', projectId),

  // Public / built-in glossary
  getBuiltinGlossary: () => ipcRenderer.invoke('glossary:getBuiltin'),
  saveBuiltinGlossary: (entries: any[]) => ipcRenderer.invoke('glossary:saveBuiltin', entries),
  resetBuiltinGlossary: () => ipcRenderer.invoke('glossary:resetBuiltin'),
  importBuiltinGlossary: () => ipcRenderer.invoke('glossary:importBuiltin'),
  exportBuiltinGlossary: () => ipcRenderer.invoke('glossary:exportBuiltin'),

  // AI Translation
  configureAI: (config: any) => ipcRenderer.invoke('ai:configure', config),
  getAIConfig: () => ipcRenderer.invoke('ai:getConfig'),
  resetAIConfig: () => ipcRenderer.invoke('ai:resetConfig'),
  getDefaultPrompts: () => ipcRenderer.invoke('ai:getDefaultPrompts'),
  translate: (data: any) => ipcRenderer.invoke('ai:translate', data),
  polish: (data: any) => ipcRenderer.invoke('ai:polish', data),
  polishBatch: (data: any) => ipcRenderer.invoke('ai:polishBatch', data),

  // AI progress events (for batch translate/polish)
  onTranslateProgress: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('ai:translateProgress', handler);
    return handler;
  },
  removeTranslateProgressListener: (handler: any) => {
    ipcRenderer.removeListener('ai:translateProgress', handler);
  },
  onPolishProgress: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('ai:polishProgress', handler);
    return handler;
  },
  removePolishProgressListener: (handler: any) => {
    ipcRenderer.removeListener('ai:polishProgress', handler);
  },

  // Request History (AI debugging)
  getRequestHistory: () => ipcRenderer.invoke('ai:getRequestHistory'),
  getRequestDetail: (id: number) => ipcRenderer.invoke('ai:getRequestDetail', id),
  getActiveRequests: () => ipcRenderer.invoke('ai:getActiveRequests'),
  clearRequestHistory: () => ipcRenderer.invoke('ai:clearRequestHistory'),

  // Export
  exportMod: (data: any) => ipcRenderer.invoke('export:mod', data),
  getExportPreview: (data: any) => ipcRenderer.invoke('export:preview', data),

  // System notification
  sendNotification: (title: string, body: string) => ipcRenderer.invoke('app:notify', { title, body }),

  // Legacy translation (old version Chinese mod support)
  loadLegacyMod: () => ipcRenderer.invoke('legacy:load'),
  getLegacyInfo: () => ipcRenderer.invoke('legacy:getInfo'),
  matchLegacy: (data: any) => ipcRenderer.invoke('legacy:match', data),
  clearLegacy: () => ipcRenderer.invoke('legacy:clear'),

  // Keyword extraction
  extractKeywords: (modPath: string) => ipcRenderer.invoke('mod:extractKeywords', modPath),
  aiExtractKeywords: (data: any) => ipcRenderer.invoke('ai:extractKeywords', data),

  // Unified keyword extraction (structural + AI with incremental updates)
  extractAllKeywords: (data: any) => ipcRenderer.invoke('keywords:extractAll', data),
  translateKeywords: (data: any) => ipcRenderer.invoke('keywords:translate', data),
  onKeywordBatch: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('keywords:batch', handler);
    return handler;
  },
  removeKeywordBatchListener: (handler: any) => {
    ipcRenderer.removeListener('keywords:batch', handler);
  },
  onKeywordLog: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('keywords:log', handler);
    return handler;
  },
  removeKeywordLogListener: (handler: any) => {
    ipcRenderer.removeListener('keywords:log', handler);
  },

  // Auto-save (used by timer and close handler)
  autoSaveProject: (projectData: any) => ipcRenderer.invoke('project:autoSave', projectData),

  // Close confirmation
  onBeforeClose: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('app:before-close', handler);
    return handler;
  },
  removeBeforeCloseListener: (handler: any) => {
    ipcRenderer.removeListener('app:before-close', handler);
  },
  confirmClose: () => ipcRenderer.send('app:close-confirmed'),

  // File preview (diff view)
  getFilePreview: (data: any) => ipcRenderer.invoke('file:preview', data),

  // Zoom
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
});
