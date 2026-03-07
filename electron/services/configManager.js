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

// Default AI model configuration – prompts are stored in full so the config
// file is always self-contained and directly editable by the user.
const DEFAULT_MODEL_CONFIG = {
  provider: 'openai',
  apiKey: '',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  maxTokens: 4096,
  temperature: 0.3,
  batchSize: 5,
  rateLimitMs: 500,
  systemPrompt: `你是一位专业的游戏本地化翻译专家，正在将太空策略游戏"远行星号"(Starsector)的MOD内容从英文翻译为简体中文。

翻译要求：
1. 保持游戏文本的风格和语气，使用符合太空科幻设定的措辞
2. 严格遵循提供的名词对照表/术语库进行翻译
3. 保留所有变量占位符（如 $player.name、%s、%d 等），不要翻译它们
4. 保留所有HTML标签和格式代码
5. 对于专有名词（人名、地名、组织名等），如果名词库中没有对应翻译，保留原文并在括号中给出参考译名
6. 翻译应当自然流畅，符合中文表达习惯
7. 武器、舰船描述应保持技术感和军事风格`,
  polishPrompt: `你是一位专业的游戏本地化润色专家。请对以下已翻译的游戏文本进行润色优化。

润色要求：
1. 改善中文表达的流畅度和自然度
2. 确保术语使用一致（参照提供的名词库）
3. 保持原文的语气和风格
4. 保留所有变量占位符和格式代码不变
5. 修正任何翻译不当或生硬的表达
6. 确保太空科幻的氛围感`,
  keywordPrompt: `你是一位专业的游戏本地化术语提取专家，擅长从游戏文本中识别和提取关键术语。你正在处理太空策略游戏"远行星号"(Starsector)的MOD文本。

请从提供的游戏文本中提取所有专有名词和关键术语，包括但不限于：
- 人名（角色名、NPC名）
- 地名（星系名、星球名、空间站名）
- 势力/组织名称
- 舰船名称和型号
- 武器名称
- 游戏系统/机制名称
- 物品/资源名称
- 其他需要统一翻译的专有名词

提取要求：
1. 只提取英文专有名词，不要提取普通词汇
2. 对每个提取的关键词进行分类
3. 如果能推断出合适的中文翻译，请提供参考译文
4. 忽略变量占位符（如 $player.name、%s 等）和HTML标签
5. 同一个词只需出现一次

请严格按照以下JSON数组格式返回结果，不要添加任何其他说明文字：
[{"source":"英文原文","target":"参考译文","category":"分类"}]

分类可选值：势力名称、舰船名称、武器名称、人名/地名、游戏术语、物品名称、其他`,
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
   * Creates missing files with defaults; for existing files, ensures all
   * expected fields are present (migration for newly added config keys).
   */
  initialize() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    if (!fs.existsSync(this.modelConfigPath)) {
      this._writeJson(this.modelConfigPath, DEFAULT_MODEL_CONFIG);
    } else {
      this._ensureModelConfigComplete();
    }

    if (!fs.existsSync(this.builtinGlossaryPath)) {
      const defaults = this._readDefaultGlossary();
      this._writeJson(this.builtinGlossaryPath, defaults);
    }
  }

  /**
   * Merge missing or empty fields from DEFAULT_MODEL_CONFIG into the
   * persisted config file.  This keeps the on-disk file complete even
   * after the application adds new config keys in an update.
   */
  _ensureModelConfigComplete() {
    try {
      const data = JSON.parse(fs.readFileSync(this.modelConfigPath, 'utf-8'));
      const merged = { ...DEFAULT_MODEL_CONFIG, ...data };
      // Fill empty prompt fields with defaults so the file always has actual content
      for (const key of Object.keys(DEFAULT_MODEL_CONFIG)) {
        if (key.endsWith('Prompt') && !merged[key]) {
          merged[key] = DEFAULT_MODEL_CONFIG[key];
        }
      }
      this._writeJson(this.modelConfigPath, merged);
    } catch (err) {
      console.error('Failed to migrate model config, resetting to defaults:', err.message);
      this._writeJson(this.modelConfigPath, DEFAULT_MODEL_CONFIG);
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
