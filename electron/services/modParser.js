/**
 * Starsector Mod Folder Parser
 *
 * Scans a mod folder and extracts all translatable text entries
 * from CSV files, relaxed JSON files (.faction, .ship, .skin, etc.)
 */

const fs = require('fs');
const path = require('path');
const { parseRelaxedJson } = require('./relaxedJson');
const { parseCSV } = require('./csvParser');

// ─── File type definitions ───────────────────────────────────────────

/** CSV files and their translatable columns */
const CSV_TRANSLATABLE = {
  'descriptions.csv': { columns: ['text1', 'text2', 'text3', 'text4'], idColumn: 'id', typeColumn: 'type' },
  'ship_data.csv': { columns: ['name', 'designation'], idColumn: 'id' },
  'wing_data.csv': { columns: ['name', 'designation'], idColumn: 'id' },
  'weapon_data.csv': { columns: ['name', 'primaryRoleStr', 'customPrimary', 'customPrimaryHL', 'customAncillary', 'customAncillaryHL'], idColumn: 'id' },
  'hull_mods.csv': { columns: ['name', 'desc', 'short'], idColumn: 'id' },
  'industries.csv': { columns: ['name', 'desc'], idColumn: 'id' },
  'special_items.csv': { columns: ['name', 'desc'], idColumn: 'id' },
  'market_conditions.csv': { columns: ['name', 'desc'], idColumn: 'id' },
  'commodities.csv': { columns: ['name'], idColumn: 'id' },
  'rules.csv': { columns: ['script', 'text'], idColumn: 'id' },
  'bar_events.csv': { columns: ['text'], idColumn: 'id' },
  'person_missions.csv': { columns: ['text'], idColumn: 'id' },
  'sim_opponents.csv': { columns: ['name'], idColumn: 'id' },
  'title_screen_variants.csv': { columns: ['name'], idColumn: 'id' },
  'LunaSettings.csv': { columns: ['fieldName', 'fieldDescription', 'tab'], idColumn: 'fieldID' },
};

/** Category labels for CSV files */
const CSV_CATEGORY = {
  'descriptions.csv': null, // derived from 'type' column at parse time
  'ship_data.csv': '舰船',
  'wing_data.csv': '飞行队',
  'weapon_data.csv': '武器',
  'hull_mods.csv': '舰船改装件',
  'industries.csv': '工业建筑',
  'special_items.csv': '特殊物品',
  'market_conditions.csv': '市场条件',
  'commodities.csv': '商品',
  'rules.csv': '剧情对话',
  'bar_events.csv': '酒吧事件',
  'person_missions.csv': '任务文本',
  'sim_opponents.csv': '战斗文本',
  'title_screen_variants.csv': '界面文本',
  'LunaSettings.csv': 'Luna设置',
};

/** descriptions.csv `type` column values → Chinese category */
const DESCRIPTIONS_TYPE_CATEGORY = {
  SHIP: '舰船描述',
  WEAPON: '武器描述',
  STATION: '空间站描述',
  PLANET: '星球描述',
  INDUSTRY: '工业建筑描述',
  CUSTOM: '剧情描述',
  RESOURCE: '资源描述',
};

/** JSON-like files and their translatable fields */
const JSON_TRANSLATABLE_FIELDS = {
  '.faction': ['displayName', 'displayNameWithArticle', 'displayNameLong', 'displayNameLongWithArticle', 'entityNamePrefix', 'personNamePrefix'],
  '.ship': ['hullName'],
  '.skin': ['hullName', 'descriptionPrefix'],
};

/** Category labels for JSON file extensions */
const JSON_EXT_CATEGORY = {
  '.faction': '势力',
  '.ship': '舰船',
  '.skin': '舰船皮肤',
};

/** Simple JSON files with array of strings */
const JSON_STRING_ARRAYS = {
  'tips.json': { path: 'tips', category: '游戏提示' },
  'ship_names.json': { path: '*', category: '舰船名称' },
};

// ─── Main parser ─────────────────────────────────────────────────────

/**
 * Parse entire mod folder and return translatable entries
 * @param {string} modPath - Absolute path to the mod folder
 * @returns {Promise<object>} - Parsed project data
 */
