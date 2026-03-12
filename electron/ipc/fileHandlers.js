const fs = require('fs');
const path = require('path');
const { parseCSV, serializeCSV } = require('../services/csvParser');
const { getIdColumn } = require('../services/exporter');

/**
 * Register file-related IPC handlers.
 * @param {object} ctx - Shared context
 */
function register(ctx) {
  const { ipcMain } = require('electron');

  ipcMain.handle('file:preview', async (event, { modPath, relFile, entries }) => {
    try {
      const absPath = path.join(modPath, relFile);
      if (!fs.existsSync(absPath)) {
        return { success: false, error: 'File not found' };
      }

      const original = fs.readFileSync(absPath, 'utf-8');

      const translatedEntries = entries.filter(e => !e.ignored && e.translated && e.status !== 'untranslated');
      if (translatedEntries.length === 0) {
        return { success: true, original, translated: original };
      }

      const ext = path.extname(relFile);
      const fileName = path.basename(relFile);
      let translated = original;

      if (ext === '.csv') {
        translated = applyCSVPreview(original, translatedEntries, fileName);
      } else {
        translated = applyJsonPreview(original, translatedEntries);
      }

      return { success: true, original, translated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * Generate previews for all files that have translations.
   * Returns { files: [{ relFile, original, translated, fileType }] }
   */
  ipcMain.handle('export:preview', async (event, { modPath, entries }) => {
    try {
      if (!modPath) {
        return { success: false, error: 'No mod path configured' };
      }

      // Group entries by file, skip ignored and untranslated
      const fileEntryMap = {};
      for (const entry of entries) {
        if (entry.ignored) continue;
        if (!entry.translated || entry.status === 'untranslated') continue;
        if (!fileEntryMap[entry.file]) fileEntryMap[entry.file] = [];
        fileEntryMap[entry.file].push(entry);
      }

      const files = [];
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
            let fileType = 'text';
            if (lower.endsWith('.csv')) fileType = 'csv';
            else if (lower.endsWith('.json') || lower.endsWith('.faction') ||
                     lower.endsWith('.ship') || lower.endsWith('.skin') ||
                     lower.endsWith('.variant') || lower.endsWith('.skill')) fileType = 'json';

            files.push({ relFile, original, translated, fileType });
          }
        } catch (err) {
          // Skip files that fail to preview
          console.warn(`Failed to preview ${relFile}: ${err.message}`);
        }
      }

      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

function applyCSVPreview(content, entries, fileName) {
  const csvData = parseCSV(content);
  const idCol = getIdColumn(fileName);

  for (const entry of entries) {
    if (entry.field === 'script(AddText)') {
      for (const row of csvData.rows) {
        if (row._empty || row._comment) continue;
        if (row[idCol] !== entry.rowId) continue;
        const script = row['script'] || '';
        const escapedOriginal = entry.original.replace(/"/g, '""');
        const escapedTranslation = entry.translated.replace(/"/g, '""');
        row['script'] = script.replace(
          `""${escapedOriginal}""`,
          `""${escapedTranslation}""`
        );
      }
      continue;
    }

    for (const row of csvData.rows) {
      if (row._empty || row._comment) continue;
      if (row[idCol] === entry.rowId && entry.field in row) {
        row[entry.field] = entry.translated;
      }
    }
  }

  return serializeCSV(csvData);
}

function applyJsonPreview(content, entries) {
  let result = content;
  for (const entry of entries) {
    // Escape original text as it appears in JSON, then escape for regex
    // (mirrors exporter.js escapeForJsonSearch logic)
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
