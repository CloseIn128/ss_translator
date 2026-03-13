import { createContext, useContext, useState, useCallback, useRef, type ReactNode, type Dispatch, type SetStateAction } from 'react';

/**
 * Centralized task management and logging context.
 *
 * - Only one task may run at a time.
 * - All features push log entries through addLog().
 * - When a task completes/fails, a system notification is sent if the window is
 *   not focused, and the task bar is highlighted.
 */

export type LogLevel = 'debug' | 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source: string;
}

export interface Task {
  id: number;
  name: string;
  status: 'running' | 'completed' | 'failed';
  progress: string;
  message: string;
}

export interface TaskContextValue {
  logs: LogEntry[];
  debugMode: boolean;
  setDebugMode: Dispatch<SetStateAction<boolean>>;
  addLog: (level: LogLevel, message: string, source: string) => void;
  clearLogs: () => void;
  currentTask: Task | null;
  startTask: (name: string) => number | null;
  updateTaskProgress: (progress: string, message: string) => void;
  completeTask: (message?: string) => void;
  failTask: (error?: string) => void;
  cancelTask: () => void;
  isTaskCancelled: () => boolean;
  dismissTask: () => void;
  isTaskRunning: boolean;
  taskHighlight: boolean;
}

const TaskContext = createContext<TaskContextValue | null>(null);

export function useTask(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTask must be used within TaskProvider');
  return ctx;
}

/** Log levels: debug | info | success | warning | error */
const MAX_LOGS = 2000;
let logIdCounter = 0;

export function TaskProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [debugMode, setDebugMode] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [taskHighlight, setTaskHighlight] = useState(false); // flash when task finishes
  const taskIdCounter = useRef(0);
  const cancelledRef = useRef(false);

  // ── Logging ──────────────────────────────────────────────────────────────

  const addLog = useCallback((level: LogLevel, message: string, source: string) => {
    const entry: LogEntry = {
      id: ++logIdCounter,
      timestamp: new Date(),
      level,
      message,
      source,
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
  const startTask = useCallback((name: string) => {
    // Check if a task is currently running
    if (currentTask && currentTask.status === 'running') {
      return null; // another task is in progress
    }
    const id = ++taskIdCounter.current;
    const task: Task = { id, name, status: 'running', progress: '', message: '' };
    setCurrentTask(task);
    setTaskHighlight(false);
    cancelledRef.current = false;
    addLog('info', `任务开始: ${name}`, '任务管理');
    return id;
  }, [currentTask, addLog]);

  const updateTaskProgress = useCallback((progress: string, message: string) => {
    setCurrentTask(prev => {
      if (!prev || prev.status !== 'running') return prev;
      return { ...prev, progress: progress ?? prev.progress, message: message ?? prev.message };
    });
  }, []);

  const completeTask = useCallback((message?: string) => {
    setCurrentTask(prev => {
      if (!prev) return prev;
      return { ...prev, status: 'completed', message: message || '任务完成' };
    });
    setTaskHighlight(true);
    addLog('success', message || '任务完成', '任务管理');

    // System notification if window not focused
    if (typeof document !== 'undefined' && !document.hasFocus()) {
      try {
        window.electronAPI?.sendNotification?.('任务完成', message || '任务已完成')?.catch?.(() => {});
      } catch (_) { /* ignore */ }
    }
  }, [addLog]);

  const failTask = useCallback((error?: string) => {
    setCurrentTask(prev => {
      if (!prev) return prev;
      return { ...prev, status: 'failed', message: error || '任务失败' };
    });
    setTaskHighlight(true);
    addLog('error', error || '任务失败', '任务管理');

    if (typeof document !== 'undefined' && !document.hasFocus()) {
      try {
        window.electronAPI?.sendNotification?.('任务失败', error || '任务执行失败')?.catch?.(() => {});
      } catch (_) { /* ignore */ }
    }
  }, [addLog]);

  const cancelTask = useCallback(() => {
    cancelledRef.current = true;
    setCurrentTask(prev => {
      if (!prev || prev.status !== 'running') return prev;
      return { ...prev, status: 'failed', message: '任务已取消' };
    });
    setTaskHighlight(false);
    addLog('warning', '任务已取消', '任务管理');
  }, [addLog]);

  const isTaskCancelled = useCallback(() => {
    return cancelledRef.current;
  }, []);

  const dismissTask = useCallback(() => {
    setCurrentTask(null);
    setTaskHighlight(false);
  }, []);

  const isTaskRunning = !!(currentTask && currentTask.status === 'running');

  const value: TaskContextValue = {
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
    cancelTask,
    isTaskCancelled,
    dismissTask,
    isTaskRunning,
    taskHighlight,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}
