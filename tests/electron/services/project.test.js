import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);

const { ProjectManager } = require('../../../electron/services/project');

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
    // keywords field may be undefined for old projects – consumers use (project.keywords || [])
    // but the save round-trip should still work
    expect(loaded.id).toBe('old-project');
  });
});