async function parseModFolder(modPath) {
  // Validate mod_info.json exists
  const modInfoPath = path.join(modPath, 'mod_info.json');
  if (!fs.existsSync(modInfoPath)) {
    throw new Error('找不到 mod_info.json，请确认选择了正确的MOD文件夹');
  }

  const modInfoRaw = fs.readFileSync(modInfoPath, 'utf-8');
  const modInfo = parseRelaxedJson(modInfoRaw);

  const entries = [];

  // 1) Parse mod_info.json itself
  const modInfoEntries = extractModInfoEntries(modInfo, modInfoPath, modPath);
  entries.push(...modInfoEntries);

  // 2) Recursively find all parseable files
  const allFiles = getAllFiles(modPath);

  for (const filePath of allFiles) {
    const relPath = path.relative(modPath, filePath).replace(/\\/g, '/');
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);

    try {
      // CSV files
      if (ext === '.csv' && CSV_TRANSLATABLE[fileName]) {
        const csvEntries = parseCSVFile(filePath, relPath, fileName);
        entries.push(...csvEntries);
        continue;
      }

      // JSON string array files (tips.json, ship_names.json)
      if (JSON_STRING_ARRAYS[fileName]) {
        const jsonEntries = parseJsonStringArrayFile(filePath, relPath, fileName);
        entries.push(...jsonEntries);
        continue;
      }

      // Relaxed JSON files (.faction, .ship, .skin)
      if (JSON_TRANSLATABLE_FIELDS[ext]) {
        const jsonEntries = parseRelaxedJsonFile(filePath, relPath, ext);
        entries.push(...jsonEntries);
        continue;
      }
    } catch (err) {
      console.warn(`Warning: Failed to parse ${relPath}: ${err.message}`);
    }
  }

  return {
    modInfo: {
      id: modInfo.id || '',
      name: modInfo.name || '',
      author: modInfo.author || '',
      version: modInfo.version || '',
      description: modInfo.description || '',
      gameVersion: modInfo.gameVersion || '',
    },
    modPath,
    entries,
    stats: computeStats(entries),
  };
}

// ─── Individual parsers ──────────────────────────────────────────────

function extractModInfoEntries(modInfo, filePath, modPath) {
  const relPath = path.relative(modPath, filePath).replace(/\\/g, '/');
  const entries = [];
  const translatableFields = ['name', 'description'];

  for (const field of translatableFields) {
    if (modInfo[field]) {
      entries.push({
        id: `mod_info::${field}`,
        file: relPath,
        fileType: 'mod_info',
        category: 'MOD信息',
        field,
        original: modInfo[field],
        translated: '',
        status: 'untranslated',
        context: `MOD信息 - ${field}`,
      });
    }
  }
  return entries;
}

function parseCSVFile(filePath, relPath, fileName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const config = CSV_TRANSLATABLE[fileName];
  const { headers, rows } = parseCSV(content);
  const entries = [];
  const baseCategory = CSV_CATEGORY[fileName];

  for (const row of rows) {
    if (row._empty || row._comment) continue;

    const rowId = row[config.idColumn] || '';
    if (!rowId) continue; // skip rows without ID

    for (const col of config.columns) {
      if (!headers.includes(col)) continue;
      const value = row[col];
      if (!value || !value.trim()) continue;

      // For rules.csv script column, extract only AddText content
      if (fileName === 'rules.csv' && col === 'script') {
        const addTextEntries = extractAddTextFromScript(value, rowId, relPath);
        entries.push(...addTextEntries);
        continue;
      }

      // Derive category: use type column for descriptions.csv
      let category = baseCategory;
      if (fileName === 'descriptions.csv' && config.typeColumn) {
        const typeVal = (row[config.typeColumn] || '').toUpperCase();
        category = DESCRIPTIONS_TYPE_CATEGORY[typeVal] || '其他描述';
      }

      const typeInfo = config.typeColumn ? ` [${row[config.typeColumn] || ''}]` : '';
      entries.push({
        id: `${relPath}::${rowId}::${col}`,
        file: relPath,
        fileType: 'csv',
        category,
        csvFileName: fileName,
        field: col,
        rowId,
        original: value,
        translated: '',
        status: 'untranslated',
        context: `${fileName}${typeInfo} - ${col}`,
      });
    }
  }

  return entries;
}

