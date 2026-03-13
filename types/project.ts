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
  type: 'csv' | 'json' | 'faction' | 'ship' | 'skin';
  field: string;
  rowId?: string;
  source: string;
  target: string;
  status: 'untranslated' | 'translated' | 'polished' | 'reviewed';
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
}

export interface ProjectStats {
  total: number;
  translated: number;
  polished: number;
  reviewed?: number;
  byFile: Record<string, { total: number; translated: number; polished: number; reviewed?: number }>;
  byType: Record<string, { total: number; translated: number; polished: number; reviewed?: number }>;
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
