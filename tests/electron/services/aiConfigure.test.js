import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigManager } from '../../../electron/services/configManager';
import { TranslationService } from '../../../electron/services/translator';

/**
 * Tests for the AI configure flow to verify the bug fix:
 * When saving settings without re-entering API key, the existing key
 * must be preserved both in-memory (TranslationService) and on disk.
 */
describe('AI configure – API key preservation', () => {
  let tmpDir;
  let configManager;
  let translationService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-translator-test-'));
    const configDir = path.join(tmpDir, 'config');
    const dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'default_glossary.json'), '[]', 'utf-8');

    configManager = new ConfigManager(configDir, dataDir);
    configManager.initialize();

    translationService = new TranslationService();
    const savedConfig = configManager.getModelConfig();
    translationService.configure(savedConfig);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Simulates the ai:configure IPC handler logic (from aiHandlers.js)
   */
  function simulateAiConfigure(config) {
    if (!config.apiKey) {
      const saved = configManager.getModelConfig();
      config = { ...config, apiKey: saved.apiKey };
    }
    translationService.configure(config);
    configManager.saveModelConfig(config);
    return { success: true };
  }

  it('preserves API key when saving with empty key', () => {
    simulateAiConfigure({ apiKey: 'sk-secret-key', model: 'gpt-4' });
    expect(translationService.config.apiKey).toBe('sk-secret-key');
    expect(configManager.getModelConfig().apiKey).toBe('sk-secret-key');

    simulateAiConfigure({ apiKey: '', model: 'gpt-4o-mini', temperature: 0.5 });

    expect(translationService.config.apiKey).toBe('sk-secret-key');
    expect(configManager.getModelConfig().apiKey).toBe('sk-secret-key');
    expect(translationService.config.model).toBe('gpt-4o-mini');
    expect(translationService.config.temperature).toBe(0.5);
  });

  it('preserves API key after simulated app restart', () => {
    simulateAiConfigure({ apiKey: 'sk-persist-test' });

    const translationService2 = new TranslationService();
    const savedConfig = configManager.getModelConfig();
    translationService2.configure(savedConfig);

    expect(translationService2.config.apiKey).toBe('sk-persist-test');
  });

  it('allows overwriting the API key with a new one', () => {
    simulateAiConfigure({ apiKey: 'sk-old-key' });
    simulateAiConfigure({ apiKey: 'sk-new-key' });

    expect(translationService.config.apiKey).toBe('sk-new-key');
    expect(configManager.getModelConfig().apiKey).toBe('sk-new-key');
  });
});
