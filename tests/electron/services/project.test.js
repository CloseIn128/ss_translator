import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectManager } from '../../../electron/services/project';

describe('ProjectManager – keywords persistence', () => {
  let pm;
  let tmpDir;

  beforeEach(() => {
    pm = new ProjectManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-proj-kw-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('new project includes an empty keywords array', async () => {
    // Create a minimal mod folder so parseModFolder succeeds
    const modDir = path.join(tmpDir, 'test_mod');
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, 'mod_info.json'),
      JSON.stringify({ id: 'test', name: 'Test Mod', version: '1.0' }),
      'utf-8',
    );

    const project = await pm.createProject(modDir);
    expect(Array.isArray(project.keywords)).toBe(true);
    expect(project.keywords).toEqual([]);
  });

  it('saves and loads keywords through project file', async () => {
    // Create a minimal mod folder
    const modDir = path.join(tmpDir, 'test_mod');
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, 'mod_info.json'),
      JSON.stringify({ id: 'test', name: 'Test Mod', version: '1.0' }),
      'utf-8',
    );

    const project = await pm.createProject(modDir);

    // Add keywords to the project
    project.keywords = [
      { key: 'structure_0', source: 'Hegemony', target: '霸主', category: '势力名称', extractType: 'structure' },
      { key: 'ai_1', source: 'Onslaught', target: '猛攻号', category: '舰船名称', extractType: 'ai' },
    ];

    project.projectFilePath = path.join(tmpDir, 'test_translation.sst');
    await pm.saveProject(project);

    // Load the project and verify keywords survived the round-trip
    const loaded = await pm.loadProject(project.projectFilePath);
    expect(loaded.keywords).toHaveLength(2);
    expect(loaded.keywords[0].source).toBe('Hegemony');
    expect(loaded.keywords[0].target).toBe('霸主');
    expect(loaded.keywords[0].extractType).toBe('structure');
    expect(loaded.keywords[1].source).toBe('Onslaught');
    expect(loaded.keywords[1].key).toBe('ai_1');
  });

  it('loads project without keywords field gracefully', async () => {
    // Simulate an older project file that has no keywords field
    const projectData = {
      id: 'old-project',
      version: '1.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modInfo: { id: 'test', name: 'Old Project', version: '1.0' },
      modPath: tmpDir,
      entries: [],
      glossary: [],
      aiConfig: {},
    };

    const filePath = path.join(tmpDir, 'old_project.sst');
    fs.writeFileSync(filePath, JSON.stringify(projectData), 'utf-8');

    const loaded = await pm.loadProject(filePath);
    // keywords field is undefined for old projects – consumers use (project.keywords || [])
    expect(loaded.id).toBe('old-project');
    expect(loaded.keywords).toBeUndefined();
  });
});

describe('ProjectManager – createEmptyProject', () => {
  let pm;
  let tmpDir;

  beforeEach(() => {
    pm = new ProjectManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-proj-empty-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates an empty project with correct structure', () => {
    const project = pm.createEmptyProject();

    expect(project.id).toBeDefined();
    expect(typeof project.id).toBe('string');
    expect(project.version).toBe('1.0');
    expect(project.modPath).toBe('');
    expect(project.modInfo).toEqual({});
    expect(project.entries).toEqual([]);
    expect(project.glossary).toEqual([]);
    expect(project.keywords).toEqual([]);
    expect(project.legacyModPath).toBe('');
    expect(project.outputDir).toBe('');
    expect(project.modPrompt).toBe('');
    expect(project.stats).toEqual({ total: 0, translated: 0, polished: 0, byFile: {}, byType: {} });
    expect(project.projectFilePath).toBeNull();
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();
  });

  it('sets currentProject reference', () => {
    const project = pm.createEmptyProject();
    expect(pm.currentProject).toBe(project);
  });

  it('empty project can be saved and reloaded when projectFilePath is set', async () => {
    const project = pm.createEmptyProject();
    project.projectFilePath = path.join(tmpDir, 'empty_project.sst');

    await pm.saveProject(project);
    expect(fs.existsSync(project.projectFilePath)).toBe(true);

    const loaded = await pm.loadProject(project.projectFilePath);
    expect(loaded.id).toBe(project.id);
    expect(loaded.entries).toEqual([]);
    expect(loaded.modPath).toBe('');
    expect(loaded.legacyModPath).toBe('');
    expect(loaded.outputDir).toBe('');
    expect(loaded.modPrompt).toBe('');
  });

  it('createProject includes new fields', async () => {
    const modDir = path.join(tmpDir, 'test_mod');
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, 'mod_info.json'),
      JSON.stringify({ id: 'test', name: 'Test Mod', version: '1.0' }),
      'utf-8',
    );

    const project = await pm.createProject(modDir);
    expect(project.legacyModPath).toBe('');
    expect(project.outputDir).toBe('');
    expect(project.modPrompt).toBe('');
  });

  it('_computeStats excludes ignored entries', () => {
    const entries = [
      { file: 'a.csv', fileType: 'csv', csvFileName: 'a.csv', status: 'translated' },
      { file: 'a.csv', fileType: 'csv', csvFileName: 'a.csv', status: 'untranslated', ignored: true },
      { file: 'b.json', fileType: 'json', status: 'polished' },
      { file: 'b.json', fileType: 'json', status: 'reviewed', ignored: true },
    ];

    const stats = pm._computeStats(entries);
    // total should be 2 (two non-ignored)
    expect(stats.total).toBe(2);
    // translated: 'translated' + 'polished' (both non-ignored)
    expect(stats.translated).toBe(2);
    // polished: only 'polished' (non-ignored)
    expect(stats.polished).toBe(1);
    // byFile
    expect(stats.byFile['a.csv'].total).toBe(1);
    expect(stats.byFile['b.json'].total).toBe(1);
  });
});
