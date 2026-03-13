/**
 * MOD Parser types
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

export interface ParseOptions {
  modPath: string;
  includeFiles?: string[];
  excludeFiles?: string[];
}

export interface FileParseResult {
  file: string;
  type: 'csv' | 'json' | 'faction' | 'ship' | 'skin';
  entries: TranslationEntry[];
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
