const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialog
  selectModFolder: () => ipcRenderer.invoke('dialog:selectModFolder'),

  // Mod parsing
  parseMod: (modPath) => ipcRenderer.invoke('mod:parse', modPath),

  // Project
  createProject: (modPath) => ipcRenderer.invoke('project:create', modPath),
  saveProject: (projectData) => ipcRenderer.invoke('project:save', projectData),
  loadProject: () => ipcRenderer.invoke('project:load'),

  // Glossary
  getGlossary: (projectId) => ipcRenderer.invoke('glossary:getAll', projectId),
  addGlossaryEntry: (entry) => ipcRenderer.invoke('glossary:add', entry),
  updateGlossaryEntry: (entry) => ipcRenderer.invoke('glossary:update', entry),
  removeGlossaryEntry: (id) => ipcRenderer.invoke('glossary:remove', id),
  importGlossary: (projectId) => ipcRenderer.invoke('glossary:import', projectId),
  exportGlossary: (projectId) => ipcRenderer.invoke('glossary:export', projectId),

  // AI Translation
  configureAI: (config) => ipcRenderer.invoke('ai:configure', config),
  getAIConfig: () => ipcRenderer.invoke('ai:getConfig'),
  translate: (data) => ipcRenderer.invoke('ai:translate', data),
  polish: (data) => ipcRenderer.invoke('ai:polish', data),

  // Export
  exportMod: (data) => ipcRenderer.invoke('export:mod', data),
});

