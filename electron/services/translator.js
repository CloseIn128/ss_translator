/**
 * AI Translation Service
 * 
 * Supports OpenAI-compatible APIs (OpenAI, DeepSeek, local LLMs, etc.)
 * for translating and polishing Starsector mod text.
 */

class TranslationService {
  constructor() {
    this._defaultSystemPrompt = this.getDefaultSystemPrompt();
    this._defaultPolishPrompt = this.getDefaultPolishPrompt();
    this.config = {
      provider: 'openai', // openai | deepseek | custom
      apiKey: '',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.3,
      batchSize: 5,
      rateLimitMs: 500,
      systemPrompt: this._defaultSystemPrompt,
      polishPrompt: this._defaultPolishPrompt,
    };
  }

  getDefaultSystemPrompt() {
    return `你是一位专业的游戏本地化翻译专家，正在将太空策略游戏"远行星号"(Starsector)的MOD内容从英文翻译为简体中文。

翻译要求：
1. 保持游戏文本的风格和语气，使用符合太空科幻设定的措辞
2. 严格遵循提供的名词对照表/术语库进行翻译
3. 保留所有变量占位符（如 $player.name、%s、%d 等），不要翻译它们
4. 保留所有HTML标签和格式代码
5. 对于专有名词（人名、地名、组织名等），如果名词库中没有对应翻译，保留原文并在括号中给出参考译名
6. 翻译应当自然流畅，符合中文表达习惯
7. 武器、舰船描述应保持技术感和军事风格`;
  }

  getDefaultPolishPrompt() {
    return `你是一位专业的游戏本地化润色专家。请对以下已翻译的游戏文本进行润色优化。

润色要求：
1. 改善中文表达的流畅度和自然度
2. 确保术语使用一致（参照提供的名词库）
3. 保持原文的语气和风格
4. 保留所有变量占位符和格式代码不变
5. 修正任何翻译不当或生硬的表达
6. 确保太空科幻的氛围感`;
  }

  configure(config) {
    this.config = { ...this.config, ...config };
    // Set API URL based on provider
    if (config.provider === 'deepseek' && !config.apiUrl) {
      this.config.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
      this.config.model = config.model || 'deepseek-chat';
    } else if (config.provider === 'openai' && !config.apiUrl) {
      this.config.apiUrl = 'https://api.openai.com/v1/chat/completions';
    }
  }

  getConfig() {
    // Return config without exposing the API key value
    return {
      ...this.config,
      apiKey: '',
    };
  }

  getDefaultPrompts() {
    return {
      systemPrompt: this.getDefaultSystemPrompt(),
      polishPrompt: this.getDefaultPolishPrompt(),
      keywordPrompt: this.getDefaultKeywordPrompt(),
    };
  }

  getDefaultKeywordPrompt() {
    return `你是一位专业的游戏本地化术语提取专家，擅长从游戏文本中识别和提取关键术语。你正在处理太空策略游戏"远行星号"(Starsector)的MOD文本。

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
3. 不需要提供翻译，只需提取原文和分类
4. 忽略变量占位符（如 $player.name、%s 等）和HTML标签
5. 同一个词只需出现一次

请严格按照以下JSON数组格式返回结果，不要添加任何其他说明文字：
[{"source":"英文原文","category":"分类"}]

分类可选值：势力名称、舰船名称、武器名称、人名/地名、游戏术语、物品名称、其他`;
  }

  /**
   * AI-powered keyword extraction from game text
   * Inspired by KeywordGacha: uses NER via LLM to identify proper nouns and key terms
   * @param {Array} textSamples - Array of { text, context } objects
   * @param {object} config - Optional config override
   * @param {Function} onBatchProgress - Optional callback(batchKeywords) called after each batch
   * @returns {Array} - Array of { source, category }
   */
  async extractKeywords(textSamples, config = {}, onBatchProgress = null) {
    const cfg = { ...this.config, ...config };
    const allKeywords = [];
    const seen = new Set();

    // Process text samples in batches
    for (let i = 0; i < textSamples.length; i += cfg.batchSize) {
      const batch = textSamples.slice(i, i + cfg.batchSize);
      try {
        const keywords = await this._extractKeywordsBatch(batch, cfg);
        const newKeywords = [];
        for (const kw of keywords) {
          const key = kw.source.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            allKeywords.push(kw);
            newKeywords.push(kw);
          }
        }
        // Report batch progress to caller
        if (onBatchProgress && newKeywords.length > 0) {
          onBatchProgress(newKeywords);
        }
      } catch (err) {
        // Continue with next batch on error
        console.error('AI keyword extraction batch error:', err.message);
      }

      // Rate limiting between batches
      if (i + cfg.batchSize < textSamples.length) {
        await sleep(cfg.rateLimitMs);
      }
    }

