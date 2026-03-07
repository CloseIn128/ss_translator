/**
 * Legacy Translation Service
 *
 * Parses an old Chinese-translated version of a mod and matches its entries
 * against a new version to help carry over existing translations.
 *
 * Matching strategy (in order of priority):
 *   1. Exact ID match  – same file path, row ID, and field
 *   2. Structural match – same csvFileName/fileType + rowId + field (handles path changes)
 */

const { parseModFolder } = require('./modParser');

class LegacyTranslationService {
  constructor() {
    this.legacyEntries = [];
    this.legacyModInfo = null;
    this.legacyModPath = null;
  }

  /**
   * Load and parse an old translated mod folder.
   * @param {string} modPath - Absolute path to the legacy (translated) mod folder
   * @returns {object} - { modInfo, entryCount }
   */
  async loadLegacyMod(modPath) {
    const parsed = await parseModFolder(modPath);
    this.legacyEntries = parsed.entries;
    this.legacyModInfo = parsed.modInfo;
    this.legacyModPath = modPath;
    return {
      modInfo: parsed.modInfo,
      entryCount: parsed.entries.length,
    };
  }

  /**
   * Match new project entries against legacy translations.
   * @param {Array} newEntries - Entries from the current (new) project
   * @returns {{ matches: Array, unmatched: Array }}
   */
  matchEntries(newEntries) {
    if (!this.legacyEntries.length) {
      return { matches: [], unmatched: newEntries.map(e => ({ entryId: e.id, original: e.original, context: e.context })) };
    }

    // Build lookup maps from legacy entries
    const byId = new Map();
    const byRowField = new Map();

    for (const entry of this.legacyEntries) {
      byId.set(entry.id, entry);

      // Secondary key: csvFileName/fileType + rowId + field
      if (entry.rowId && entry.field) {
        const key = `${entry.csvFileName || entry.fileType}::${entry.rowId}::${entry.field}`;
        if (!byRowField.has(key)) byRowField.set(key, entry);
      }

      // For JSON files, match by basename + field
      if ((entry.fileType === 'json' || entry.fileType === 'json_array') && entry.field) {
        const basename = entry.file ? entry.file.split('/').pop() : '';
        if (basename) {
          const key = `json::${basename}::${entry.field}`;
          if (!byRowField.has(key)) byRowField.set(key, entry);
        }
      }
    }

    const matches = [];
    const unmatched = [];

    for (const newEntry of newEntries) {
      let legacy = byId.get(newEntry.id);
      let matchType = 'exact';

      if (!legacy) {
        matchType = 'structural';
        // Try structural match for CSV entries
        if (newEntry.rowId && newEntry.field) {
          const key = `${newEntry.csvFileName || newEntry.fileType}::${newEntry.rowId}::${newEntry.field}`;
          legacy = byRowField.get(key);
        }
        // Try structural match for JSON entries
        if (!legacy && (newEntry.fileType === 'json' || newEntry.fileType === 'json_array') && newEntry.field) {
          const basename = newEntry.file ? newEntry.file.split('/').pop() : '';
          if (basename) {
            const key = `json::${basename}::${newEntry.field}`;
            legacy = byRowField.get(key);
          }
        }
      }

      if (legacy && legacy.original) {
        matches.push({
          entryId: newEntry.id,
          matchType,
          legacyText: legacy.original,
          legacyFile: legacy.file,
          legacyContext: legacy.context,
        });
      } else {
        unmatched.push({
          entryId: newEntry.id,
          original: newEntry.original,
          context: newEntry.context,
        });
      }
    }

    return { matches, unmatched };
  }

  /**
   * Return summary information about the currently loaded legacy mod.
   * @returns {object|null}
   */
  getLegacyInfo() {
    if (!this.legacyModPath) return null;
    return {
      modInfo: this.legacyModInfo,
      modPath: this.legacyModPath,
      entryCount: this.legacyEntries.length,
    };
  }

  /**
   * Get all legacy entries (for building translation context).
   * @returns {Array}
   */
  getLegacyEntries() {
    return this.legacyEntries;
  }

  /** Clear loaded legacy data. */
  clear() {
    this.legacyEntries = [];
    this.legacyModInfo = null;
    this.legacyModPath = null;
  }
}

module.exports = { LegacyTranslationService };
