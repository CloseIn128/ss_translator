const { ipcMain } = require('electron');

/**
 * Register AI translation-related IPC handlers.
 * @param {object} ctx - Shared context { translationService, configManager }
 */
function register(ctx) {
  ipcMain.handle('ai:configure', async (_, config) => {
    // If apiKey is blank (user didn't re-enter it), preserve the existing key
    // so the in-memory translator keeps working
    if (!config.apiKey) {
      const saved = ctx.configManager.getModelConfig();
      config = { ...config, apiKey: saved.apiKey };
    }
    ctx.translationService.configure(config);
    ctx.configManager.saveModelConfig(config);
    return { success: true };
  });

  ipcMain.handle('ai:translate', async (_, { entries, glossary, config }) => {
    try {
      // Merge project glossary with built-in public glossary
      const builtinGlossary = ctx.configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(glossary || [])];
      const results = await ctx.translationService.translateBatch(entries, mergedGlossary, config);
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai:polish', async (_, { entry, glossary, config }) => {
    try {
      const builtinGlossary = ctx.configManager.getBuiltinGlossary().map(e => ({
        source: e.source,
        target: e.target,
        category: e.category,
      }));
      const mergedGlossary = [...builtinGlossary, ...(glossary || [])];
      const result = await ctx.translationService.polish(entry, mergedGlossary, config);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai:getConfig', async () => {
    // Persisted config is the source of truth; mask the API key
    const config = ctx.configManager.getModelConfig();
    return {
      ...config,
      apiKey: '',
      hasApiKey: !!config.apiKey,
    };
  });

  ipcMain.handle('ai:resetConfig', async () => {
    const defaults = ctx.configManager.resetModelConfig();
    ctx.translationService.configure(defaults);
    return { success: true, data: defaults };
  });

  ipcMain.handle('ai:getDefaultPrompts', async () => {
    return ctx.translationService.getDefaultPrompts();
  });
}

module.exports = { register };