/**
 * Extract AddText string content from rules.csv script column
 * rules.csv scripts contain commands like: AddText "some text here"
 */
function extractAddTextFromScript(script, rowId, relPath) {
  const entries = [];
  // Match AddText "..." patterns (with "" escaping inside)
  const regex = /AddText\s+""((?:[^"]|"")*)""/g;
  let match;
  let idx = 0;

  while ((match = regex.exec(script)) !== null) {
    const text = match[1].replace(/""/g, '"');
    if (text.trim()) {
      entries.push({
        id: `${relPath}::${rowId}::script_addtext_${idx}`,
        file: relPath,
        fileType: 'csv',
        category: '剧情对话',
        csvFileName: 'rules.csv',
        field: 'script(AddText)',
        rowId,
        original: text,
        translated: '',
        status: 'untranslated',
        context: `rules.csv - 对话/描述文本`,
      });
      idx++;
    }
  }

  return entries;
}

function parseJsonStringArrayFile(filePath, relPath, fileName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content);
  const entries = [];
  const config = JSON_STRING_ARRAYS[fileName];
  const category = config.category || '其他';

  if (config.path === '*') {
    // All keys contain string arrays (like ship_names.json)
    for (const [key, arr] of Object.entries(data)) {
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] === 'string' && arr[i].trim()) {
            entries.push({
              id: `${relPath}::${key}::${i}`,
              file: relPath,
              fileType: 'json_array',
              category,
              field: key,
              arrayIndex: i,
              original: arr[i],
              translated: '',
              status: 'untranslated',
              context: `${fileName} - ${key}[${i}]`,
            });
          }
        }
      }
    }
  } else {
    // Specific path like tips.json -> tips array
    const arr = data[config.path];
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] === 'string' && arr[i].trim()) {
          entries.push({
            id: `${relPath}::${config.path}::${i}`,
            file: relPath,
            fileType: 'json_array',
            category,
            field: config.path,
            arrayIndex: i,
            original: arr[i],
            translated: '',
            status: 'untranslated',
            context: `${fileName} - ${config.path}[${i}]`,
          });
        }
      }
    }
  }

  return entries;
}

function parseRelaxedJsonFile(filePath, relPath, ext) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content);
  const fields = JSON_TRANSLATABLE_FIELDS[ext];
  const category = JSON_EXT_CATEGORY[ext] || '其他';
  const entries = [];

  for (const field of fields) {
    if (data[field] && typeof data[field] === 'string' && data[field].trim()) {
      const fileId = data.hullId || data.skinHullId || data.id || path.basename(filePath, ext);
      entries.push({
        id: `${relPath}::${fileId}::${field}`,
        file: relPath,
        fileType: 'json',
        category,
        field,
        original: data[field],
        translated: '',
        status: 'untranslated',
        context: `${path.basename(filePath)} - ${field}`,
      });
    }
  }

  return entries;
}

// ─── Utility ─────────────────────────────────────────────────────────

function getAllFiles(dirPath, fileList = []) {
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip certain directories
      const skip = ['graphics', 'sounds', 'jars', '.git', 'node_modules'];
      if (!skip.includes(item)) {
        getAllFiles(fullPath, fileList);
      }
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function computeStats(entries) {
  const byFile = {};
  const byType = {};
  let total = entries.length;
  let translated = 0;
  let polished = 0;

  for (const entry of entries) {
    // By file
    if (!byFile[entry.file]) byFile[entry.file] = { total: 0, translated: 0 };
    byFile[entry.file].total++;

    // By type
    const type = entry.csvFileName || entry.fileType;
    if (!byType[type]) byType[type] = { total: 0, translated: 0 };
    byType[type].total++;

    if (entry.status === 'translated' || entry.status === 'polished' || entry.status === 'reviewed') {
      translated++;
      byFile[entry.file].translated++;
      byType[type].translated++;
    }
    if (entry.status === 'polished' || entry.status === 'reviewed') {
      polished++;
    }
  }

  return { total, translated, polished, byFile, byType };
}

module.exports = { parseModFolder };

