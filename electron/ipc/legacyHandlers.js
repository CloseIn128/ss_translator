const { ipcMain, dialog } = require('electron');

/**
 * Register legacy-translation-related IPC handlers.
 * @param {object} ctx - Shared context { getMainWindow, legacyTranslationService, parseModFolder }
 */
function register(ctx) {
  ipcMain.handle('legacy:load', async () => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openDirectory'],
      title: '选择老版本汉化MOD文件夹',
    });
    if (result.canceled) return null;
    try {
      const info = await ctx.legacyTranslationService.loadLegacyMod(result.filePaths[0]);
      return { success: true, data: info };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('legacy:getInfo', async () => {
    return ctx.legacyTranslationService.getLegacyInfo();
  });

  ipcMain.handle('legacy:match', async (_, { entries }) => {
    try {
      const result = ctx.legacyTranslationService.matchEntries(entries);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('legacy:clear', async () => {
    ctx.legacyTranslationService.clear();
    return { success: true };
  });
}

module.exports = { register };
