/**
 * IPC API types for Electron main process handlers
 */

import type { BrowserWindow } from 'electron';

// Forward declare service types to avoid circular dependencies with electron services
export interface GlossaryManager {
  getAll(projectId: string): any;
  add(entry: any): any;
  update(entry: any): any;
  remove(id: string): any;
  importFromCSV(filePath: string, projectId: string): Promise<any>;
  exportToCSV(filePath: string, projectId: string): Promise<any>;
}

export interface ConfigManager {
  getModelConfig(): any;
  saveModelConfig(config: any): void;
  resetModelConfig(): any;
  getBuiltinGlossary(): any[];
  saveBuiltinGlossary(entries: any[]): any;
  resetBuiltinGlossary(): any[];
}

export interface TranslationService {
  configure(config: any): void;
  translateBatch(entries: any[], glossary: any[], config: any, modPrompt: string, onProgress?: any): Promise<any[]>;
  polish(entry: any, glossary: any[], config: any, modPrompt: string): Promise<any>;
  polishBatch(entries: any[], glossary: any[], config: any, modPrompt: string, onProgress?: any): Promise<any[]>;
  extractKeywords(textSamples: any[], config?: any, onBatchProgress?: any): Promise<any[]>;
  translateKeywords(keywords: any[], glossary: any[], config: any, onLog?: any): Promise<any[]>;
  getDefaultPrompts(): any;
  getRequestHistory(): any[];
  getRequestDetail(id: number): any;
  getActiveRequests(): any[];
  clearRequestHistory(): void;
}

export interface ProjectManager {
  createEmptyProject(): any;
  createProject(modPath: string): Promise<any>;
  saveProject(projectData: any): Promise<any>;
  loadProject(filePath: string): Promise<any>;
}

export interface LegacyTranslationService {
  loadLegacyMod(modPath: string): Promise<any>;
  getLegacyInfo(): any;
  matchEntries(entries: any[]): any;
  clear(): void;
}

/**
 * Shared context object passed to all IPC handler registration functions
 */
export interface IPCContext {
  /** Get the main browser window */
  getMainWindow: () => BrowserWindow;
  /** Glossary manager instance */
  glossaryManager: GlossaryManager;
  /** Configuration manager instance */
  configManager: ConfigManager;
  /** Translation service instance */
  translationService: TranslationService;
  /** Project manager instance */
  projectManager: ProjectManager;
  /** Legacy translation service instance */
  legacyTranslationService: LegacyTranslationService;
  /** MOD folder parser function */
  parseModFolder: (modPath: string) => Promise<any>;
  /** MOD exporter function */
  exportMod: (projectData: any, outputDir: string) => Promise<any>;
}

/**
 * Standard IPC response format for success cases
 */
export interface IPCSuccessResponse<T = any> {
  success: true;
  data?: T;
  [key: string]: any;
}

/**
 * Standard IPC response format for error cases
 */
export interface IPCErrorResponse {
  success: false;
  error: string;
}

/**
 * Union type for IPC responses
 */
export type IPCResponse<T = any> = IPCSuccessResponse<T> | IPCErrorResponse;
