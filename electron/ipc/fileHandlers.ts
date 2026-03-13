import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseCSV, serializeCSV } from '../services/csvParser';
import { getIdColumn } from '../services/exporter';
import type { IPCContext, IPCResponse } from '../../types/ipc';
import type { TranslationEntry } from '../../types/project';
import type { ParsedCSV, CSVRow } from '../services/csvParser';

interface FilePreviewRequest {
  modPath: string;
  relFile: string;
  entries: TranslationEntry[];
}

interface FilePreviewResult {
  original: string;
  translated: string;
}

interface ExportPreviewRequest {
  modPath: string;
  entries: TranslationEntry[];
}

interface ExportPreviewFile {
  relFile: string;
  original: string;
  translated: string;
  fileType: 'text' | 'csv' | 'json';
}

interface ExportPreviewResult {
  files: ExportPreviewFile[];
}

/**
 * Register file preview and diff-related IPC handlers.
 * Provides file content preview with translations applied.
 * @param ctx - Shared context (not used but kept for consistency)
 */
function register(ctx: IPCContext): void {
  /**
   * Preview a single file with translations applied
   * Shows diff between original and translated content
   * @param request - File preview request
   * @returns Original and translated file content
   */
  ipcMain.handle('file:preview', async (_, request: FilePreviewRequest): Promise<IPCResponse<FilePreviewResult>> => {
    try {
      const { modPath, relFile, entries } = request;
      const absPath = path.join(modPath, relFile);
      if (!fs.existsSync(absPath)) {
        return { success: false, error: 'File not found' };
      }

      const original = fs.readFileSync(absPath, 'utf-8');

      const translatedEntries = entries.filter(e => !e.ignored && e.translated && e.status !== 'untranslated');
      if (translatedEntries.length === 0) {
        return { success: true, data: { original, translated: original } };
      }

      const ext = path.extname(relFile);
      const fileName = path.basename(relFile);
      let translated = original;

      if (ext === '.csv') {
        translated = applyCSVPreview(original, translatedEntries, fileName);
      } else {
        translated = applyJsonPreview(original, translatedEntries);
      }

      return { success: true, data: { original, translated } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Generate previews for all files that have translations
   * Used for export preview functionality
   * @param request - Export preview request
   * @returns Array of files with original and translated content
   */
  ipcMain.handle('export:preview', async (_, request: ExportPreviewRequest): Promise<IPCResponse<ExportPreviewResult>> => {
    try {
      const { modPath, entries } = request;
      if (!modPath) {
        return { success: false, error: 'No mod path configured' };
      }

      // Group entries by file, skip ignored and untranslated
      const fileEntryMap: Record<string, TranslationEntry[]> = {};
      for (const entry of entries) {
        if (entry.ignored) continue;
        if (!entry.translated || entry.status === 'untranslated') continue;
        if (!fileEntryMap[entry.file]) fileEntryMap[entry.file] = [];
        fileEntryMap[entry.file].push(entry);
      }

      const files: ExportPreviewFile[] = [];
      for (const [relFile, fileEntries] of Object.entries(fileEntryMap)) {
        const absPath = path.join(modPath, relFile);
        if (!fs.existsSync(absPath)) continue;

        try {
          const original = fs.readFileSync(absPath, 'utf-8');
          const ext = path.extname(relFile);
          const fileName = path.basename(relFile);
          let translated = original;

          if (ext === '.csv') {
            translated = applyCSVPreview(original, fileEntries, fileName);
          } else {
            translated = applyJsonPreview(original, fileEntries);
          }

          // Only include files that actually changed
          if (original !== translated) {
            const lower = relFile.toLowerCase();
            let fileType: 'text' | 'csv' | 'json' = 'text';
            if (lower.endsWith('.csv')) fileType = 'csv';
            else if (lower.endsWith('.json') || lower.endsWith('.faction') ||
                     lower.endsWith('.ship') || lower.endsWith('.skin') ||
                     lower.endsWith('.variant') || lower.endsWith('.skill')) fileType = 'json';

            files.push({ relFile, original, translated, fileType });
          }
        } catch (err) {
          // Skip files that fail to preview
          console.warn(`Failed to preview ${relFile}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { success: true, data: { files } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}

/**
 * Apply CSV translations for preview
 * Handles special cases like script(AddText) fields
 * @param content - Original CSV content
 * @param entries - Translation entries for this file
 * @param fileName - CSV file name (for determining ID column)
 * @returns Translated CSV content
 */
function applyCSVPreview(content: string, entries: TranslationEntry[], fileName: string): string {
  const csvData = parseCSV(content);
  const idCol = getIdColumn(fileName);

  for (const entry of entries) {
    // Special handling for script(AddText) field
    if (entry.field === 'script(AddText)') {
      for (const row of csvData.rows) {
        if (row._empty || row._comment) continue;
        if (row[idCol] !== entry.rowId) continue;
        const script = String(row['script'] || '');
        const escapedOriginal = entry.original.replace(/"/g, '""');
        const escapedTranslation = entry.translated.replace(/"/g, '""');
        row['script'] = script.replace(
          `""${escapedOriginal}""`,
          `""${escapedTranslation}""`
        );
      }
      continue;
    }

    // Standard field replacement
    for (const row of csvData.rows) {
      if (row._empty || row._comment) continue;
      if (row[idCol] === entry.rowId && entry.field in row) {
        row[entry.field] = entry.translated;
      }
    }
  }

  return serializeCSV(csvData);
}

/**
 * Apply JSON translations for preview
 * Uses regex replacement with proper escaping
 * @param content - Original JSON content
 * @param entries - Translation entries for this file
 * @returns Translated JSON content
 */
function applyJsonPreview(content: string, entries: TranslationEntry[]): string {
  let result = content;
  for (const entry of entries) {
    // Escape original text as it appears in JSON, then escape for regex
    // (mirrors exporter.ts escapeForJsonSearch logic)
    const originalEscaped = entry.original
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[.*+?^${}()|[\]]/g, '\\$&');
    const translatedEscaped = entry.translated
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    result = result.replace(
      new RegExp(`"${originalEscaped}"`, 'g'),
      `"${translatedEscaped}"`
    );
  }
  return result;
}

module.exports = { register };

export { register };
