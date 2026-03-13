import { ipcMain, Notification } from 'electron';
import type { IPCContext } from '../../types/ipc';

interface NotificationPayload {
  title?: string;
  body?: string;
}

/**
 * Register system notification IPC handlers.
 * Allows the renderer process to display OS-level notifications.
 * @param ctx - Shared context (unused, kept for consistency)
 */
function register(ctx: IPCContext): void {
  /**
   * Displays a system notification if supported by the OS
   * @param payload - Notification content with title and body
   * @returns Success status
   */
  ipcMain.handle('app:notify', async (_, payload: NotificationPayload = {}) => {
    const title = String(payload.title || '');
    const body = String(payload.body || '');
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return { success: true };
    }
    return { success: false };
  });
}

module.exports = { register };

export { register };
