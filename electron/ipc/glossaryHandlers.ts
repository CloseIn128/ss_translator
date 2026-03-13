import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { IPCContext, IPCResponse } from '../../types/ipc';
import type { GlossaryEntry } from '../../types/project';

/**
 * Register glossary-related IPC handlers (project + builtin/public glossary).
 * Manages glossary operations for both project-specific and global glossaries.
 * @param ctx - Shared context with glossaryManager and configManager
 */
function register(ctx: IPCContext): void {
  // ─── Project Glossary ───────────────────────────────────────────────

  /**
   * Get all glossary entries for a project
   * @param projectId - Project identifier
   * @returns Array of glossary entries
   */
  ipcMain.handle('glossary:getAll', async (_, projectId: string) => {
    return ctx.glossaryManager.getAll(projectId);
  });

  /**
   * Add a new glossary entry to a project
   * @param entry - Glossary entry to add
   * @returns Added entry with generated ID
   */
  ipcMain.handle('glossary:add', async (_, entry: Omit<GlossaryEntry, 'id'>) => {
    return ctx.glossaryManager.add(entry);
  });

  /**
   * Update an existing glossary entry
   * @param entry - Glossary entry with updated fields
   * @returns Updated entry
   */
  ipcMain.handle('glossary:update', async (_, entry: GlossaryEntry) => {
    return ctx.glossaryManager.update(entry);
  });

  /**
   * Remove a glossary entry by ID
   * @param id - Entry ID to remove
   * @returns Success status
   */
  ipcMain.handle('glossary:remove', async (_, id: string) => {
    return ctx.glossaryManager.remove(id);
  });

  /**
   * Import glossary entries from a CSV file
   * Shows a file selection dialog
   * @param projectId - Project identifier
   * @returns Imported entries or null if canceled
   */
  ipcMain.handle('glossary:import', async (_, projectId: string) => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'CSV文件', extensions: ['csv'] }],
      title: '导入名词库',
    });
    if (result.canceled) return null;
    return ctx.glossaryManager.importFromCSV(result.filePaths[0], projectId);
  });

  /**
   * Export glossary entries to a CSV file
   * Shows a save dialog
   * @param projectId - Project identifier
   * @returns Export result or null if canceled
   */
  ipcMain.handle('glossary:export', async (_, projectId: string) => {
    const result = await dialog.showSaveDialog(ctx.getMainWindow(), {
      filters: [{ name: 'CSV文件', extensions: ['csv'] }],
      title: '导出名词库',
    });
    if (result.canceled) return null;
    return ctx.glossaryManager.exportToCSV(result.filePath!, projectId);
  });

  // ─── Public / Built-in Glossary ─────────────────────────────────────

  /**
   * Get all built-in (public) glossary entries
   * @returns Array of built-in glossary entries
   */
  ipcMain.handle('glossary:getBuiltin', async () => {
    return ctx.configManager.getBuiltinGlossary();
  });

  /**
   * Save built-in glossary entries
   * @param entries - Array of glossary entries to save
   * @returns Success status
   */
  ipcMain.handle('glossary:saveBuiltin', async (_, entries: GlossaryEntry[]) => {
    return ctx.configManager.saveBuiltinGlossary(entries);
  });

  /**
   * Reset built-in glossary to default values
   * @returns Reset glossary entries
   */
  ipcMain.handle('glossary:resetBuiltin', async (): Promise<IPCResponse<GlossaryEntry[]>> => {
    const entries = ctx.configManager.resetBuiltinGlossary();
    return { success: true, data: entries };
  });

  /**
   * Import built-in glossary from JSON or CSV file
   * Shows a file selection dialog
   * @returns Imported entries or null if canceled
   */
  ipcMain.handle('glossary:importBuiltin', async (): Promise<IPCResponse<GlossaryEntry[]> | null> => {
    const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'JSON / CSV文件', extensions: ['json', 'csv'] }],
      title: '导入公共词库',
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    let entries: GlossaryEntry[];
    if (ext === '.json') {
      entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
      const tmp = await ctx.glossaryManager.importFromCSV(filePath, '__builtin__');
      entries = tmp.entries.map(({ source, target, category }: GlossaryEntry) => ({ source, target, category }));
    }
    ctx.configManager.saveBuiltinGlossary(entries);
    return { success: true, data: entries };
  });

  /**
   * Export built-in glossary to a JSON file
   * Shows a save dialog
   * @returns Export result or null if canceled
   */
  ipcMain.handle('glossary:exportBuiltin', async (): Promise<IPCResponse<{ exported: number }> | null> => {
    const result = await dialog.showSaveDialog(ctx.getMainWindow(), {
      filters: [{ name: 'JSON文件', extensions: ['json'] }],
      defaultPath: 'builtin_glossary.json',
      title: '导出公共词库',
    });
    if (result.canceled) return null;
    const entries = ctx.configManager.getBuiltinGlossary();
    fs.writeFileSync(result.filePath!, JSON.stringify(entries, null, 2), 'utf-8');
    return { success: true, exported: entries.length };
  });
}

module.exports = { register };

export { register };
