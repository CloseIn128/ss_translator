import { ipcMain, dialog, shell } from 'electron';
import type { IPCContext, IPCResponse } from '../../types/ipc';
import type { Project } from '../../types/project';

interface ExportRequest {
  projectData: Project;
  outputPath?: string;
}

interface ExportResult {
  outputPath?: string;
}

/**
 * Register MOD export-related IPC handlers.
 * Manages exporting translated projects to MOD format.
 * @param ctx - Shared context with exportMod function
 */
function register(ctx: IPCContext): void {
  /**
   * Export a translated project to MOD folder structure
   * Opens directory selection dialog and then exports
   * @param request - Export request with project data
   * @returns Export result with output path or null if canceled
   */
  ipcMain.handle('export:mod', async (_, request: ExportRequest): Promise<IPCResponse<ExportResult> | null> => {
    try {
      const result = await dialog.showOpenDialog(ctx.getMainWindow(), {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择导出目录',
      });
      if (result.canceled) return null;
      const exportResult = await ctx.exportMod(request.projectData, result.filePaths[0]);
      // Open the exported directory in the system file manager
      if (exportResult?.outputPath) {
        shell.openPath(exportResult.outputPath).catch(() => {});
      }
      return { success: true, outputPath: exportResult?.outputPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}

module.exports = { register };

export { register };
