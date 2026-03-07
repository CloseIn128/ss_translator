const { ipcMain, dialog } = require('electron');

/**
 * Register project-related IPC handlers.
 * @param {object} ctx - Shared context { getMainWindow, projectManager, parseModFolder }
 */
function register(ctx) {
  ipcMain.handle('mod:parse', async (_, modPath) => {
    try {
      const entries = await ctx.parseModFolder(modPath);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:create', async (_, modPath) => {
    try {
      const project = await ctx.projectManager.createProject(modPath);
      return { success: true, data: project };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:save', async (_, projectData) => {
    try {
      await ctx.projectManager.saveProject(projectData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:load', async () => {
    try {
      const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
        properties: ['openFile'],
        filters: [{ name: '翻译项目', extensions: ['sst'] }],
        title: '打开翻译项目',
      });
      if (result.canceled) return null;
      const project = await ctx.projectManager.loadProject(result.filePaths[0]);
      return { success: true, data: project };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
