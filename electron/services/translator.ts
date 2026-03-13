/**
 * AI Translation Service
 *
 * Supports OpenAI-compatible APIs (OpenAI, DeepSeek, local LLMs, etc.)
 * for translating and polishing Starsector mod text.
 */

import type { TranslationConfig, TranslateEntryInput, TranslateEntryOutput, PolishEntryInput } from '../../types/translator';
import type { GlossaryEntry, KeywordEntry } from '../../types/project';

const LOG_SYSTEM_PROMPT_LEN = 80;
const LOG_USER_MSG_LEN = 200;
const LOG_RESPONSE_LEN = 300;
const MAX_REQUEST_HISTORY = 200;

let _requestIdCounter = 0;

interface TextSample {
  text: string;
  context?: string;
}

interface Keyword {
  source: string;
  target: string;
  category: string;
}

interface KeywordExtractInput {
  source: string;
  category: string;
}

interface TranslationResult {
  id: string;
  translated: string;
  status: 'translated' | 'polished' | 'error';
  error?: string;
}

interface RequestRecord {
  id: number;
  type: string;
  status: 'pending' | 'success' | 'error';
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  model: string;
  apiUrl: string;
  systemPrompt: string;
  userMessage: string;
  responseContent: string | null;
  responseRaw: string | null;
  tokenUsage: any | null;
  error: string | null;
}

interface RequestHistoryItem {
  id: number;
  type: string;
  status: 'pending' | 'success' | 'error';
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  model: string;
  error: string | null;
  promptPreview: string;
  responsePreview: string;
  tokenUsage: any | null;
}

interface ActiveRequestItem {
  id: number;
  type: string;
  status: 'pending' | 'success' | 'error';
  startTime: string;
  model: string;
  promptPreview: string;
}

class TranslationService {
  private _defaultSystemPrompt: string;
  private _defaultPolishPrompt: string;
  private config: TranslationConfig;
  private _requestHistory: RequestRecord[];
  private _activeRequests: Map<number, RequestRecord>;

  constructor() {
    this._defaultSystemPrompt = this.getDefaultSystemPrompt();
    this._defaultPolishPrompt = this.getDefaultPolishPrompt();
    this.config = {
      provider: 'openai',
      apiKey: '',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.3,
      batchSize: 5,
      concurrentRequests: 1,
      rateLimitMs: 500,
      systemPrompt: this._defaultSystemPrompt,
      polishPrompt: this._defaultPolishPrompt,
    };
    this._requestHistory = [];
    this._activeRequests = new Map();
  }

  getDefaultSystemPrompt(): string {
    return `你是一位专业的游戏本地化翻译专家，正在将太空策略游戏"远行星号"(Starsector)的MOD内容从英文翻译为简体中文。

翻译要求：
1. 保持游戏文本的风格和语气，使用符合太空科幻设定的措辞
2. 严格遵循提供的名词对照表/术语库进行翻译
3. 保留所有变量占位符（如 $player.name、%s、%d 等），不要翻译它们
4. 保留所有HTML标签和格式代码
5. 对于专有名词（人名、地名、组织名等），如果名词库中没有对应翻译，保留原文并在括号中给出参考译名
6. 翻译应当自然流畅，符合中文表达习惯
7. 武器、舰船描述应保持技术感和军事风格
8. 不要翻译人名、星系名、星球名，保留英文原文
9. 如果遇到单独占一行的"OR"，不要翻译，保留原文`;
  }

  getDefaultPolishPrompt(): string {
    return `你是一位专业的游戏本地化润色专家。请对以下已翻译的游戏文本进行润色优化。

润色要求：
1. 改善中文表达的流畅度和自然度
2. 确保术语使用一致（参照提供的名词库）
3. 保持原文的语气和风格
4. 保留所有变量占位符和格式代码不变
5. 修正任何翻译不当或生硬的表达
6. 确保太空科幻的氛围感`;
  }

