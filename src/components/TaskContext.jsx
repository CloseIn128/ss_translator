import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

/**
 * Centralized task management and logging context.
 *
 * - Only one task may run at a time.
 * - All features push log entries through addLog().
 * - When a task completes/fails, a system notification is sent if the window is
 *   not focused, and the task bar is highlighted.
 */

const TaskContext = createContext(null);

export function useTask() {
  return useContext(TaskContext);
}

/** Log levels: debug | info | success | warning | error */
const MAX_LOGS = 2000;

export function TaskProvider({ children }) {
  const [logs, setLogs] = useState([]);
  const [debugMode, setDebugMode] = useState(false);
  const [currentTask, setCurrentTask] = useState(null); // { id, name, status, progress, message }
  const [taskHighlight, setTaskHighlight] = useState(false); // flash when task finishes
  const taskIdCounter = useRef(0);

  // ── Logging ──────────────────────────────────────────────────────────────

  const addLog = useCallback((level, message, source) => {
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: new Date(),
      level,   // 'debug' | 'info' | 'success' | 'warning' | 'error'
      message,
      source,  // e.g. '翻译编辑', '关键词提取'
    };
    setLogs(prev => {
      const next = [...prev, entry];
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // ── Task management ──────────────────────────────────────────────────────

  /**
   * Start a new task. Returns the task id, or null if a task is already running.
   */
  const startTask = useCallback((name) => {
    // Check if a task is currently running
    if (currentTask && currentTask.status === 'running') {
      return null; // another task is in progress
    }
    const id = ++taskIdCounter.current;
    const task = { id, name, status: 'running', progress: '', message: '' };
    setCurrentTask(task);
    setTaskHighlight(false);
    addLog('info', `任务开始: ${name}`, '任务管理');
    return id;
  }, [currentTask, addLog]);

  const updateTaskProgress = useCallback((progress, message) => {
    setCurrentTask(prev => {
      if (!prev || prev.status !== 'running') return prev;
      return { ...prev, progress: progress ?? prev.progress, message: message ?? prev.message };
    });
  }, []);

  const completeTask = useCallback((message) => {
    setCurrentTask(prev => {
      if (!prev) return prev;
      return { ...prev, status: 'completed', message: message || '任务完成' };
    });
    setTaskHighlight(true);
    addLog('success', message || '任务完成', '任务管理');

    // System notification if window not focused
    if (typeof document !== 'undefined' && !document.hasFocus()) {
      try {
        if (window.electronAPI?.sendNotification) {
          window.electronAPI.sendNotification('任务完成', message || '任务已完成');
        }
      } catch (_) { /* ignore */ }
    }
  }, [addLog]);

  const failTask = useCallback((error) => {
    setCurrentTask(prev => {
      if (!prev) return prev;
      return { ...prev, status: 'failed', message: error || '任务失败' };
    });
    setTaskHighlight(true);
    addLog('error', error || '任务失败', '任务管理');

    if (typeof document !== 'undefined' && !document.hasFocus()) {
      try {
        if (window.electronAPI?.sendNotification) {
          window.electronAPI.sendNotification('任务失败', error || '任务执行失败');
        }
      } catch (_) { /* ignore */ }
    }
  }, [addLog]);

  const dismissTask = useCallback(() => {
    setCurrentTask(null);
    setTaskHighlight(false);
  }, []);

  const isTaskRunning = !!(currentTask && currentTask.status === 'running');

  const value = {
    // Logging
    logs,
    debugMode,
    setDebugMode,
    addLog,
    clearLogs,
    // Task
    currentTask,
    startTask,
    updateTaskProgress,
    completeTask,
    failTask,
    dismissTask,
    isTaskRunning,
    taskHighlight,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}
