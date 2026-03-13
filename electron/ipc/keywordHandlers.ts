import { ipcMain } from 'electron';
import type { IPCContext, IPCResponse } from '../../types/ipc';
import type { GlossaryEntry, KeywordEntry } from '../../types/project';

// Fields that indicate proper nouns / keyword candidates
const KEYWORD_NAME_FIELDS = new Set([
  'name', 'displayName', 'displayNameWithArticle',
  'displayNameLong', 'displayNameLongWithArticle',
  'hullName', 'designation',
]);

interface ExtractedKeyword extends KeywordEntry {
  context?: string;
  file?: string;
  extractType?: 'structure' | 'ai';
}

interface KeywordExtractRequest {
  modPath: string;
  glossary?: GlossaryEntry[];
  skipAI?: boolean;
}

interface KeywordTranslateRequest {
  keywords: KeywordEntry[];
  extraGlossary?: GlossaryEntry[];
}

interface TextSample {
  text: string;
  context?: string;
}

interface KeywordExtractResult {
  total: {
    structure: number;
    ai: number;
  };
}

/**
 * Safely lowercase a glossary/keyword entry's source field.
 * Returns null for malformed items.
 */
const safeTermLower = (item: GlossaryEntry | KeywordEntry): string | null =>
  item && typeof item.source === 'string' ? item.source.trim().toLowerCase() : null;

/**
 * Register keyword extraction and translation IPC handlers.
 * Provides structural and AI-based keyword extraction from MOD files.
 * @param ctx - Shared context with translationService, configManager, and parseModFolder
 */
function register(ctx: IPCContext): void {
  // ─── Unified keyword extraction (structural + AI with incremental updates) ───

  /**
   * Extract keywords from MOD folder using both structural and AI methods
   * Sends incremental results via 'keywords:batch' events
   * @param request - Extraction request with MOD path and settings
   * @returns Success status and extraction counts
   */
  ipcMain.handle('keywords:extractAll', async (_, request: KeywordExtractRequest): Promise<IPCResponse<KeywordExtractResult>> => {
    try {
      const { modPath, glossary, skipAI } = request;
      const parsed = await ctx.parseModFolder(modPath);

      // Build builtin glossary dedup set early (used for both phases)
      const builtinGlossaryEntries = ctx.configManager.getBuiltinGlossary() || [];
      const builtinTerms = new Set(builtinGlossaryEntries.map(safeTermLower).filter(Boolean) as string[]);
      const projectTerms = new Set((glossary || []).map(safeTermLower).filter(Boolean) as string[]);

      // Phase 1: Structural extraction (filter against builtin glossary)
      const seen = new Set<string>();
      const structKeywords: ExtractedKeyword[] = [];
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
        const textSamples: TextSample[] = [];
        const seenText = new Set<string>();
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

        await ctx.translationService.extractKeywords(sampled, {}, (batchKeywords: KeywordEntry[]) => {
          // Filter against structural results and glossaries
          const newKeywords = batchKeywords
            .filter(kw => !existingTerms.has(kw.source.toLowerCase()))
            .map(kw => ({
              ...kw,
              target: '',
              extractType: 'ai' as const,
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

      return { success: true, data: { total: { structure: structKeywords.length, ai: aiCount } } };
    } catch (err) {
      ctx.getMainWindow().webContents.send('keywords:batch', {
        keywords: [],
        phase: 'complete',
      });
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Translate keywords using AI (separate from extraction)
   * Merges builtin glossary and extra glossary for context
   * @param request - Translation request with keywords and settings
   * @returns Translated keywords
   */
  ipcMain.handle('keywords:translate', async (_, request: KeywordTranslateRequest): Promise<IPCResponse> => {
    try {
      const { keywords, extraGlossary } = request;
      const mainWindow = ctx.getMainWindow();
      // Log callback that sends events to the renderer
      const onLog = (level: string, message: string) => {
        mainWindow.webContents.send('keywords:log', { level, message });
      };
      // Merge builtin glossary + extra glossary (confirmed keywords) for translation reference
      const builtinGlossary = ctx.configManager.getBuiltinGlossary().map((e: GlossaryEntry) => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(extraGlossary || [])];
      const results = await ctx.translationService.translateKeywords(keywords, mergedGlossary, {}, onLog);
      return { success: true, data: results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Legacy keyword extraction from MOD folder (kept for compatibility)
  ipcMain.handle('mod:extractKeywords', async (_, modPath: string): Promise<IPCResponse> => {
    try {
      const parsed = await ctx.parseModFolder(modPath);
      // Extract entries from name/title fields as keyword candidates
      const seen = new Set<string>();
      const keywords: { original: string; context?: string; file: string }[] = [];
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
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * AI-enhanced keyword extraction (legacy handler)
   * @param request - Extraction request with MOD path and glossary
   * @returns Extracted keywords
   */
  ipcMain.handle('ai:extractKeywords', async (_, request: { modPath: string; glossary?: GlossaryEntry[] }): Promise<IPCResponse> => {
    try {
      const { modPath, glossary } = request;
      const parsed = await ctx.parseModFolder(modPath);

      // Collect text samples from all translatable entries
      const textSamples: TextSample[] = [];
      const seen = new Set<string>();
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
        .map(safeTermLower).filter(Boolean) as string[];
      const projectGlossary = (glossary || [])
        .map(safeTermLower).filter(Boolean) as string[];
      const existingTerms = new Set([...builtinGlossary, ...projectGlossary]);

      const keywords = (await ctx.translationService.extractKeywords(sampled)) || [];

      // Filter out terms already in glossaries (skip malformed keyword entries)
      const filtered = keywords.filter((kw: KeywordEntry) => {
        if (!kw || typeof kw.source !== 'string') return false;
        const term = kw.source.trim().toLowerCase();
        return term && !existingTerms.has(term);
      });

      return { success: true, data: filtered };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}

module.exports = { register };

export { register };
