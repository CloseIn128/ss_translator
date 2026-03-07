const { ipcMain, dialog } = require('electron');

/**
 * Register export-related IPC handlers.
 * @param {object} ctx - Shared context { getMainWindow, exportMod }
 */
function register(ctx) {
  ipcMain.handle('export:mod', async (_, { projectData, outputPath }) => {
    try {
      const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择导出目录',
      });
      if (result.canceled) return null;
      await ctx.exportMod(projectData, result.filePaths[0]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
