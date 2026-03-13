/**
 * Starsector Mod Folder Parser
 *
 * Scans a mod folder and extracts all translatable text entries
 * from CSV files, relaxed JSON files (.faction, .ship, .skin, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseRelaxedJson } from './relaxedJson';
import { parseCSV } from './csvParser';
import type { TranslationEntry, ModInfo, ParsedModData, ProjectStats } from '../../types/project';

// ─── Type definitions ────────────────────────────────────────────────

interface CSVConfig {
  columns: string[];
  idColumn: string;
  typeColumn?: string;
}

interface JSONArrayConfig {
  path: string;
  category: string;
}

interface JSONConfigFile {
  fields: string[];
  category: string;
}

interface JSONFlatMapConfig {
  category: string;
}

interface CSVRow {
  [key: string]: string | boolean | undefined;
  _empty?: boolean;
  _comment?: boolean;
}

interface CSVData {
  headers: string[];
  rows: CSVRow[];
}

// ─── File type definitions ───────────────────────────────────────────

/** CSV files and their translatable columns */
const CSV_TRANSLATABLE: Record<string, CSVConfig> = {
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
  'abilities.csv': { columns: ['name', 'desc'], idColumn: 'id' },
  'submarkets.csv': { columns: ['name', 'desc'], idColumn: 'id' },
  'personalities.csv': { columns: ['name', 'desc'], idColumn: 'id' },
  'skill_data.csv': { columns: ['name', 'description', 'author'], idColumn: 'id' },
  'aptitude_data.csv': { columns: ['name', 'description'], idColumn: 'id' },
  'ship_systems.csv': { columns: ['name'], idColumn: 'id' },
  'reports.csv': { columns: ['subject', 'summary', 'assessment'], idColumn: 'event_type' },
  'name_gen_data.csv': { columns: ['name'], idColumn: 'name' },
};

/** Category labels for CSV files */
const CSV_CATEGORY: Record<string, string | null> = {
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
  'abilities.csv': '能力',
  'submarkets.csv': '子市场',
  'personalities.csv': '性格',
  'skill_data.csv': '技能',
  'aptitude_data.csv': '能力分支',
  'ship_systems.csv': '舰船系统',
  'reports.csv': '事件报告',
  'name_gen_data.csv': '程序命名',
};

/** descriptions.csv `type` column values → Chinese category */
const DESCRIPTIONS_TYPE_CATEGORY: Record<string, string> = {
  SHIP: '舰船描述',
  WEAPON: '武器描述',
  STATION: '空间站描述',
  PLANET: '星球描述',
  INDUSTRY: '工业建筑描述',
  CUSTOM: '剧情描述',
  RESOURCE: '资源描述',
};

/** JSON-like files and their translatable fields */
const JSON_TRANSLATABLE_FIELDS: Record<string, string[]> = {
  '.faction': ['displayName', 'displayNameWithArticle', 'displayNameLong', 'displayNameLongWithArticle', 'entityNamePrefix', 'personNamePrefix'],
  '.ship': ['hullName'],
  '.skin': ['hullName', 'descriptionPrefix'],
  '.variant': ['displayName'],
};

/** Category labels for JSON file extensions */
const JSON_EXT_CATEGORY: Record<string, string> = {
  '.faction': '势力',
  '.ship': '舰船',
  '.skin': '舰船皮肤',
  '.variant': '变体',
};

/** Simple JSON files with array of strings */
const JSON_STRING_ARRAYS: Record<string, JSONArrayConfig> = {
  'tips.json': { path: 'tips', category: '游戏提示' },
  'ship_names.json': { path: '*', category: '舰船名称' },
};

/** JSON config files: top-level keys are IDs, each value is an object with translatable fields */
const JSON_CONFIG_FILES: Record<string, JSONConfigFile> = {
  'planets.json': { fields: ['name'], category: '星球类型' },
  'battle_objectives.json': { fields: ['name'], category: '战斗目标' },
  'contact_tag_data.json': { fields: ['name'], category: '联络人标签' },
  'tag_data.json': { fields: ['name'], category: '情报标签' },
  'custom_entities.json': { fields: ['defaultName', 'nameInText', 'shortName', 'aOrAn', 'isOrAre'], category: '自定义实体' },
};

/** JSON files where all top-level key→value pairs are translatable strings */
const JSON_FLAT_STRING_MAP: Record<string, JSONFlatMapConfig> = {
  'default_fleet_type_names.json': { category: '舰队类型' },
};

// ─── Main parser ─────────────────────────────────────────────────────

/**
 * Parse entire mod folder and return translatable entries
 * @param modPath - Absolute path to the mod folder
 * @returns Parsed project data
 */
