const { ipcMain, dialog } = require('electron');

/**
 * Register dialog-related IPC handlers.
 * @param {object} ctx - Shared context { getMainWindow }
 */
function register(ctx) {
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
