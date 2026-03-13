/**
 * Legacy translation types
 */

export interface LegacyTranslationEntry {
  file: string;
  type: string;
  field: string;
  rowId?: string;
  source: string;
  target: string;
}

export interface LegacyMatchResult {
  entryId: string;
  matches: Array<{
    matchType: 'exact' | 'structural';
    confidence: number;
    legacyEntry: LegacyTranslationEntry;
  }>;
}
