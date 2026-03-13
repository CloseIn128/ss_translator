/**
 * IPC API types for communication between renderer and main process
 */

import { Project, GlossaryEntry, KeywordEntry, TranslationEntry } from './project';

export interface ApiResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TranslateOptions {
  entries: Array<{ id: string; source: string; context?: string }>;
  glossary?: GlossaryEntry[];
  modPrompt?: string;
}

export interface PolishOptions {
  entries: Array<{ id: string; target: string; context?: string }>;
  glossary?: GlossaryEntry[];
  modPrompt?: string;
}

export interface KeywordTranslateOptions {
  keywords: KeywordEntry[];
  extraGlossary?: GlossaryEntry[];
}

export interface KeywordPolishOptions {
  keywords: KeywordEntry[];
  extraGlossary?: GlossaryEntry[];
}

export interface ExportPreviewFile {
  relFile: string;
  original: string;
  translated: string;
  fileType: 'text' | 'csv' | 'json';
}

export interface ElectronAPI {
  // Dialog
  selectModFolder: () => Promise<string | null>;
  selectProjectFile: () => Promise<string | null>;
  selectOutputFolder: () => Promise<string | null>;

  // Project
  createProject: (modPath: string) => Promise<ApiResult<Project>>;
  createEmptyProject: () => Promise<ApiResult<Project>>;
  loadProject: () => Promise<ApiResult<Project> | null>;
  saveProject: (project: Project) => Promise<ApiResult<{ projectFilePath: string }>>;
  autoSaveProject: (project: Project) => Promise<ApiResult<{ projectFilePath: string }>>;
  reloadModFolder: (modPath: string) => Promise<ApiResult<Project>>;

  // Glossary
  getBuiltinGlossary: () => Promise<ApiResult<GlossaryEntry[]>>;
  saveBuiltinGlossary: (glossary: GlossaryEntry[]) => Promise<ApiResult>;

  // AI Translation
  configure: (config: any) => Promise<void>;
  getConfig: () => Promise<any>;
  translate: (options: TranslateOptions) => Promise<ApiResult<Array<{ id: string; target: string }>>>;
  polish: (options: PolishOptions) => Promise<ApiResult<Array<{ id: string; target: string }>>>;
  translateSingle: (source: string, glossary?: GlossaryEntry[], modPrompt?: string) => Promise<ApiResult<string>>;
  polishSingle: (target: string, glossary?: GlossaryEntry[], modPrompt?: string) => Promise<ApiResult<string>>;
  getDefaultPrompts: () => Promise<{ systemPrompt: string; polishPrompt: string; keywordPrompt: string }>;

  // Keywords
  extractKeywords: (entries: any[], builtinGlossary: GlossaryEntry[], projectGlossary: GlossaryEntry[]) => Promise<void>;
  translateKeywords: (options: KeywordTranslateOptions) => Promise<void>;
  polishKeywords: (options: KeywordPolishOptions) => Promise<void>;

  // Export
  exportMod: (options: { projectData: Project }) => Promise<ApiResult<{ outputPath: string }>>;
  getExportPreview: (options: { modPath: string; entries: TranslationEntry[] }) => Promise<ApiResult<{ files: ExportPreviewFile[] }>>;

  // Legacy translation
  loadLegacyTranslation: (legacyModPath: string) => Promise<ApiResult>;
  getLegacyTranslationInfo: () => Promise<ApiResult<{ entryCount: number; fileCount: number }>>;
  matchLegacyTranslation: (entries: any[]) => Promise<ApiResult<Array<{ entryId: string; matches: any[] }>>>;
  clearLegacyTranslation: () => Promise<ApiResult>;

  // File preview
  getFilePreview: (filePath: string, entries: any[]) => Promise<ApiResult<{ original: string; translated: string }>>;

  // Notifications
  sendNotification: (title: string, body: string) => Promise<void>;

  // Window lifecycle
  onBeforeClose: (callback: () => void | Promise<void>) => (() => void);
  confirmClose: () => void;
  removeBeforeCloseListener: (handler: (() => void) | undefined) => void;

  // Zoom
  setZoomFactor: (factor: number) => void;

  // Request history
  onRequestUpdate: (callback: (request: any) => void) => void;
  getRequestHistory: () => Promise<any[]>;
  getActiveRequests: () => Promise<Map<string, any>>;
  cancelRequest: (requestId: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
