/**
 * MOD Parser types
 */

export interface ParseOptions {
  modPath: string;
  includeFiles?: string[];
  excludeFiles?: string[];
}

export interface FileParseResult {
  file: string;
  type: 'csv' | 'json' | 'faction' | 'ship' | 'skin';
  entries: any[]; // Use project's TranslationEntry
}

