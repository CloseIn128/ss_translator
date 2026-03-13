import { ipcMain, dialog } from 'electron';
import type { IPCContext, IPCResponse } from '../../types/ipc';
import type { TranslationEntry } from '../../types/project';

interface LegacyMatchRequest {
  entries: TranslationEntry[];
}

/**
 * Register legacy translation-related IPC handlers.
 * Manages loading and matching translations from old mod versions.
 * @param ctx - Shared context with legacyTranslationService
 */
function register(ctx: IPCContext): void {
  /**
   * Load an old translated mod folder for matching against current project
   * @returns Legacy mod info or null if canceled
   */
  ipcMain.handle('legacy:load', async (): Promise<IPCResponse | null> => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openDirectory'],
      title: '选择老版本汉化MOD文件夹',
    });
    if (result.canceled) return null;
    try {
      const info = await ctx.legacyTranslationService.loadLegacyMod(result.filePaths[0]);
      return { success: true, data: info };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Get information about the currently loaded legacy mod
   * @returns Legacy mod info or null
   */
  ipcMain.handle('legacy:getInfo', async () => {
    return ctx.legacyTranslationService.getLegacyInfo();
  });

  /**
   * Match new project entries against loaded legacy translations
   * @param request - Match request with new entries
   * @returns Match results with matched and unmatched entries
   */
  ipcMain.handle('legacy:match', async (_, request: LegacyMatchRequest): Promise<IPCResponse> => {
    try {
      const result = ctx.legacyTranslationService.matchEntries(request.entries);
      return { success: true, data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Clear loaded legacy translation data
   * @returns Success status
   */
  ipcMain.handle('legacy:clear', async (): Promise<IPCResponse> => {
    ctx.legacyTranslationService.clear();
    return { success: true };
  });
}

module.exports = { register };

export { register };