    return allKeywords;
  }

  async _extractKeywordsBatch(textSamples, cfg) {
    const textsFormatted = textSamples.map((s, i) =>
      `[${i + 1}] (${s.context || ''})\n${s.text}`
    ).join('\n\n---\n\n');

    const userMessage = `请从以下${textSamples.length}段游戏文本中提取所有专有名词和关键术语：

${textsFormatted}`;

    const systemPrompt = cfg.keywordPrompt || this.getDefaultKeywordPrompt();
    const response = await this._callAPI(systemPrompt, userMessage, cfg);
    return this._parseKeywordResponse(response);
  }

  _parseKeywordResponse(text) {
    try {
      // Try to extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(item => item.source && typeof item.source === 'string')
            .map(item => ({
              source: item.source.trim(),
              target: (item.target || '').trim(),
              category: item.category || '其他',
            }));
        }
      }
    } catch (err) {
      // If JSON parsing fails, try line-by-line fallback
      console.error('Failed to parse AI keyword response as JSON:', err.message);
    }

    // Fallback: try to extract keywords line by line
    const keywords = [];
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Try patterns like: "word" (category) or "word" → "translation" (category)
      const matchWithTarget = line.match(/"([^"]+)"\s*[→>-]+\s*"([^"]*)"(?:\s*[（(]([^)）]+)[)）])?/);
      if (matchWithTarget) {
        keywords.push({
          source: matchWithTarget[1].trim(),
          target: (matchWithTarget[2] || '').trim(),
          category: matchWithTarget[3] || '其他',
        });
        continue;
      }
      // Try pattern without target: "word" (category)
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

  /**
   * Translate a batch of keywords (separate from extraction)
   * @param {Array} keywords - Array of { source, category }
   * @param {object} config - Optional config override
   * @returns {Array} - Array of { source, target }
   */
  async translateKeywords(keywords, config = {}) {
    const cfg = { ...this.config, ...config };
    const results = [];

    for (let i = 0; i < keywords.length; i += cfg.batchSize) {
      const batch = keywords.slice(i, i + cfg.batchSize);
      try {
        const batchResults = await this._translateKeywordsBatch(batch, cfg);
        results.push(...batchResults);
      } catch (err) {
        console.error('Keyword translation batch error:', err.message);
        results.push(...batch.map(kw => ({ source: kw.source, target: '' })));
      }

      if (i + cfg.batchSize < keywords.length) {
        await sleep(cfg.rateLimitMs);
      }
    }

    return results;
  }

  async _translateKeywordsBatch(keywords, cfg) {
    const keywordsText = keywords.map(kw =>
      `- ${kw.source}${kw.category ? ` (${kw.category})` : ''}`
    ).join('\n');

    const userMessage = `请为以下${keywords.length}个游戏术语提供简体中文翻译。
直接返回JSON数组格式，不要添加任何说明文字：

${keywordsText}

请严格按照以下格式返回：
[{"source":"英文原文","target":"中文翻译"}]`;

    const systemPrompt = `你是一位专业的游戏本地化翻译专家。请为提供的太空策略游戏"远行星号"(Starsector)的MOD术语提供准确的中文翻译。翻译应当符合太空科幻设定的措辞风格。`;

    const response = await this._callAPI(systemPrompt, userMessage, cfg);

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          // Build a lookup map from the response
          const translationMap = new Map();
          for (const item of parsed) {
            if (item.source && item.target) {
              translationMap.set(item.source.trim().toLowerCase(), item.target.trim());
            }
          }
          // Match back to original keywords to preserve order
          return keywords.map(kw => ({
            source: kw.source,
            target: translationMap.get(kw.source.toLowerCase()) || '',
          }));
        }
      }
    } catch (err) {
      console.error('Failed to parse keyword translation response:', err.message);
    }

    return keywords.map(kw => ({ source: kw.source, target: '' }));
  }
  }

  /**
   * Translate a batch of entries
   * @param {Array} entries - Array of { id, original, context }
   * @param {Array} glossary - Glossary entries for prompt
   * @param {object} config - Optional config override
   * @returns {Array} - Array of { id, translated }
   */
  async translateBatch(entries, glossary = [], config = {}) {
    const cfg = { ...this.config, ...config };
    const results = [];

    // Process in batches
    for (let i = 0; i < entries.length; i += cfg.batchSize) {
      const batch = entries.slice(i, i + cfg.batchSize);
      const batchResults = await this._translateBatchRequest(batch, glossary, cfg);
      results.push(...batchResults);

      // Rate limiting
      if (i + cfg.batchSize < entries.length) {
        await sleep(cfg.rateLimitMs);
      }
    }

    return results;
  }

  async _translateBatchRequest(entries, glossary, cfg) {
    const glossaryText = this._buildGlossaryPrompt(glossary);

    const textsToTranslate = entries.map((e, i) =>
      `[${i + 1}] (${e.context || ''})\n${e.original}`
    ).join('\n\n---\n\n');

    const userMessage = `${glossaryText ? glossaryText + '\n\n' : ''}请翻译以下${entries.length}段游戏文本为简体中文。请按照相同的编号格式返回翻译结果，每段翻译用 --- 分隔：

${textsToTranslate}`;

    try {
      const response = await this._callAPI(cfg.systemPrompt, userMessage, cfg);
      const translations = this._parseBatchResponse(response, entries.length);

      return entries.map((entry, i) => ({
        id: entry.id,
        translated: translations[i] || '',
        status: translations[i] ? 'translated' : 'error',
      }));
    } catch (err) {
      return entries.map(entry => ({
        id: entry.id,
        translated: '',
        status: 'error',
        error: err.message,
      }));
    }
  }

  /**
   * Polish/refine an existing translation
   */
  async polish(entry, glossary = [], config = {}) {
    const cfg = { ...this.config, ...config };
    const glossaryText = this._buildGlossaryPrompt(glossary);

    const userMessage = `${glossaryText ? glossaryText + '\n\n' : ''}原文：
${entry.original}

当前翻译：
${entry.translated}

请对上述翻译进行润色优化，直接返回润色后的文本，不要添加任何说明。`;

    try {
      const response = await this._callAPI(cfg.polishPrompt, userMessage, cfg);
      return {
        id: entry.id,
        translated: response.trim(),
        status: 'polished',
      };
    } catch (err) {
      return {
        id: entry.id,
        translated: entry.translated,
        status: 'error',
        error: err.message,
      };
    }
  }

  _buildGlossaryPrompt(glossary) {
    if (!glossary || glossary.length === 0) return '';

    let text = '【名词对照表】\n';
    for (const g of glossary) {
      text += `"${g.source}" → "${g.target}"`;
      if (g.category && g.category !== '通用') text += ` (${g.category})`;
      text += '\n';
    }
    return text;
  }

  async _callAPI(systemPrompt, userMessage, cfg) {
    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
    };

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
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  _parseBatchResponse(text, expectedCount) {
    // Split response by --- separator or numbered entries
    const parts = text.split(/\n---\n|\n-{3,}\n/);

    if (parts.length >= expectedCount) {
      return parts.slice(0, expectedCount).map(p => {
        // Remove leading [n] markers
        return p.replace(/^\s*\[\d+\]\s*(\([^)]*\)\s*)?/m, '').trim();
      });
    }

    // Fallback: try to split by numbered patterns [1] [2] etc.
    const numbered = text.split(/\n\s*\[\d+\]/);
    if (numbered.length > 1) {
      return numbered.slice(1, expectedCount + 1).map(p => p.trim());
    }

    // If only one entry expected, return the whole thing
    if (expectedCount === 1) {
      return [text.replace(/^\s*\[\d+\]\s*(\([^)]*\)\s*)?/m, '').trim()];
    }

    return [text.trim()];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { TranslationService };

