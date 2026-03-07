import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { TranslationService } = require('../../../electron/services/translator');

describe('TranslationService', () => {
  let ts;

  beforeEach(() => {
    ts = new TranslationService();
  });

  describe('constructor', () => {
    it('initializes with default config', () => {
      expect(ts.config.provider).toBe('openai');
      expect(ts.config.apiKey).toBe('');
      expect(ts.config.model).toBe('gpt-4o-mini');
    });
  });

  describe('configure', () => {
    it('merges config with existing', () => {
      ts.configure({ apiKey: 'sk-test', model: 'gpt-4' });
      expect(ts.config.apiKey).toBe('sk-test');
      expect(ts.config.model).toBe('gpt-4');
      expect(ts.config.maxTokens).toBe(4096);
    });

    it('sets deepseek URL when provider is deepseek and no URL given', () => {
      ts.configure({ provider: 'deepseek' });
      expect(ts.config.apiUrl).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(ts.config.model).toBe('deepseek-chat');
    });

    it('does not override custom URL for deepseek', () => {
      ts.configure({ provider: 'deepseek', apiUrl: 'https://custom.api/v1' });
      expect(ts.config.apiUrl).toBe('https://custom.api/v1');
    });

    it('sets openai URL when provider is openai and no URL given', () => {
      ts.configure({ apiUrl: 'https://other.api/v1', provider: 'custom' });
      ts.configure({ provider: 'openai', apiUrl: '' });
      expect(ts.config.apiUrl).toBe('https://api.openai.com/v1/chat/completions');
    });
  });

  describe('getConfig', () => {
    it('returns config without exposing apiKey', () => {
      ts.configure({ apiKey: 'sk-secret-key' });
      const config = ts.getConfig();
      expect(config.apiKey).toBe('');
      expect(config.model).toBe(ts.config.model);
    });
  });

  describe('getDefaultPrompts', () => {
    it('returns all three default prompts', () => {
      const prompts = ts.getDefaultPrompts();
      expect(prompts.systemPrompt).toBeDefined();
      expect(prompts.polishPrompt).toBeDefined();
      expect(prompts.keywordPrompt).toBeDefined();
      expect(prompts.systemPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('_buildGlossaryPrompt', () => {
    it('returns empty string for empty glossary', () => {
      expect(ts._buildGlossaryPrompt([])).toBe('');
      expect(ts._buildGlossaryPrompt(null)).toBe('');
    });

    it('formats glossary entries correctly', () => {
      const glossary = [
        { source: 'Hegemony', target: '霸主', category: '势力名称' },
        { source: 'Onslaught', target: '猛攻', category: '通用' },
      ];
      const text = ts._buildGlossaryPrompt(glossary);
      expect(text).toContain('【名词对照表】');
      expect(text).toContain('"Hegemony" → "霸主" (势力名称)');
      expect(text).toContain('"Onslaught" → "猛攻"');
      expect(text).not.toContain('(通用)');
    });
  });

  describe('_parseBatchResponse', () => {
    it('splits by --- separator', () => {
      const response = '翻译一\n---\n翻译二\n---\n翻译三';
      const result = ts._parseBatchResponse(response, 3);
      expect(result).toEqual(['翻译一', '翻译二', '翻译三']);
    });

    it('removes [n] markers from translations', () => {
      const response = '[1] 翻译一\n---\n[2] 翻译二';
      const result = ts._parseBatchResponse(response, 2);
      expect(result).toEqual(['翻译一', '翻译二']);
    });

    it('returns whole text for single expected entry', () => {
      const result = ts._parseBatchResponse('翻译文本', 1);
      expect(result).toEqual(['翻译文本']);
    });

    it('falls back to numbered splitting', () => {
      const response = '前言\n[1] 翻译一\n[2] 翻译二';
      const result = ts._parseBatchResponse(response, 2);
      expect(result).toEqual(['翻译一', '翻译二']);
    });
  });

  describe('_buildModPromptText', () => {
    it('returns empty string for empty or blank modPrompt', () => {
      expect(ts._buildModPromptText('')).toBe('');
      expect(ts._buildModPromptText(null)).toBe('');
      expect(ts._buildModPromptText(undefined)).toBe('');
      expect(ts._buildModPromptText('   ')).toBe('');
    });

    it('formats modPrompt with header', () => {
      const result = ts._buildModPromptText('这个MOD以银河战争为背景');
      expect(result).toContain('【MOD设定说明】');
      expect(result).toContain('这个MOD以银河战争为背景');
    });

    it('trims whitespace from modPrompt', () => {
      const result = ts._buildModPromptText('  test prompt  ');
      expect(result).toContain('test prompt');
      expect(result).not.toContain('  test prompt  ');
    });
  });

  describe('_parseKeywordResponse', () => {
    it('parses valid JSON array response', () => {
      const response = '[{"source":"Hegemony","category":"势力名称"},{"source":"Onslaught","category":"舰船名称"}]';
      const result = ts._parseKeywordResponse(response);
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe('Hegemony');
      expect(result[0].category).toBe('势力名称');
      expect(result[0].target).toBe('');
    });

    it('handles JSON embedded in text', () => {
      const response = 'Here are the keywords:\n[{"source":"Test","category":"其他"}]\nDone.';
      const result = ts._parseKeywordResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('Test');
    });

    it('filters out entries without source', () => {
      const response = '[{"source":"Valid","category":"通用"},{"category":"invalid"}]';
      const result = ts._parseKeywordResponse(response);
      expect(result).toHaveLength(1);
    });

    it('always sets target to empty string', () => {
      const response = '[{"source":"Test","target":"测试","category":"通用"}]';
      const result = ts._parseKeywordResponse(response);
      expect(result[0].target).toBe('');
    });

    it('falls back to line-by-line parsing on invalid JSON', () => {
      const response = '"Hegemony" (势力名称)\n"Onslaught" (舰船名称)';
      const result = ts._parseKeywordResponse(response);
      expect(result).toHaveLength(2);
      expect(result[0].source).toBe('Hegemony');
      expect(result[0].category).toBe('势力名称');
    });
  });
});