  configure(config: Partial<TranslationConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.provider === 'deepseek' && !config.apiUrl) {
      this.config.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
      this.config.model = config.model || 'deepseek-chat';
    } else if (config.provider === 'openai' && !config.apiUrl) {
      this.config.apiUrl = 'https://api.openai.com/v1/chat/completions';
    }
  }

  getConfig(): TranslationConfig {
    return {
      ...this.config,
      apiKey: '',
    };
  }

  getDefaultPrompts(): { systemPrompt: string; polishPrompt: string; keywordPrompt: string } {
    return {
      systemPrompt: this.getDefaultSystemPrompt(),
      polishPrompt: this.getDefaultPolishPrompt(),
      keywordPrompt: this.getDefaultKeywordPrompt(),
    };
  }

  getDefaultKeywordPrompt(): string {
    return `你是一位专业的游戏本地化术语提取专家，擅长从游戏文本中识别和提取关键术语。你正在处理太空策略游戏"远行星号"(Starsector)的MOD文本。

请从提供的游戏文本中提取所有专有名词和关键术语，包括但不限于：
- 势力/组织名称
- 舰船名称和型号
- 武器名称
- 游戏系统/机制名称
- 物品/资源名称
- 人名（角色名、NPC名）
- 星球/星系名（星球名、星系名、空间站名）
- 其他需要统一翻译的专有名词

提取要求：
1. 只提取英文专有名词，不要提取普通词汇
2. 对每个提取的关键词进行分类
3. 只需提取原文和分类，不要提供任何翻译
4. 忽略变量占位符（如 $player.name、%s 等）和HTML标签
5. 同一个词只需出现一次
6. 不要遗漏人名和星球/星系名，它们需要单独标注分类以便后续处理

请严格按照以下JSON数组格式返回结果，不要添加任何其他说明文字：
[{"source":"Hegemony","category":"势力名称"},{"source":"Galatia","category":"星球/星系名"}]

分类可选值：势力名称、舰船名称、武器名称、人名、星球/星系名、游戏术语、物品名称、其他`;
  }

  async extractKeywords(
    textSamples: TextSample[],
    config: Partial<TranslationConfig> = {},
    onBatchProgress: ((keywords: Keyword[]) => void) | null = null
  ): Promise<Keyword[]> {
    const cfg = { ...this.config, ...config };
    const allKeywords: Keyword[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < textSamples.length; i += cfg.batchSize) {
      const batch = textSamples.slice(i, i + cfg.batchSize);
      try {
        const keywords = await this._extractKeywordsBatch(batch, cfg);
        const newKeywords: Keyword[] = [];
        for (const kw of keywords) {
          const key = kw.source.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            allKeywords.push(kw);
            newKeywords.push(kw);
          }
        }
        if (onBatchProgress && newKeywords.length > 0) {
          onBatchProgress(newKeywords);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('AI keyword extraction batch error:', message);
      }

      if (i + cfg.batchSize < textSamples.length) {
        await sleep(cfg.rateLimitMs);
      }
    }

    return allKeywords;
  }

  private async _extractKeywordsBatch(textSamples: TextSample[], cfg: TranslationConfig): Promise<Keyword[]> {
    const textsFormatted = textSamples.map((s, i) =>
      `[${i + 1}] (${s.context || ''})\n${s.text}`
    ).join('\n\n---\n\n');

    const userMessage = `请从以下${textSamples.length}段游戏文本中提取所有专有名词和关键术语：

${textsFormatted}`;

    const systemPrompt = cfg.keywordPrompt || this.getDefaultKeywordPrompt();
    const response = await this._callAPI(systemPrompt, userMessage, cfg, 'keyword-extract');
    return this._parseKeywordResponse(response);
  }

  private _parseKeywordResponse(text: string): Keyword[] {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item: any) => item.source && typeof item.source === 'string')
            .map((item: any) => ({
              source: item.source.trim(),
              target: '',
              category: item.category || '其他',
            }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to parse AI keyword response as JSON:', message);
    }

    const keywords: Keyword[] = [];
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const matchWithTarget = line.match(/"([^"]+)"\s*[→>-]+\s*"([^"]*)"(?:\s*[（(]([^)）]+)[)）])?/);
      if (matchWithTarget) {
        keywords.push({
          source: matchWithTarget[1].trim(),
          target: '',
          category: matchWithTarget[3] || '其他',
        });
        continue;
      }
      const matchNoTarget = line.match(/"([^"]+)"(?:\s*[（(]([^)）]+)[)）])?/);
      if (matchNoTarget) {
        keywords.push({
          source: matchNoTarget[1].trim(),
          target: '',
          category: matchNoTarget[2] || '其他',
        });
      }
    }
    return keywords;
  }

  async translateKeywords(
    keywords: KeywordExtractInput[],
    glossary: GlossaryEntry[] = [],
    config: Partial<TranslationConfig> = {},
    onLog: ((level: string, message: string) => void) | null = null
  ): Promise<Array<{ source: string; target: string }>> {
    const cfg = { ...this.config, ...config };
    const results: Array<{ source: string; target: string }> = [];

    const NO_TRANSLATE_CATEGORIES = new Set(['人名', '星球/星系名']);
    const toTranslate: KeywordExtractInput[] = [];
    for (const kw of keywords) {
      if (NO_TRANSLATE_CATEGORIES.has(kw.category)) {
        results.push({ source: kw.source, target: kw.source });
      } else {
        toTranslate.push(kw);
      }
    }

    if (onLog && keywords.length !== toTranslate.length) {
      onLog('info', `跳过 ${keywords.length - toTranslate.length} 个人名/星球名（保留原文）`);
    }

    const batches: KeywordExtractInput[][] = [];
    for (let i = 0; i < toTranslate.length; i += cfg.batchSize) {
      batches.push(toTranslate.slice(i, i + cfg.batchSize));
    }

    const batchResults = await this._runConcurrentBatches(batches, cfg, async (batch, batchNum) => {
      if (onLog) {
        onLog('info', `翻译批次 ${batchNum}/${batches.length}：${batch.map(kw => kw.source).join(', ')}`);
      }
      try {
        const batchRes = await this._translateKeywordsBatch(batch, glossary, cfg, onLog);
        if (onLog) {
          for (const r of batchRes) {
            if (r.target) {
              onLog('info', `  "${r.source}" → "${r.target}"`);
            }
          }
        }
        return batchRes;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Keyword translation batch error:', message);
        if (onLog) {
          onLog('error', `批次 ${batchNum} 翻译失败: ${message}`);
        }
        return batch.map(kw => ({ source: kw.source, target: '' }));
      }
    });

    for (const br of batchResults) {
      results.push(...br);
    }

    return results;
  }

  async polishKeywords(
    keywords: Keyword[],
    glossary: GlossaryEntry[] = [],
    config: Partial<TranslationConfig> = {},
    onLog: ((level: string, message: string) => void) | null = null
  ): Promise<Array<{ source: string; target: string }>> {
    const cfg = { ...this.config, ...config };
    const results: Array<{ source: string; target: string }> = [];

    const toPolish = keywords.filter(kw => kw.target && kw.target.trim());
    const noTarget = keywords.filter(kw => !kw.target || !kw.target.trim());

    results.push(...noTarget.map(kw => ({ source: kw.source, target: kw.target || '' })));

    if (toPolish.length === 0) {
      if (onLog) onLog('info', '没有已翻译的术语需要润色');
      return results;
    }

    const batches: Keyword[][] = [];
    for (let i = 0; i < toPolish.length; i += cfg.batchSize) {
      batches.push(toPolish.slice(i, i + cfg.batchSize));
    }

    const batchResults = await this._runConcurrentBatches(batches, cfg, async (batch, batchNum) => {
      if (onLog) {
        onLog('info', `润色批次 ${batchNum}/${batches.length}：${batch.map(kw => `${kw.source}→${kw.target}`).join(', ')}`);
      }
      try {
        const batchRes = await this._polishKeywordsBatch(batch, glossary, cfg, onLog);
        if (onLog) {
          for (let j = 0; j < batchRes.length; j++) {
            const orig = batch[j];
            const polished = batchRes[j];
            if (polished.target !== orig.target) {
              onLog('info', `  "${orig.source}": "${orig.target}" → "${polished.target}"`);
            }
          }
        }
        return batchRes;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Keyword polish batch error:', message);
        if (onLog) {
          onLog('error', `批次 ${batchNum} 润色失败: ${message}`);
        }
        return batch.map(kw => ({ source: kw.source, target: kw.target }));
      }
    });

    for (const br of batchResults) {
      results.push(...br);
    }

    return results;
  }

  private async _polishKeywordsBatch(
    keywords: Keyword[],
    glossary: GlossaryEntry[],
    cfg: TranslationConfig,
    onLog: ((level: string, message: string) => void) | null = null
  ): Promise<Array<{ source: string; target: string }>> {
    const glossaryText = glossary && glossary.length > 0
      ? this._buildGlossaryPrompt(glossary) + '\n\n'
      : '';

    const keywordsText = keywords.map(kw =>
      `- "${kw.source}" → "${kw.target}"${kw.category ? ` (${kw.category})` : ''}`
    ).join('\n');

    const userMessage = `${glossaryText}请对以下${keywords.length}个游戏术语的翻译进行润色和一致性检查。

当前翻译：
${keywordsText}

润色要求：
- 确保同类术语的翻译风格和措辞保持一致
- 改善翻译的准确性和流畅度
- 确保符合太空科幻游戏的术语风格
- 如果名词对照表中有对应翻译，请确保一致
- 人名和星球/星系名保留英文原文不翻译

直接返回JSON数组格式，不要添加任何说明文字：
[{"source":"Hegemony","target":"霸主"}]`;

    const systemPrompt = `你是一位专业的游戏本地化润色专家。请对已翻译的太空策略游戏"远行星号"(Starsector)MOD术语进行润色优化，确保术语之间的翻译风格和用词保持一致。`;

    if (onLog) {
      onLog('debug', `[润色请求] system: ${systemPrompt.substring(0, LOG_SYSTEM_PROMPT_LEN)}...`);
      onLog('debug', `[润色请求] user: ${userMessage.substring(0, LOG_USER_MSG_LEN)}...`);
    }

    const response = await this._callAPI(systemPrompt, userMessage, cfg, 'keyword-polish');

    if (onLog) {
      onLog('debug', `[润色响应] ${response.substring(0, LOG_RESPONSE_LEN)}...`);
    }

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          const polishMap = new Map<string, string>();
          for (const item of parsed as any[]) {
            if (item.source && item.target) {
              polishMap.set(item.source.trim().toLowerCase(), item.target.trim());
            }
          }
          return keywords.map(kw => ({
            source: kw.source,
            target: polishMap.get(kw.source.toLowerCase()) || kw.target,
          }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to parse keyword polish response:', message);
    }

    return keywords.map(kw => ({ source: kw.source, target: kw.target }));
  }

  private async _translateKeywordsBatch(
    keywords: KeywordExtractInput[],
    glossary: GlossaryEntry[],
    cfg: TranslationConfig,
    onLog: ((level: string, message: string) => void) | null = null
  ): Promise<Array<{ source: string; target: string }>> {
    const glossaryText = glossary && glossary.length > 0
      ? this._buildGlossaryPrompt(glossary) + '\n\n'
      : '';

    const keywordsText = keywords.map(kw =>
      `- ${kw.source}${kw.category ? ` (${kw.category})` : ''}`
    ).join('\n');

    const userMessage = `${glossaryText}请为以下${keywords.length}个游戏术语提供简体中文翻译。
注意：
- 人名不翻译，直接保留英文原文
- 星球名、星系名不翻译，直接保留英文原文
- 如果名词对照表中已有对应翻译，请直接使用
- 其他术语请提供准确的中文翻译

直接返回JSON数组格式，不要添加任何说明文字：

${keywordsText}

请严格按照以下格式返回：
[{"source":"Hegemony","target":"霸主"}]`;

    const systemPrompt = `你是一位专业的游戏本地化翻译专家。请为提供的太空策略游戏"远行星号"(Starsector)的MOD术语提供准确的中文翻译。翻译应当符合太空科幻设定的措辞风格。人名和星球/星系名保留英文原文不翻译。`;

    if (onLog) {
      onLog('debug', `[翻译请求] system: ${systemPrompt.substring(0, LOG_SYSTEM_PROMPT_LEN)}...`);
      onLog('debug', `[翻译请求] user: ${userMessage.substring(0, LOG_USER_MSG_LEN)}...`);
    }

    const response = await this._callAPI(systemPrompt, userMessage, cfg, 'keyword-translate');

    if (onLog) {
      onLog('debug', `[翻译响应] ${response.substring(0, LOG_RESPONSE_LEN)}...`);
    }

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          const translationMap = new Map<string, string>();
          for (const item of parsed as any[]) {
            if (item.source && item.target) {
              translationMap.set(item.source.trim().toLowerCase(), item.target.trim());
            }
          }
          return keywords.map(kw => ({
            source: kw.source,
            target: translationMap.get(kw.source.toLowerCase()) || '',
          }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to parse keyword translation response:', message);
    }

    return keywords.map(kw => ({ source: kw.source, target: '' }));
  }

  async translateBatch(
    entries: TranslateEntryInput[],
    glossary: GlossaryEntry[] = [],
    config: Partial<TranslationConfig> = {},
    modPrompt: string = '',
    onProgress: ((completedCount: number, totalCount: number, batchResults: TranslationResult[]) => void) | null = null
  ): Promise<TranslationResult[]> {
    const cfg = { ...this.config, ...config };
    const results: TranslationResult[] = [];

    const batches: TranslateEntryInput[][] = [];
    for (let i = 0; i < entries.length; i += cfg.batchSize) {
      batches.push(entries.slice(i, i + cfg.batchSize));
    }

    let completedEntries = 0;
    const batchResults = await this._runConcurrentBatches(batches, cfg, async (batch) => {
      const batchResult = await this._translateBatchRequest(batch, glossary, cfg, modPrompt);
      completedEntries += batch.length;
      if (onProgress) {
        try { onProgress(completedEntries, entries.length, batchResult); } catch (_) {}
      }
      return batchResult;
    });

    for (const br of batchResults) {
      results.push(...br);
    }

    return results;
  }

  private async _translateBatchRequest(
    entries: TranslateEntryInput[],
    glossary: GlossaryEntry[],
    cfg: TranslationConfig,
    modPrompt: string
  ): Promise<TranslationResult[]> {
    const modPromptText = this._buildModPromptText(modPrompt);
    const glossaryText = this._buildGlossaryPrompt(glossary);

    const textsToTranslate = entries.map((e, i) =>
      `[${i + 1}] (${e.context || ''})\n${e.source}`
    ).join('\n\n---\n\n');

    const userMessage = `${modPromptText}${glossaryText ? glossaryText + '\n\n' : ''}请翻译以下${entries.length}段游戏文本为简体中文。请按照相同的编号格式返回翻译结果，每段翻译用 --- 分隔：

${textsToTranslate}`;

    try {
      const response = await this._callAPI(cfg.systemPrompt, userMessage, cfg, 'batch-translate');
      const translations = this._parseBatchResponse(response, entries.length);

      return entries.map((entry, i) => ({
        id: entry.id,
        translated: translations[i] || '',
        status: (translations[i] ? 'translated' : 'error') as 'translated' | 'error',
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return entries.map(entry => ({
        id: entry.id,
        translated: '',
        status: 'error' as const,
        error: message,
      }));
    }
  }

  async polish(
    entry: PolishEntryInput,
    glossary: GlossaryEntry[] = [],
    config: Partial<TranslationConfig> = {},
    modPrompt: string = ''
  ): Promise<TranslationResult> {
    const cfg = { ...this.config, ...config };
    const modPromptText = this._buildModPromptText(modPrompt);
    const glossaryText = this._buildGlossaryPrompt(glossary);

    const userMessage = `${modPromptText}${glossaryText ? glossaryText + '\n\n' : ''}原文：
${(entry as any).original || (entry as any).source}

当前翻译：
${entry.target}

请对上述翻译进行润色优化，直接返回润色后的文本，不要添加任何说明。`;

    try {
      const response = await this._callAPI(cfg.polishPrompt, userMessage, cfg, 'entry-polish');
      return {
        id: entry.id,
        translated: response.trim(),
        status: 'polished',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        id: entry.id,
        translated: entry.target,
        status: 'error',
        error: message,
      };
    }
  }

  async polishBatch(
    entries: PolishEntryInput[],
    glossary: GlossaryEntry[] = [],
    config: Partial<TranslationConfig> = {},
    modPrompt: string = '',
    onProgress: ((completedCount: number, totalCount: number, batchResults: TranslationResult[]) => void) | null = null
  ): Promise<TranslationResult[]> {
    const cfg = { ...this.config, ...config };
    const results: TranslationResult[] = [];

    const batches: PolishEntryInput[][] = [];
    for (let i = 0; i < entries.length; i += cfg.batchSize) {
      batches.push(entries.slice(i, i + cfg.batchSize));
    }

    let completedEntries = 0;
    const batchResults = await this._runConcurrentBatches(batches, cfg, async (batch) => {
      const batchResult = await this._polishBatchRequest(batch, glossary, cfg, modPrompt);
      completedEntries += batch.length;
      if (onProgress) {
        try { onProgress(completedEntries, entries.length, batchResult); } catch (_) {}
      }
      return batchResult;
    });

    for (const br of batchResults) {
      results.push(...br);
    }

    return results;
  }

  private async _polishBatchRequest(
    entries: PolishEntryInput[],
    glossary: GlossaryEntry[],
    cfg: TranslationConfig,
    modPrompt: string
  ): Promise<TranslationResult[]> {
    const modPromptText = this._buildModPromptText(modPrompt);
    const glossaryText = this._buildGlossaryPrompt(glossary);

    const textsToPolish = entries.map((e, i) =>
      `[${i + 1}] (${e.context || ''})\n原文：${(e as any).original || (e as any).source}\n当前翻译：${e.target}`
    ).join('\n\n---\n\n');

    const userMessage = `${modPromptText}${glossaryText ? glossaryText + '\n\n' : ''}请对以下${entries.length}段已翻译的游戏文本进行润色优化。请按照相同的编号格式返回润色结果，每段用 --- 分隔，只返回润色后的译文，不要添加任何说明：

${textsToPolish}`;

    try {
      const response = await this._callAPI(cfg.polishPrompt, userMessage, cfg, 'batch-polish');
      const polished = this._parseBatchResponse(response, entries.length);

      return entries.map((entry, i) => ({
        id: entry.id,
        translated: polished[i] || entry.target,
        status: (polished[i] ? 'polished' : 'error') as 'polished' | 'error',
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return entries.map(entry => ({
        id: entry.id,
        translated: entry.target,
        status: 'error' as const,
        error: message,
      }));
    }
  }

  private _buildGlossaryPrompt(glossary: GlossaryEntry[]): string {
    if (!glossary || glossary.length === 0) return '';

    let text = '【名词对照表】\n';
    for (const g of glossary) {
      text += `"${g.source}" → "${g.target}"`;
      if (g.category && g.category !== '通用') text += ` (${g.category})`;
      text += '\n';
    }
    return text;
  }

  private _buildModPromptText(modPrompt: string): string {
    if (!modPrompt || !modPrompt.trim()) return '';
    return `【MOD设定说明】\n${modPrompt.trim()}\n\n`;
  }

  private async _runConcurrentBatches<T, R>(
    batches: T[],
    cfg: TranslationConfig,
    processFn: (batch: T, batchNum: number) => Promise<R>
  ): Promise<R[]> {
    const concurrency = Math.max(1, cfg.concurrentRequests || 1);
    const results = new Array<R>(batches.length);

    if (concurrency <= 1) {
      for (let i = 0; i < batches.length; i++) {
        results[i] = await processFn(batches[i], i + 1);
        if (i + 1 < batches.length) {
          await sleep(cfg.rateLimitMs);
        }
      }
      return results;
    }

    let nextIndex = 0;
    const workers: Promise<void>[] = [];

    for (let w = 0; w < concurrency; w++) {
      workers.push((async () => {
        while (true) {
          const idx = nextIndex++;
          if (idx >= batches.length) break;
          results[idx] = await processFn(batches[idx], idx + 1);
          if (cfg.rateLimitMs > 0) {
            await sleep(cfg.rateLimitMs);
          }
        }
      })());
    }

    await Promise.all(workers);
    return results;
  }

  getRequestHistory(): RequestHistoryItem[] {
    return this._requestHistory.map(r => ({
      id: r.id,
      type: r.type,
      status: r.status,
      startTime: r.startTime,
      endTime: r.endTime,
      durationMs: r.durationMs,
      model: r.model,
      error: r.error || null,
      promptPreview: r.systemPrompt ? r.systemPrompt.substring(0, 60) + '...' : '',
      responsePreview: r.responseContent ? r.responseContent.substring(0, 80) + '...' : '',
      tokenUsage: r.tokenUsage || null,
    }));
  }

  getRequestDetail(id: number): RequestRecord | null {
    return this._requestHistory.find(r => r.id === id) ||
           this._activeRequests.get(id) || null;
  }

  getActiveRequests(): ActiveRequestItem[] {
    return Array.from(this._activeRequests.values()).map(r => ({
      id: r.id,
      type: r.type,
      status: r.status,
      startTime: r.startTime,
      model: r.model,
      promptPreview: r.systemPrompt ? r.systemPrompt.substring(0, 60) + '...' : '',
    }));
  }

  clearRequestHistory(): void {
    this._requestHistory = [];
  }

  private async _callAPI(systemPrompt: string, userMessage: string, cfg: TranslationConfig, requestType: string = 'unknown'): Promise<string> {
    const reqId = ++_requestIdCounter;
    const record: RequestRecord = {
      id: reqId,
      type: requestType,
      status: 'pending',
      startTime: new Date().toISOString(),
      endTime: null,
      durationMs: null,
      model: cfg.model,
      apiUrl: cfg.apiUrl,
      systemPrompt,
      userMessage,
      responseContent: null,
      responseRaw: null,
      tokenUsage: null,
      error: null,
    };

    this._activeRequests.set(reqId, record);
    const startMs = Date.now();

    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
    };

    try {
      const response = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`API请求失败 (${response.status}): ${errorText}`);
        record.status = 'error';
        record.error = err.message;
        record.endTime = new Date().toISOString();
        record.durationMs = Date.now() - startMs;
        record.responseRaw = errorText;
        this._activeRequests.delete(reqId);
        this._addToHistory(record);
        throw err;
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || '';

      record.status = 'success';
      record.endTime = new Date().toISOString();
      record.durationMs = Date.now() - startMs;
      record.responseContent = content;
      record.responseRaw = JSON.stringify(data);
      record.tokenUsage = data.usage || null;

      this._activeRequests.delete(reqId);
      this._addToHistory(record);

      return content;
    } catch (err) {
      if (record.status !== 'error') {
        const message = err instanceof Error ? err.message : String(err);
        record.status = 'error';
        record.error = message;
        record.endTime = new Date().toISOString();
        record.durationMs = Date.now() - startMs;
        this._activeRequests.delete(reqId);
        this._addToHistory(record);
      }
      throw err;
    }
  }

  private _addToHistory(record: RequestRecord): void {
    this._requestHistory.push(record);
    if (this._requestHistory.length > MAX_REQUEST_HISTORY) {
      this._requestHistory = this._requestHistory.slice(-MAX_REQUEST_HISTORY);
    }
  }

  private _parseBatchResponse(text: string, expectedCount: number): string[] {
    const parts = text.split(/\n---\n|\n-{3,}\n/);

    if (parts.length >= expectedCount) {
      return parts.slice(0, expectedCount).map(p => {
        return p.replace(/^\s*\[\d+\]\s*(\([^)]*\)\s*)?/m, '').trim();
      });
    }

    const numbered = text.split(/\n\s*\[\d+\]/);
    if (numbered.length > 1) {
      return numbered.slice(1, expectedCount + 1).map(p => p.trim());
    }

    if (expectedCount === 1) {
      return [text.replace(/^\s*\[\d+\]\s*(\([^)]*\)\s*)?/m, '').trim()];
    }

    return [text.trim()];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { TranslationService };

export { TranslationService };
