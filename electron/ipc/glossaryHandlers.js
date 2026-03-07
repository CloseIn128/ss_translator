const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Register glossary-related IPC handlers (project + builtin/public glossary).
 * @param {object} ctx - Shared context { getMainWindow, glossaryManager, configManager }
 */
function register(ctx) {
  // ─── Project Glossary ───────────────────────────────────────────────

  ipcMain.handle('glossary:getAll', async (_, projectId) => {
    return ctx.glossaryManager.getAll(projectId);
  });

  ipcMain.handle('glossary:add', async (_, entry) => {
    return ctx.glossaryManager.add(entry);
  });

  ipcMain.handle('glossary:update', async (_, entry) => {
    return ctx.glossaryManager.update(entry);
  });

  ipcMain.handle('glossary:remove', async (_, id) => {
    return ctx.glossaryManager.remove(id);
  });

  ipcMain.handle('glossary:import', async (_, projectId) => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'CSV文件', extensions: ['csv'] }],
      title: '导入名词库',
    });
    if (result.canceled) return null;
    return ctx.glossaryManager.importFromCSV(result.filePaths[0], projectId);
  });

  ipcMain.handle('glossary:export', async (_, projectId) => {
    const result = await dialog.showSaveDialog(ctx.getMainWindow(), {
      filters: [{ name: 'CSV文件', extensions: ['csv'] }],
      title: '导出名词库',
    });
    if (result.canceled) return null;
    return ctx.glossaryManager.exportToCSV(result.filePath, projectId);
  });

  // ─── Public / Built-in Glossary ─────────────────────────────────────

  ipcMain.handle('glossary:getBuiltin', async () => {
    return ctx.configManager.getBuiltinGlossary();
  });

  ipcMain.handle('glossary:saveBuiltin', async (_, entries) => {
    return ctx.configManager.saveBuiltinGlossary(entries);
  });

  ipcMain.handle('glossary:resetBuiltin', async () => {
    const entries = ctx.configManager.resetBuiltinGlossary();
    return { success: true, data: entries };
  });

  ipcMain.handle('glossary:importBuiltin', async () => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'JSON / CSV文件', extensions: ['json', 'csv'] }],
      title: '导入公共词库',
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    let entries;
    if (ext === '.json') {
      entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
      const tmp = await ctx.glossaryManager.importFromCSV(filePath, '__builtin__');
      entries = tmp.entries.map(({ source, target, category }) => ({ source, target, category }));
    }
    ctx.configManager.saveBuiltinGlossary(entries);
    return { success: true, data: entries };
  });

  ipcMain.handle('glossary:exportBuiltin', async () => {
    const result = await dialog.showSaveDialog(ctx.getMainWindow(), {
      filters: [{ name: 'JSON文件', extensions: ['json'] }],
      defaultPath: 'builtin_glossary.json',
      title: '导出公共词库',
    });
    if (result.canceled) return null;
    const entries = ctx.configManager.getBuiltinGlossary();
    fs.writeFileSync(result.filePath, JSON.stringify(entries, null, 2), 'utf-8');
    return { success: true, exported: entries.length };
  });
}

module.exports = { register };
