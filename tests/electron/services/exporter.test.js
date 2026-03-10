import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const { exportMod, getIdColumn } = require('../../../electron/services/exporter');

function createTempDir(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exporter-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');
  }
  return tmpDir;
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('getIdColumn', () => {
  it('returns correct id column for known CSV files', () => {
    expect(getIdColumn('ship_data.csv')).toBe('id');
    expect(getIdColumn('hull_mods.csv')).toBe('id');
    expect(getIdColumn('LunaSettings.csv')).toBe('fieldID');
    expect(getIdColumn('reports.csv')).toBe('event_type');
    expect(getIdColumn('name_gen_data.csv')).toBe('name');
  });

  it('returns "id" for unknown CSV files', () => {
    expect(getIdColumn('unknown.csv')).toBe('id');
  });
});

describe('exportMod', () => {
  it('applies JSON translations with proper escaping of special characters', async () => {
    const modDir = createTempDir({
      'mod_info.json': JSON.stringify({ id: 'test', name: 'Test', version: '1.0' }),
      'data/config.json': '{\n  "greeting": "Hello World",\n  "farewell": "Goodbye"\n}',
    });
    const outputDir = createTempDir({});

    try {
      const result = await exportMod({
        modPath: modDir,
        entries: [
          {
            file: 'data/config.json',
            original: 'Hello World',
            translated: '你好世界',
            status: 'translated',
            field: 'greeting',
          },
        ],
        modInfo: { id: 'test', name: 'Test' },
      }, outputDir);

      const outputFile = path.join(result.outputPath, 'data/config.json');
      const content = fs.readFileSync(outputFile, 'utf-8');
      expect(content).toContain('"你好世界"');
      expect(content).toContain('"Goodbye"'); // Unchanged entry preserved
    } finally {
      cleanupDir(modDir);
      cleanupDir(outputDir);
    }
  });

  it('escapes newlines and tabs in JSON translations', async () => {
    const modDir = createTempDir({
      'mod_info.json': JSON.stringify({ id: 'test', name: 'Test', version: '1.0' }),
      'data/strings.json': '{\n  "msg": "Line one"\n}',
    });
    const outputDir = createTempDir({});

    try {
      const result = await exportMod({
        modPath: modDir,
        entries: [
          {
            file: 'data/strings.json',
            original: 'Line one',
            translated: 'Line\none\ttab',
            status: 'translated',
            field: 'msg',
          },
        ],
        modInfo: { id: 'test', name: 'Test' },
      }, outputDir);

      const outputFile = path.join(result.outputPath, 'data/strings.json');
      const content = fs.readFileSync(outputFile, 'utf-8');
      // Newline and tab should be escaped in JSON output
      expect(content).toContain('Line\\none\\ttab');
      // The file should still be valid JSON
      expect(() => JSON.parse(content)).not.toThrow();
    } finally {
      cleanupDir(modDir);
      cleanupDir(outputDir);
    }
  });

  it('applies CSV translations correctly', async () => {
    const csvContent = 'id,name,desc\nship1,Destroyer,A fast ship\nship2,Cruiser,A big ship\n';
    const modDir = createTempDir({
      'mod_info.json': JSON.stringify({ id: 'test', name: 'Test', version: '1.0' }),
      'data/ship_data.csv': csvContent,
    });
    const outputDir = createTempDir({});

    try {
      const result = await exportMod({
        modPath: modDir,
        entries: [
          {
            file: 'data/ship_data.csv',
            csvFileName: 'ship_data.csv',
            original: 'Destroyer',
            translated: '驱逐舰',
            status: 'translated',
            field: 'name',
            rowId: 'ship1',
          },
        ],
        modInfo: { id: 'test', name: 'Test' },
      }, outputDir);

      const outputFile = path.join(result.outputPath, 'data/ship_data.csv');
      const content = fs.readFileSync(outputFile, 'utf-8');
      expect(content).toContain('驱逐舰');
      expect(content).toContain('Cruiser'); // Unchanged entry preserved
    } finally {
      cleanupDir(modDir);
      cleanupDir(outputDir);
    }
  });

  it('handles .variant and .skill file extensions in JSON export', async () => {
    const modDir = createTempDir({
      'mod_info.json': JSON.stringify({ id: 'test', name: 'Test', version: '1.0' }),
      'data/test.variant': '{\n  "displayName": "Elite"\n}',
      'data/test.skill': '{\n  "effectGroups": [{"name": "Elite"}]\n}',
    });
    const outputDir = createTempDir({});

    try {
      const result = await exportMod({
        modPath: modDir,
        entries: [
          {
            file: 'data/test.variant',
            original: 'Elite',
            translated: '精英',
            status: 'translated',
            field: 'displayName',
          },
          {
            file: 'data/test.skill',
            original: 'Elite',
            translated: '精英',
            status: 'translated',
            field: 'name',
          },
        ],
        modInfo: { id: 'test', name: 'Test' },
      }, outputDir);

      const variantFile = path.join(result.outputPath, 'data/test.variant');
      const skillFile = path.join(result.outputPath, 'data/test.skill');
      expect(fs.readFileSync(variantFile, 'utf-8')).toContain('"精英"');
      expect(fs.readFileSync(skillFile, 'utf-8')).toContain('"精英"');
    } finally {
      cleanupDir(modDir);
      cleanupDir(outputDir);
    }
  });

  it('skips ignored entries during export', async () => {
    const csvContent = 'id,name,desc\nship1,Destroyer,A fast ship\nship2,Cruiser,A big ship\n';
    const modDir = createTempDir({
      'mod_info.json': JSON.stringify({ id: 'test', name: 'Test', version: '1.0' }),
      'data/ship_data.csv': csvContent,
      'data/config.json': '{\n  "greeting": "Hello World"\n}',
    });
    const outputDir = createTempDir({});

    try {
      const result = await exportMod({
        modPath: modDir,
        entries: [
          {
            file: 'data/ship_data.csv',
            csvFileName: 'ship_data.csv',
            original: 'Destroyer',
            translated: '驱逐舰',
            status: 'translated',
            field: 'name',
            rowId: 'ship1',
            ignored: true,      // This entry is ignored
          },
          {
            file: 'data/config.json',
            original: 'Hello World',
            translated: '你好世界',
            status: 'translated',
            field: 'greeting',
            ignored: false,
          },
        ],
        modInfo: { id: 'test', name: 'Test' },
      }, outputDir);

      // Ignored CSV entry should NOT be translated
      const csvFile = path.join(result.outputPath, 'data/ship_data.csv');
      const csvOut = fs.readFileSync(csvFile, 'utf-8');
      expect(csvOut).toContain('Destroyer'); // Not replaced
      expect(csvOut).not.toContain('驱逐舰');

      // Non-ignored JSON entry SHOULD be translated
      const jsonFile = path.join(result.outputPath, 'data/config.json');
      const jsonOut = fs.readFileSync(jsonFile, 'utf-8');
      expect(jsonOut).toContain('"你好世界"');
    } finally {
      cleanupDir(modDir);
      cleanupDir(outputDir);
    }
  });
});
