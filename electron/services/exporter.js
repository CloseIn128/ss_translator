/**
 * Mod Exporter
 *
 * Exports translated mod by copying the original mod folder
 * and replacing translatable text with translations.
 */

const fs = require('fs');
const path = require('path');
const { parseRelaxedJson, relaxedJsonToJson } = require('./relaxedJson');
const { parseCSV, serializeCSV } = require('./csvParser');

/**
 * Export translated mod to output directory
 * @param {object} projectData - Full project data with entries
 * @param {string} outputDir - Output directory path
 */
async function exportMod(projectData, outputDir) {
  const { modPath, entries, modInfo } = projectData;
  const modFolderName = path.basename(modPath) + '_translated';
  const destPath = path.join(outputDir, modFolderName);

  // 1) Copy entire mod folder
  copyDirSync(modPath, destPath);

  // 2) Build a lookup map: file -> entries
  const fileEntryMap = {};
  for (const entry of entries) {
    if (!entry.translated || entry.status === 'untranslated') continue;
    if (!fileEntryMap[entry.file]) fileEntryMap[entry.file] = [];
    fileEntryMap[entry.file].push(entry);
  }

  // 3) Process each file with translations
  for (const [relFile, fileEntries] of Object.entries(fileEntryMap)) {
    const absPath = path.join(destPath, relFile);
    if (!fs.existsSync(absPath)) continue;

    try {
      const ext = path.extname(relFile);
      const fileName = path.basename(relFile);

      if (ext === '.csv') {
        applyCSVTranslations(absPath, fileEntries, fileName);
      } else if (ext === '.json' || ext === '.faction' || ext === '.ship' || ext === '.skin' || ext === '.variant' || ext === '.skill') {
        applyJsonTranslations(absPath, fileEntries);
      }
    } catch (err) {
      console.warn(`Failed to apply translations to ${relFile}: ${err.message}`);
    }
  }

  return { outputPath: destPath };
}

/**
 * Apply translations to a CSV file
 */
function applyCSVTranslations(filePath, entries, fileName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const csvData = parseCSV(content);

  for (const entry of entries) {
    if (entry.field === 'script(AddText)') {
      // Special handling for rules.csv AddText content
      applyRulesCSVAddText(csvData, entry);
      continue;
    }

    // Find the matching row and column
    for (const row of csvData.rows) {
      if (row._empty || row._comment) continue;

      const idCol = getIdColumn(fileName);
      if (row[idCol] === entry.rowId && entry.field in row) {
        row[entry.field] = entry.translated;
      }
    }
  }

  fs.writeFileSync(filePath, serializeCSV(csvData), 'utf-8');
}

function applyRulesCSVAddText(csvData, entry) {
  // For rules.csv, we need to replace the AddText content in the script column
  for (const row of csvData.rows) {
    if (row._empty || row._comment) continue;

    const idCol = 'id';
    if (row[idCol] !== entry.rowId) continue;

    const script = row['script'] || '';
    // Replace the original AddText content with translation
    // This is tricky - we match the original text within AddText "" ""
    const escapedOriginal = entry.original.replace(/"/g, '""');
    const escapedTranslation = entry.translated.replace(/"/g, '""');
    row['script'] = script.replace(
      `""${escapedOriginal}""`,
      `""${escapedTranslation}""`
    );
  }
}

/**
 * Apply translations to a JSON-like file
 * Uses string replacement to preserve comments and formatting
 */
function applyJsonTranslations(filePath, entries) {
  let content = fs.readFileSync(filePath, 'utf-8');

  for (const entry of entries) {
    // Use careful string replacement to preserve file formatting
    const originalEscaped = escapeForJsonSearch(entry.original);
    // Order matters: backslash must be escaped first to avoid double-escaping
    const translatedEscaped = entry.translated
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    // Replace in quoted strings
    content = content.replace(
      new RegExp(`"${originalEscaped}"`, 'g'),
      `"${translatedEscaped}"`
    );
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}

function escapeForJsonSearch(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[.*+?^${}()|[\]]/g, '\\$&');
}

function getIdColumn(fileName) {
  const map = {
    'descriptions.csv': 'id',
    'ship_data.csv': 'id',
    'wing_data.csv': 'id',
    'weapon_data.csv': 'id',
    'hull_mods.csv': 'id',
    'industries.csv': 'id',
    'special_items.csv': 'id',
    'rules.csv': 'id',
    'bar_events.csv': 'id',
    'person_missions.csv': 'id',
    'sim_opponents.csv': 'id',
    'commodities.csv': 'id',
    'market_conditions.csv': 'id',
    'title_screen_variants.csv': 'id',
    'LunaSettings.csv': 'fieldID',
    'abilities.csv': 'id',
    'submarkets.csv': 'id',
    'personalities.csv': 'id',
    'skill_data.csv': 'id',
    'aptitude_data.csv': 'id',
    'ship_systems.csv': 'id',
    'reports.csv': 'event_type',
    'name_gen_data.csv': 'name',
  };
  return map[fileName] || 'id';
}

/**
 * Recursively copy directory
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = { exportMod, getIdColumn };

