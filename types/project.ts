/**
 * Core project types for the SS Translator application
 */

export interface ModInfo {
  id?: string;
  name?: string;
  version?: string;
  author?: string;
  description?: string;
  gameVersion?: string;
  [key: string]: any;
}

export interface TranslationEntry {
  id: string;
  file: string;
  fileType: string;  // 'csv', 'json', 'json_array', 'json_config', 'json_flat_map', 'json_ranks', 'json_strings', 'json_tooltips', 'json_mission', 'json_skill', 'mod_info', etc.
  category: string;
  field: string;
  csvFileName?: string;  // For CSV entries, the file name
  rowId?: string;
  arrayIndex?: number;
  objectKey?: string;
  section?: string;
  original: string;  // Source text
  translated: string;  // Target text
  status: 'untranslated' | 'translated' | 'polished' | 'reviewed' | 'error';
  context?: string;
  ignored?: boolean;
}

export interface GlossaryEntry {
  id?: string;
  source: string;
  target: string;
  category: string;
  createdAt?: number;
  confirmed?: boolean;
}

export interface KeywordEntry {
  source: string;
  target: string;
  category: string;
  confirmed?: boolean;
  key?: string;
  extractType?: string;
  context?: string;
  file?: string;
}

export interface ProjectStats {
  total: number;
  translated: number;
  polished: number;
  reviewed?: number;
  byFile: Record<string, { total: number; translated: number }>;
  byType: Record<string, { total: number; translated: number }>;
}

export interface Project {
  id: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  modInfo: ModInfo;
  modPath: string;
  sourceLanguage: string;
  targetLanguage: string;
  entries: TranslationEntry[];
  glossary: GlossaryEntry[];
  keywords: KeywordEntry[];
  aiConfig: Record<string, any>;
  stats: ProjectStats;
  projectFilePath: string | null;
  legacyModPath?: string;
  outputDir?: string;
  modPrompt?: string;
}

export interface ParsedModData {
  modInfo: ModInfo;
  modPath: string;
  entries: TranslationEntry[];
  stats: ProjectStats;
}
