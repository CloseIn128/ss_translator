import { ipcMain, dialog } from 'electron';
import type { IPCContext } from '../../types/ipc';

/**
 * Register dialog-related IPC handlers.
 * Handles native OS dialog interactions (file/folder selection).
 * @param ctx - Shared context containing getMainWindow function
 */
function register(ctx: IPCContext): void {
  /**
   * Shows a directory selection dialog for choosing a MOD folder
   * @returns Selected directory path or null if canceled
   */
  ipcMain.handle('dialog:selectModFolder', async () => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openDirectory'],
      title: '选择MOD文件夹',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
}

module.exports = { register };

export { register };
