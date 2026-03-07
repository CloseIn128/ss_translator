import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);

const { ConfigManager, DEFAULT_MODEL_CONFIG } = require('../../../electron/services/configManager');

describe('ConfigManager', () => {
  let tmpDir;
  let configDir;
  let dataDir;
  let cm;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-translator-test-'));
    configDir = path.join(tmpDir, 'config');
    dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'default_glossary.json'), '[]', 'utf-8');
    cm = new ConfigManager(configDir, dataDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('creates config directory and default files', () => {
      cm.initialize();
      expect(fs.existsSync(configDir)).toBe(true);
      expect(fs.existsSync(path.join(configDir, 'model_config.json'))).toBe(true);
      expect(fs.existsSync(path.join(configDir, 'builtin_glossary.json'))).toBe(true);
    });

    it('preserves existing config on re-init', () => {
      cm.initialize();
      cm.saveModelConfig({ apiKey: 'test-key-123' });

      const cm2 = new ConfigManager(configDir, dataDir);
      cm2.initialize();
      const config = cm2.getModelConfig();
      expect(config.apiKey).toBe('test-key-123');
    });
  });

  describe('getModelConfig / saveModelConfig', () => {
    it('returns default config initially', () => {
      cm.initialize();
      const config = cm.getModelConfig();
      expect(config.provider).toBe('openai');
      expect(config.apiKey).toBe('');
      expect(config.model).toBe('gpt-4o-mini');
    });

    it('saves and loads config', () => {
      cm.initialize();
      cm.saveModelConfig({ apiKey: 'sk-test', model: 'gpt-4' });
      const config = cm.getModelConfig();
      expect(config.apiKey).toBe('sk-test');
      expect(config.model).toBe('gpt-4');
    });

    it('preserves existing apiKey when saving with blank key', () => {
      cm.initialize();
      cm.saveModelConfig({ apiKey: 'sk-secret' });
      cm.saveModelConfig({ apiKey: '', model: 'gpt-4' });
      const config = cm.getModelConfig();
      expect(config.apiKey).toBe('sk-secret');
      expect(config.model).toBe('gpt-4');
    });

    it('merges with defaults for missing fields', () => {
      cm.initialize();
      cm.saveModelConfig({ apiKey: 'key' });
      const config = cm.getModelConfig();
      expect(config.maxTokens).toBe(DEFAULT_MODEL_CONFIG.maxTokens);
      expect(config.temperature).toBe(DEFAULT_MODEL_CONFIG.temperature);
    });
  });

  describe('resetModelConfig', () => {
    it('resets to defaults', () => {
      cm.initialize();
      cm.saveModelConfig({ apiKey: 'key', model: 'custom-model' });
      const defaults = cm.resetModelConfig();
      expect(defaults.apiKey).toBe('');
      expect(defaults.model).toBe('gpt-4o-mini');

      const loaded = cm.getModelConfig();
      expect(loaded.apiKey).toBe('');
    });
  });

  describe('builtin glossary', () => {
    it('returns default glossary initially', () => {
      cm.initialize();
      const glossary = cm.getBuiltinGlossary();
      expect(Array.isArray(glossary)).toBe(true);
    });

    it('saves and loads glossary', () => {
      cm.initialize();
      const entries = [{ source: 'Hegemony', target: '霸主', category: '势力' }];
      cm.saveBuiltinGlossary(entries);
      const loaded = cm.getBuiltinGlossary();
      expect(loaded).toEqual(entries);
    });

    it('resets glossary to defaults', () => {
      cm.initialize();
      cm.saveBuiltinGlossary([{ source: 'test', target: '测试' }]);
      cm.resetBuiltinGlossary();
      const loaded = cm.getBuiltinGlossary();
      expect(loaded).toEqual([]);
    });
  });

  describe('_ensureModelConfigComplete', () => {
    it('fills missing prompt fields with defaults', () => {
      cm.initialize();
      const config = cm.getModelConfig();
      delete config.keywordPrompt;
      fs.writeFileSync(
        path.join(configDir, 'model_config.json'),
        JSON.stringify(config, null, 2),
        'utf-8',
      );

      const cm2 = new ConfigManager(configDir, dataDir);
      cm2.initialize();
      const loaded = cm2.getModelConfig();
      expect(loaded.keywordPrompt).toBe(DEFAULT_MODEL_CONFIG.keywordPrompt);
    });
  });
});
