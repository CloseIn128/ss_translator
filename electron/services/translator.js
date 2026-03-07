/**
 * AI Translation Service
 * 
 * Supports OpenAI-compatible APIs (OpenAI, DeepSeek, local LLMs, etc.)
 * for translating and polishing Starsector mod text.
 */

class TranslationService {
  constructor() {
    this.config = {
      provider: 'openai', // openai | deepseek | custom
      apiKey: '',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      maxTokens: 2048,
      temperature: 0.3,
      batchSize: 5,
      rateLimitMs: 500,
      systemPrompt: this.getDefaultSystemPrompt(),
      polishPrompt: this.getDefaultPolishPrompt(),
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