async function parseModFolder(modPath: string): Promise<ParsedModData> {
  // Validate mod_info.json exists
  const modInfoPath = path.join(modPath, 'mod_info.json');
  if (!fs.existsSync(modInfoPath)) {
    throw new Error('找不到 mod_info.json，请确认选择了正确的MOD文件夹');
  }

  const modInfoRaw = fs.readFileSync(modInfoPath, 'utf-8');
  const modInfo = parseRelaxedJson(modInfoRaw) as any;

  const entries: TranslationEntry[] = [];

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

      // Relaxed JSON files (.faction, .ship, .skin, .variant)
      if (JSON_TRANSLATABLE_FIELDS[ext]) {
        const jsonEntries = parseRelaxedJsonFile(filePath, relPath, ext);
        entries.push(...jsonEntries);
        continue;
      }

      // JSON config files (planets.json, battle_objectives.json, etc.)
      if (JSON_CONFIG_FILES[fileName]) {
        const jsonEntries = parseJsonConfigFile(filePath, relPath, fileName);
        entries.push(...jsonEntries);
        continue;
      }

      // JSON flat string maps (default_fleet_type_names.json)
      if (JSON_FLAT_STRING_MAP[fileName]) {
        const jsonEntries = parseJsonFlatStringMap(filePath, relPath, fileName);
        entries.push(...jsonEntries);
        continue;
      }

      // default_ranks.json (nested sections with name field)
      if (fileName === 'default_ranks.json') {
        const jsonEntries = parseDefaultRanksFile(filePath, relPath);
        entries.push(...jsonEntries);
        continue;
      }

      // strings.json (deep nested string values)
      if (fileName === 'strings.json') {
        const jsonEntries = parseStringsFile(filePath, relPath);
        entries.push(...jsonEntries);
        continue;
      }

      // tooltips.json (nested objects with title/body)
      if (fileName === 'tooltips.json') {
        const jsonEntries = parseTooltipsFile(filePath, relPath);
        entries.push(...jsonEntries);
        continue;
      }

      // Mission descriptor files (missions/*/descriptor.json)
      if (fileName === 'descriptor.json' && relPath.includes('missions/')) {
        const jsonEntries = parseMissionDescriptor(filePath, relPath);
        entries.push(...jsonEntries);
        continue;
      }

      // .skill files (effectGroups[n].name)
      if (ext === '.skill') {
        const jsonEntries = parseSkillFile(filePath, relPath);
        entries.push(...jsonEntries);
        continue;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Failed to parse ${relPath}: ${message}`);
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

function extractModInfoEntries(modInfo: any, filePath: string, modPath: string): TranslationEntry[] {
  const relPath = path.relative(modPath, filePath).replace(/\\/g, '/');
  const entries: TranslationEntry[] = [];
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

function parseCSVFile(filePath: string, relPath: string, fileName: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const config = CSV_TRANSLATABLE[fileName];
  const csvData = parseCSV(content) as CSVData;
  const entries: TranslationEntry[] = [];
  const baseCategory = CSV_CATEGORY[fileName];

  for (const row of csvData.rows) {
    if (row._empty || row._comment) continue;

    const rowId = (row[config.idColumn] as string) || '';
    if (!rowId) continue; // skip rows without ID

    for (const col of config.columns) {
      if (!csvData.headers.includes(col)) continue;
      const value = row[col] as string;
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
        const typeVal = ((row[config.typeColumn] as string) || '').toUpperCase();
        category = DESCRIPTIONS_TYPE_CATEGORY[typeVal] || '其他描述';
      }

      const typeInfo = config.typeColumn ? ` [${(row[config.typeColumn] as string) || ''}]` : '';
      entries.push({
        id: `${relPath}::${rowId}::${col}`,
        file: relPath,
        fileType: 'csv',
        category: category || '其他',
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
function extractAddTextFromScript(script: string, rowId: string, relPath: string): TranslationEntry[] {
  const entries: TranslationEntry[] = [];
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

function parseJsonStringArrayFile(filePath: string, relPath: string, fileName: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const entries: TranslationEntry[] = [];
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

function parseRelaxedJsonFile(filePath: string, relPath: string, ext: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const fields = JSON_TRANSLATABLE_FIELDS[ext];
  const category = JSON_EXT_CATEGORY[ext] || '其他';
  const entries: TranslationEntry[] = [];

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

function parseJsonConfigFile(filePath: string, relPath: string, fileName: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const config = JSON_CONFIG_FILES[fileName];
  const entries: TranslationEntry[] = [];

  for (const [key, obj] of Object.entries(data)) {
    if (typeof obj !== 'object' || obj === null) continue;
    const objAny = obj as any;
    for (const field of config.fields) {
      if (objAny[field] && typeof objAny[field] === 'string' && objAny[field].trim()) {
        entries.push({
          id: `${relPath}::${key}::${field}`,
          file: relPath,
          fileType: 'json_config',
          category: config.category,
          field,
          objectKey: key,
          original: objAny[field],
          translated: '',
          status: 'untranslated',
          context: `${fileName} - ${key}.${field}`,
        });
      }
    }
  }

  return entries;
}

function parseJsonFlatStringMap(filePath: string, relPath: string, fileName: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const config = JSON_FLAT_STRING_MAP[fileName];
  const entries: TranslationEntry[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.trim()) {
      entries.push({
        id: `${relPath}::${key}`,
        file: relPath,
        fileType: 'json_flat_map',
        category: config.category,
        field: key,
        original: value,
        translated: '',
        status: 'untranslated',
        context: `${fileName} - ${key}`,
      });
    }
  }

  return entries;
}

function parseDefaultRanksFile(filePath: string, relPath: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const entries: TranslationEntry[] = [];

  for (const section of ['ranks', 'posts']) {
    const sectionData = data[section];
    if (!sectionData || typeof sectionData !== 'object') continue;

    for (const [key, obj] of Object.entries(sectionData)) {
      if (typeof obj !== 'object' || obj === null) continue;
      const objAny = obj as any;
      if (objAny.name && typeof objAny.name === 'string' && objAny.name.trim()) {
        entries.push({
          id: `${relPath}::${section}::${key}::name`,
          file: relPath,
          fileType: 'json_ranks',
          category: '军衔',
          field: 'name',
          section,
          objectKey: key,
          original: objAny.name,
          translated: '',
          status: 'untranslated',
          context: `default_ranks.json - ${section}.${key}.name`,
        });
      }
    }
  }

  return entries;
}

function parseStringsFile(filePath: string, relPath: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const entries: TranslationEntry[] = [];

  function walk(obj: any, pathParts: string[]): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...pathParts, key];
      if (typeof value === 'string' && value.trim()) {
        entries.push({
          id: `${relPath}::${currentPath.join('.')}`,
          file: relPath,
          fileType: 'json_strings',
          category: 'UI字符串',
          field: currentPath.join('.'),
          original: value,
          translated: '',
          status: 'untranslated',
          context: `strings.json - ${currentPath.join('.')}`,
        });
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        walk(value, currentPath);
      }
    }
  }

  walk(data, []);
  return entries;
}

function parseTooltipsFile(filePath: string, relPath: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const entries: TranslationEntry[] = [];
  const tooltipFields = ['title', 'body'];

  function walk(obj: any, pathParts: string[]): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const currentPath = [...pathParts, key];

      // Check if this is a tooltip leaf (has title or body)
      const hasTooltipField = tooltipFields.some(f => typeof (value as any)[f] === 'string');
      if (hasTooltipField) {
        for (const field of tooltipFields) {
          if (typeof (value as any)[field] === 'string' && (value as any)[field].trim()) {
            entries.push({
              id: `${relPath}::${currentPath.join('.')}.${field}`,
              file: relPath,
              fileType: 'json_tooltips',
              category: '提示信息',
              field: `${currentPath.join('.')}.${field}`,
              original: (value as any)[field],
              translated: '',
              status: 'untranslated',
              context: `tooltips.json - ${currentPath.join('.')}.${field}`,
            });
          }
        }
      } else {
        walk(value, currentPath);
      }
    }
  }

  walk(data, []);
  return entries;
}

function parseMissionDescriptor(filePath: string, relPath: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const entries: TranslationEntry[] = [];
  const fields = ['title', 'difficulty'];

  for (const field of fields) {
    if (data[field] && typeof data[field] === 'string' && data[field].trim()) {
      entries.push({
        id: `${relPath}::${field}`,
        file: relPath,
        fileType: 'json_mission',
        category: '任务',
        field,
        original: data[field],
        translated: '',
        status: 'untranslated',
        context: `${path.basename(path.dirname(filePath))} - ${field}`,
      });
    }
  }

  return entries;
}

function parseSkillFile(filePath: string, relPath: string): TranslationEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseRelaxedJson(content) as any;
  const entries: TranslationEntry[] = [];

  if (Array.isArray(data.effectGroups)) {
    for (let i = 0; i < data.effectGroups.length; i++) {
      const group = data.effectGroups[i];
      if (group && typeof group.name === 'string' && group.name.trim()) {
        entries.push({
          id: `${relPath}::effectGroups::${i}::name`,
          file: relPath,
          fileType: 'json_skill',
          category: '技能',
          field: 'name',
          arrayIndex: i,
          original: group.name,
          translated: '',
          status: 'untranslated',
          context: `${path.basename(filePath)} - effectGroups[${i}].name`,
        });
      }
    }
  }

  return entries;
}

// ─── Utility ─────────────────────────────────────────────────────────

function getAllFiles(dirPath: string, fileList: string[] = []): string[] {
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

function computeStats(entries: TranslationEntry[]): ProjectStats {
  const byFile: Record<string, { total: number; translated: number }> = {};
  const byType: Record<string, { total: number; translated: number }> = {};
  const total = entries.length;
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

export { parseModFolder };
