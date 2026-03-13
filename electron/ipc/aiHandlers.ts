import { ipcMain } from 'electron';
import type { IPCContext, IPCResponse } from '../../types/ipc';
import type { GlossaryEntry } from '../../types/project';
import type { TranslationConfig } from '../../types/translator';

interface TranslateRequest {
  entries: any[];
  glossary?: GlossaryEntry[];
  config?: Partial<TranslationConfig>;
  modPrompt?: string;
}

interface PolishRequest {
  entry?: any;
  entries?: any[];
  glossary?: GlossaryEntry[];
  config?: Partial<TranslationConfig>;
  modPrompt?: string;
}

/**
 * Register AI translation-related IPC handlers.
 * Manages AI configuration, translation, polishing, and request history.
 * @param ctx - Shared context with translationService and configManager
 */
function register(ctx: IPCContext): void {
  /**
   * Configure AI translation settings
   * Preserves existing API key if not provided
   * @param config - Partial configuration to update
   * @returns Success status
   */
  ipcMain.handle('ai:configure', async (_, config: Partial<TranslationConfig>): Promise<IPCResponse> => {
    // If apiKey is blank (user didn't re-enter it), preserve the existing key
    // so the in-memory translator keeps working
    if (!config.apiKey) {
      const saved = ctx.configManager.getModelConfig();
      config = { ...config, apiKey: saved.apiKey };
    }
    ctx.translationService.configure(config);
    ctx.configManager.saveModelConfig(config as TranslationConfig);
    return { success: true };
  });

  /**
   * Translate a batch of entries using AI
   * Merges project glossary with built-in glossary
   * @param request - Translation request with entries and settings
   * @returns Translation results
   */
  ipcMain.handle('ai:translate', async (_, request: TranslateRequest): Promise<IPCResponse> => {
    try {
      const { entries, glossary, config, modPrompt } = request;
      // Merge project glossary with built-in public glossary
      const builtinGlossary = ctx.configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(glossary || [])];
      const win = ctx.getMainWindow();
      const onProgress = (completed: number, total: number, batchResults: any[]) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('ai:translateProgress', { completed, total, batchResults });
        }
      };
      const results = await ctx.translationService.translateBatch(entries, mergedGlossary, config || {}, modPrompt || '', onProgress);
      return { success: true, data: results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Polish a single translated entry using AI
   * @param request - Polish request with entry and settings
   * @returns Polished result
   */
  ipcMain.handle('ai:polish', async (_, request: PolishRequest): Promise<IPCResponse> => {
    try {
      const { entry, glossary, config, modPrompt } = request;
      const builtinGlossary = ctx.configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(glossary || [])];
      const result = await ctx.translationService.polish(entry!, mergedGlossary, config || {}, modPrompt || '');
      return { success: true, data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Polish a batch of translated entries using AI
   * @param request - Polish request with entries and settings
   * @returns Polished results
   */
  ipcMain.handle('ai:polishBatch', async (_, request: PolishRequest): Promise<IPCResponse> => {
    try {
      const { entries, glossary, config, modPrompt } = request;
      const builtinGlossary = ctx.configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(glossary || [])];
      const win = ctx.getMainWindow();
      const onProgress = (completed: number, total: number, batchResults: any[]) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('ai:polishProgress', { completed, total, batchResults });
        }
      };
      const results = await ctx.translationService.polishBatch(entries!, mergedGlossary, config || {}, modPrompt || '', onProgress);
      return { success: true, data: results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Get current AI configuration
   * API key is masked for security
   * @returns Configuration with masked API key
   */
  ipcMain.handle('ai:getConfig', async () => {
    // Persisted config is the source of truth; mask the API key
    const config = ctx.configManager.getModelConfig();
    return {
      ...config,
      apiKey: '',
      hasApiKey: !!config.apiKey,
    };
  });

  /**
   * Reset AI configuration to default values
   * @returns Reset configuration
   */
  ipcMain.handle('ai:resetConfig', async (): Promise<IPCResponse> => {
    const defaults = ctx.configManager.resetModelConfig();
    ctx.translationService.configure(defaults);
    return { success: true, data: defaults };
  });

  /**
   * Get default AI prompts (system, polish, keyword)
   * @returns Default prompts
   */
  ipcMain.handle('ai:getDefaultPrompts', async () => {
    return ctx.translationService.getDefaultPrompts();
  });

  // ── Request History ───────────────────────────────────────────────────

  /**
   * Get AI translation request history
   * @returns Array of request records
   */
  ipcMain.handle('ai:getRequestHistory', async () => {
    return ctx.translationService.getRequestHistory();
  });

  /**
   * Get detailed information about a specific request
   * @param id - Request ID
   * @returns Request details
   */
  ipcMain.handle('ai:getRequestDetail', async (_, id: number) => {
    return ctx.translationService.getRequestDetail(id);
  });

  /**
   * Get currently active (in-progress) requests
   * @returns Array of active requests
   */
  ipcMain.handle('ai:getActiveRequests', async () => {
    return ctx.translationService.getActiveRequests();
  });

  /**
   * Clear request history
   * @returns Success status
   */
  ipcMain.handle('ai:clearRequestHistory', async (): Promise<IPCResponse> => {
    ctx.translationService.clearRequestHistory();
    return { success: true };
  });
}

module.exports = { register };

export { register };
