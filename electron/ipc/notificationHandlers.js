const { ipcMain, Notification } = require('electron');

/**
 * Register system notification IPC handlers.
 * @param {object} ctx - Shared context (unused, kept for consistency)
 */
function register(ctx) {
  ipcMain.handle('app:notify', async (_, payload = {}) => {
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
