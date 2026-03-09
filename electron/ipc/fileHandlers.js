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

      const translatedEntries = entries.filter(e => e.translated && e.status !== 'untranslated');
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
