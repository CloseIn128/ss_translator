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

  describe('translateKeywords', () => {
    it('skips person and planet categories', async () => {
      // Mock the _callAPI to avoid real API calls
      ts._callAPI = vi.fn().mockResolvedValue('[{"source":"Hegemony","target":"霸主"}]');

      const keywords = [
        { source: 'Hegemony', category: '势力名称' },
        { source: 'Alexander', category: '人名' },
        { source: 'Corvus', category: '星球/星系名' },
      ];
      const results = await ts.translateKeywords(keywords);
      expect(results).toHaveLength(3);
      // Person names and planet names should keep their source as target
      const alexander = results.find(r => r.source === 'Alexander');
      expect(alexander.target).toBe('Alexander');
      const corvus = results.find(r => r.source === 'Corvus');
      expect(corvus.target).toBe('Corvus');
    });

    it('passes log callback for each batch', async () => {
      ts._callAPI = vi.fn().mockResolvedValue('[{"source":"Test","target":"测试"}]');

      const logs = [];
      const onLog = (level, message) => logs.push({ level, message });

      const keywords = [{ source: 'Test', category: '通用' }];
      await ts.translateKeywords(keywords, [], {}, onLog);

      const infoLogs = logs.filter(l => l.level === 'info');
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(infoLogs.some(l => l.message.includes('Test'))).toBe(true);
    });
  });

  describe('polishKeywords', () => {
    it('passes through untranslated keywords unchanged', async () => {
      ts._callAPI = vi.fn().mockResolvedValue('[]');

      const keywords = [
        { source: 'Hegemony', target: '霸主', category: '势力名称' },
        { source: 'Unknown', target: '', category: '通用' },
      ];
      const results = await ts.polishKeywords(keywords);
      expect(results).toHaveLength(2);
      const unknown = results.find(r => r.source === 'Unknown');
      expect(unknown.target).toBe('');
    });

    it('polishes translated keywords', async () => {
      ts._callAPI = vi.fn().mockResolvedValue('[{"source":"Hegemony","target":"霸权"}]');

      const keywords = [
        { source: 'Hegemony', target: '霸主', category: '势力名称' },
      ];
      const results = await ts.polishKeywords(keywords);
      const hegemony = results.find(r => r.source === 'Hegemony');
      expect(hegemony.target).toBe('霸权');
    });

    it('keeps original translation if polish fails to parse', async () => {
      ts._callAPI = vi.fn().mockResolvedValue('invalid response');

      const keywords = [
        { source: 'Hegemony', target: '霸主', category: '势力名称' },
      ];
      const results = await ts.polishKeywords(keywords);
      const hegemony = results.find(r => r.source === 'Hegemony');
      expect(hegemony.target).toBe('霸主');
    });

    it('passes log callback for polish batches', async () => {
      ts._callAPI = vi.fn().mockResolvedValue('[{"source":"Hegemony","target":"霸权"}]');

      const logs = [];
      const onLog = (level, message) => logs.push({ level, message });

      const keywords = [
        { source: 'Hegemony', target: '霸主', category: '势力名称' },
      ];
      await ts.polishKeywords(keywords, [], {}, onLog);

      const infoLogs = logs.filter(l => l.level === 'info');
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(infoLogs.some(l => l.message.includes('润色'))).toBe(true);
    });
  });

  describe('request history tracking', () => {
    it('starts with empty history and no active requests', () => {
      expect(ts.getRequestHistory()).toEqual([]);
      expect(ts.getActiveRequests()).toEqual([]);
    });

    it('records successful API calls in history', async () => {
      // Mock _callAPI to bypass actual fetch but still use the history mechanism
      const originalCallAPI = ts._callAPI.bind(ts);
      // We need to mock fetch instead since _callAPI uses fetch internally
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      ts.configure({ apiKey: 'test-key' });
      const result = await ts._callAPI('system', 'user msg', ts.config, 'batch-translate');
      expect(result).toBe('test response');

      const history = ts.getRequestHistory();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe('batch-translate');
      expect(history[0].status).toBe('success');
      expect(history[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(history[0].tokenUsage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });

      delete global.fetch;
    });

    it('records failed API calls in history', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      ts.configure({ apiKey: 'test-key' });
      await expect(ts._callAPI('system', 'user', ts.config, 'keyword-translate'))
        .rejects.toThrow('API请求失败');

      const history = ts.getRequestHistory();
      expect(history.length).toBe(1);
      expect(history[0].status).toBe('error');
      expect(history[0].type).toBe('keyword-translate');
      expect(history[0].error).toContain('400');

      delete global.fetch;
    });

    it('getRequestDetail returns full record', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'detail test' } }],
        }),
      });

      ts.configure({ apiKey: 'test-key' });
      await ts._callAPI('sys prompt', 'user message', ts.config, 'entry-polish');

      const history = ts.getRequestHistory();
      const detail = ts.getRequestDetail(history[0].id);
      expect(detail).not.toBeNull();
      expect(detail.systemPrompt).toBe('sys prompt');
      expect(detail.userMessage).toBe('user message');
      expect(detail.responseContent).toBe('detail test');
      expect(detail.type).toBe('entry-polish');

      delete global.fetch;
    });

    it('clearRequestHistory empties history', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
        }),
      });

      ts.configure({ apiKey: 'test-key' });
      await ts._callAPI('sys', 'user', ts.config, 'batch-translate');
      expect(ts.getRequestHistory().length).toBe(1);

      ts.clearRequestHistory();
      expect(ts.getRequestHistory()).toEqual([]);

      delete global.fetch;
    });

    it('getRequestDetail returns null for unknown id', () => {
      expect(ts.getRequestDetail(99999)).toBeNull();
    });
  });
});
