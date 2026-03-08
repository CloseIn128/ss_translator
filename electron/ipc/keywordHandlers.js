const { ipcMain } = require('electron');

// Fields that indicate proper nouns / keyword candidates
const KEYWORD_NAME_FIELDS = new Set([
  'name', 'displayName', 'displayNameWithArticle',
  'displayNameLong', 'displayNameLongWithArticle',
  'hullName', 'designation',
]);

/** Safely lowercase a glossary/keyword entry's source field. Returns null for malformed items. */
const safeTermLower = (item) =>
  item && typeof item.source === 'string' ? item.source.trim().toLowerCase() : null;

/**
 * Register keyword extraction and translation IPC handlers.
 * @param {object} ctx - Shared context { getMainWindow, translationService, configManager, parseModFolder }
 */
function register(ctx) {
  // ─── Unified keyword extraction (structural + AI with incremental updates) ───

  ipcMain.handle('keywords:extractAll', async (_, { modPath, glossary, skipAI }) => {
    try {
      const parsed = await ctx.parseModFolder(modPath);

      // Build builtin glossary dedup set early (used for both phases)
      const builtinGlossaryEntries = ctx.configManager.getBuiltinGlossary() || [];
      const builtinTerms = new Set(builtinGlossaryEntries.map(safeTermLower).filter(Boolean));
      const projectTerms = new Set((glossary || []).map(safeTermLower).filter(Boolean));

      // Phase 1: Structural extraction (filter against builtin glossary)
      const seen = new Set();
      const structKeywords = [];
      for (const entry of parsed.entries) {
        if (KEYWORD_NAME_FIELDS.has(entry.field) && entry.original && !seen.has(entry.original.toLowerCase())) {
          const lc = entry.original.toLowerCase();
          seen.add(lc);
          // Skip if already in builtin or project glossary
          if (builtinTerms.has(lc) || projectTerms.has(lc)) continue;
          structKeywords.push({
            source: entry.original,
            target: '',
            category: '通用',
            context: entry.context,
            file: entry.file,
            extractType: 'structure',
          });
        }
      }

      const mainWindow = ctx.getMainWindow();

      // Send structural results immediately
      if (structKeywords.length > 0) {
        mainWindow.webContents.send('keywords:batch', {
          keywords: structKeywords,
          phase: 'structure',
        });
      }

      let aiCount = 0;

      // Phase 2: AI extraction (skip if user chose structure-only mode)
      if (!skipAI) {
        const textSamples = [];
        const seenText = new Set();
        for (const entry of parsed.entries) {
          if (entry.original && entry.original.length >= 10 && !seenText.has(entry.original)) {
            seenText.add(entry.original);
            textSamples.push({
              text: entry.original,
              context: entry.context || entry.file,
            });
          }
        }

        const MAX_AI_SAMPLES = 200;
        const sampled = textSamples.length > MAX_AI_SAMPLES
          ? textSamples.slice(0, MAX_AI_SAMPLES)
          : textSamples;

        // Build dedup set from structural results + existing glossaries
        const existingTerms = new Set([...seen, ...builtinTerms, ...projectTerms]);

        await ctx.translationService.extractKeywords(sampled, {}, (batchKeywords) => {
          // Filter against structural results and glossaries
          const newKeywords = batchKeywords
            .filter(kw => !existingTerms.has(kw.source.toLowerCase()))
            .map(kw => ({
              ...kw,
              target: '',
              extractType: 'ai',
            }));

          // Add to dedup set for future batches
          for (const kw of newKeywords) {
            existingTerms.add(kw.source.toLowerCase());
          }

          if (newKeywords.length > 0) {
            aiCount += newKeywords.length;
            mainWindow.webContents.send('keywords:batch', {
              keywords: newKeywords,
              phase: 'ai',
            });
          }
        });
      }

      // Signal completion
      mainWindow.webContents.send('keywords:batch', {
        keywords: [],
        phase: 'complete',
      });

      return { success: true, total: { structure: structKeywords.length, ai: aiCount } };
    } catch (err) {
      ctx.getMainWindow().webContents.send('keywords:batch', {
        keywords: [],
        phase: 'complete',
      });
      return { success: false, error: err.message };
    }
  });

  // Keyword translation (separate from extraction, uses builtin glossary for context)
  ipcMain.handle('keywords:translate', async (_, { keywords }) => {
    try {
      // Merge builtin glossary for translation reference
      const builtinGlossary = ctx.configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const results = await ctx.translationService.translateKeywords(keywords, builtinGlossary);
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Legacy keyword extraction from MOD folder (kept for compatibility)
  ipcMain.handle('mod:extractKeywords', async (_, modPath) => {
    try {
      const parsed = await ctx.parseModFolder(modPath);
      // Extract entries from name/title fields as keyword candidates
      const seen = new Set();
      const keywords = [];
      for (const entry of parsed.entries) {
        if (KEYWORD_NAME_FIELDS.has(entry.field) && entry.original && !seen.has(entry.original)) {
          seen.add(entry.original);
          keywords.push({
            original: entry.original,
            context: entry.context,
            file: entry.file,
          });
        }
      }
      return { success: true, data: keywords };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // AI-enhanced keyword extraction
  ipcMain.handle('ai:extractKeywords', async (_, { modPath, glossary }) => {
    try {
      const parsed = await ctx.parseModFolder(modPath);

      // Collect text samples from all translatable entries
      const textSamples = [];
      const seen = new Set();
      for (const entry of parsed.entries) {
        if (entry.original && entry.original.length >= 10 && !seen.has(entry.original)) {
          seen.add(entry.original);
          textSamples.push({
            text: entry.original,
            context: entry.context || entry.file,
          });
        }
      }

      // Limit total samples to avoid excessive API calls
      const MAX_AI_SAMPLES = 200;
      const sampled = textSamples.length > MAX_AI_SAMPLES
        ? textSamples.slice(0, MAX_AI_SAMPLES)
        : textSamples;

      // Merge glossary for deduplication
      const builtinGlossary = (ctx.configManager.getBuiltinGlossary() || [])
        .map(safeTermLower).filter(Boolean);
      const projectGlossary = (glossary || [])
        .map(safeTermLower).filter(Boolean);
      const existingTerms = new Set([...builtinGlossary, ...projectGlossary]);

      const keywords = (await ctx.translationService.extractKeywords(sampled)) || [];

      // Filter out terms already in glossaries (skip malformed keyword entries)
      const filtered = keywords.filter(kw => {
        if (!kw || typeof kw.source !== 'string') return false;
        const term = kw.source.trim().toLowerCase();
        return term && !existingTerms.has(term);
      });

      return { success: true, data: filtered };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
