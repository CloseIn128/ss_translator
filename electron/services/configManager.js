/**
 * Config Manager
 *
 * Manages persistent configuration stored in a `config/` directory
 * next to the application executable (or app root in development).
 *
 * Managed files:
 *   config/model_config.json  - AI model settings
 *   config/builtin_glossary.json - User-editable public/built-in glossary
 */

const fs = require('fs');
const path = require('path');

// Default AI model configuration
const DEFAULT_MODEL_CONFIG = {
  provider: 'openai',
  apiKey: '',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  maxTokens: 2048,
  temperature: 0.3,
  batchSize: 5,
  rateLimitMs: 500,
};

class ConfigManager {
  /**
   * @param {string} configDir - Directory where config files are stored
   * @param {string} dataDir   - Read-only directory with bundled defaults
   */
  constructor(configDir, dataDir) {
    this.configDir = configDir;
    this.dataDir = dataDir;
    this.modelConfigPath = path.join(configDir, 'model_config.json');
    this.builtinGlossaryPath = path.join(configDir, 'builtin_glossary.json');
    this.defaultGlossaryPath = path.join(dataDir, 'default_glossary.json');
  }

  /**
   * Initialize config directory on first run.
   * Creates missing files with defaults; never overwrites existing user files.
   */
  initialize() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    if (!fs.existsSync(this.modelConfigPath)) {
      this._writeJson(this.modelConfigPath, DEFAULT_MODEL_CONFIG);
    }

    if (!fs.existsSync(this.builtinGlossaryPath)) {
      const defaults = this._readDefaultGlossary();
      this._writeJson(this.builtinGlossaryPath, defaults);
    }
  }

  // ─── Model Config ─────────────────────────────────────────────────

  getModelConfig() {
    try {
      const data = JSON.parse(fs.readFileSync(this.modelConfigPath, 'utf-8'));
      return { ...DEFAULT_MODEL_CONFIG, ...data };
    } catch {
      return { ...DEFAULT_MODEL_CONFIG };
    }
  }

  saveModelConfig(config) {
    // Save all fields; if apiKey is blank (user didn't re-enter it), keep existing
    const existing = this.getModelConfig();
    const toSave = { ...existing, ...config };
    if (!config.apiKey) {
      // Blank submission = don't overwrite stored key
      toSave.apiKey = existing.apiKey;
    }
    this._writeJson(this.modelConfigPath, toSave);
  }

  resetModelConfig() {
    this._writeJson(this.modelConfigPath, DEFAULT_MODEL_CONFIG);
    return { ...DEFAULT_MODEL_CONFIG };
  }

  // ─── Built-in / Public Glossary ───────────────────────────────────

  getBuiltinGlossary() {
    try {
      return JSON.parse(fs.readFileSync(this.builtinGlossaryPath, 'utf-8'));
    } catch {
      return this._readDefaultGlossary();
    }
  }

  saveBuiltinGlossary(entries) {
    this._writeJson(this.builtinGlossaryPath, entries);
    return { success: true };
  }

  resetBuiltinGlossary() {
    const defaults = this._readDefaultGlossary();
    this._writeJson(this.builtinGlossaryPath, defaults);
    return defaults;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  _readDefaultGlossary() {
    try {
      return JSON.parse(fs.readFileSync(this.defaultGlossaryPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  _writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

module.exports = { ConfigManager, DEFAULT_MODEL_CONFIG };
