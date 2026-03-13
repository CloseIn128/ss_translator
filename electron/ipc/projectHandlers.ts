import { ipcMain, dialog } from 'electron';
import type { IPCContext, IPCResponse } from '../../types/ipc';
import type { Project, ParsedModData } from '../../types/project';

/**
 * Register project-related IPC handlers.
 * Manages project creation, loading, and saving operations.
 * @param ctx - Shared context with projectManager and parseModFolder
 */
function register(ctx: IPCContext): void {
  /**
   * Parse a MOD folder to extract translatable entries
   * @param modPath - Absolute path to the MOD folder
   * @returns Parsed MOD data with entries and statistics
   */
  ipcMain.handle('mod:parse', async (_, modPath: string): Promise<IPCResponse<ParsedModData>> => {
    try {
      const entries = await ctx.parseModFolder(modPath);
      return { success: true, data: entries };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Create a new empty project (without a MOD folder)
   * @returns Empty project structure
   */
  ipcMain.handle('project:createEmpty', async (): Promise<IPCResponse<Project>> => {
    try {
      const project = ctx.projectManager.createEmptyProject();
      return { success: true, data: project };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Create a new project from a MOD folder
   * @param modPath - Absolute path to the MOD folder
   * @returns Created project with parsed entries
   */
  ipcMain.handle('project:create', async (_, modPath: string): Promise<IPCResponse<Project>> => {
    try {
      const project = await ctx.projectManager.createProject(modPath);
      return { success: true, data: project };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Save a project to disk
   * Shows a save dialog if no file path is set
   * @param projectData - Project data to save
   * @returns Saved project file path or null if canceled
   */
  ipcMain.handle('project:save', async (_, projectData: Project): Promise<IPCResponse<{ projectFilePath: string }> | null> => {
    try {
      // No save path yet – prompt the user to choose where to save
      if (!projectData.projectFilePath) {
        const modName = projectData.modInfo?.name || projectData.modInfo?.id || 'new_project';
        const safeName = modName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_');
        const defaultName = `${safeName}_translation.sst`;
        const result = await dialog.showSaveDialog(ctx.getMainWindow(), {
          filters: [{ name: '翻译项目', extensions: ['sst'] }],
          title: '保存翻译项目',
          defaultPath: defaultName,
        });
        if (result.canceled) return null;
        projectData.projectFilePath = result.filePath!;
      }
      const saved = await ctx.projectManager.saveProject(projectData);
      return { success: true, data: { projectFilePath: saved.projectFilePath! } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  /**
   * Load a project from disk
   * Shows an open dialog for file selection
   * @returns Loaded project or null if canceled
   */
  ipcMain.handle('project:load', async (): Promise<IPCResponse<Project> | null> => {
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
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}

module.exports = { register };

export { register };
