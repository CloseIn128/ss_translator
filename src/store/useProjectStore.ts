import { create } from 'zustand';
import type { Project, GlossaryEntry, KeywordEntry, ApiResult } from '../../types';

const api = typeof window !== 'undefined' ? window.electronAPI : null;

const DEFAULT_ZOOM_LEVEL = 100;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

const clampZoom = (v: string | number | null): number => {
  const num = Number(v);
  return Number.isFinite(num) && num >= MIN_ZOOM && num <= MAX_ZOOM ? num : DEFAULT_ZOOM_LEVEL;
};

type TabName = 'editor' | 'info' | 'glossary' | 'keywords' | 'review' | 'settings' | 'app-settings' | 'history';

interface ProjectStore {
  // ---- Core project state ----
  project: Project | null;
  selectedFile: string | null;

  // ---- UI state ----
  activeTab: TabName;
  zoomLevel: number;
  logVisible: boolean;

  // ---- Simple setters ----
  setProject: (project: Project | null) => void;
  setSelectedFile: (file: string | null) => void;
  setActiveTab: (tab: TabName) => void;
  setLogVisible: (v: boolean | ((prev: boolean) => boolean)) => void;
  setZoomLevel: (level: number) => void;

  // ---- Entry updates ----
  updateEntry: (entryId: string, updates: Record<string, any>) => void;
  batchUpdate: (updates: Array<{ id: string; [key: string]: any }>) => void;

  // ---- Glossary / Keywords updates ----
  updateGlossary: (glossary: GlossaryEntry[]) => void;
  updateKeywords: (keywords: KeywordEntry[]) => void;
  updateProjectFields: (fields: Partial<Project>) => void;

  // ---- Project IPC actions ----
  createProject: () => Promise<ApiResult<Project> | undefined>;
  loadProject: () => Promise<ApiResult<Project> | null>;
  saveProject: () => Promise<ApiResult<{ projectFilePath: string }> | null>;
  autoSave: () => Promise<void>;
  exportMod: () => Promise<ApiResult<{ outputPath: string }> | null>;

  // ---- Auto-save timer management ----
  _autoSaveTimer: NodeJS.Timeout | null;
  startAutoSave: () => void;
  stopAutoSave: () => void;
}

/**
 * Zustand store – single source of truth for all project state and UI state.
 * All Electron IPC interactions are encapsulated here so that components
 * only need to read state and call actions, with no direct IPC usage for
 * project-level operations.
 */
const useProjectStore = create<ProjectStore>((set, get) => ({
  // ---- Core project state ----
  project: null,
  selectedFile: null,

  // ---- UI state ----
  activeTab: 'editor',
  zoomLevel: (() => {
    if (typeof localStorage === 'undefined') return DEFAULT_ZOOM_LEVEL;
    return clampZoom(localStorage.getItem('ss_translator_zoom_level'));
  })(),
  logVisible: false,

  // ---- Simple setters ----
  setProject: (project) => set({ project }),
  setSelectedFile: (file) => set({ selectedFile: file }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setLogVisible: (v) => set({ logVisible: typeof v === 'function' ? v(get().logVisible) : v }),

  setZoomLevel: (level) => {
    const clamped = clampZoom(level);
    set({ zoomLevel: clamped });
    localStorage.setItem('ss_translator_zoom_level', String(clamped));
    if (api?.setZoomFactor) api.setZoomFactor(clamped / 100);
  },

  // ---- Entry updates ----
  updateEntry: (entryId, updates) => {
    set((state) => {
      if (!state.project) return state;
      const newEntries = state.project.entries.map((e) =>
        e.id === entryId ? { ...e, ...updates } : e
      );
      return { project: { ...state.project, entries: newEntries } };
    });
  },

  batchUpdate: (updates) => {
    set((state) => {
      if (!state.project) return state;
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      const newEntries = state.project.entries.map((e) => {
        const upd = updateMap.get(e.id);
        return upd ? { ...e, ...upd } : e;
      });
      return { project: { ...state.project, entries: newEntries } };
    });
  },

  // ---- Glossary / Keywords updates ----
  updateGlossary: (glossary) => {
    set((state) => (state.project ? { project: { ...state.project, glossary } } : state));
  },

  updateKeywords: (keywords) => {
    set((state) => (state.project ? { project: { ...state.project, keywords } } : state));
  },

  updateProjectFields: (fields) => {
    set((state) => (state.project ? { project: { ...state.project, ...fields } } : state));
  },

  // ---- Project IPC actions ----
  /** Create a new empty project via IPC */
  createProject: async () => {
    if (!api) return undefined;
    const result = await api.createEmptyProject();
    if (result?.success) {
      set({ project: result.data, selectedFile: null, activeTab: 'info' });
    }
    return result;
  },

  /** Open an existing project file via IPC (shows file picker) */
  loadProject: async () => {
    if (!api) return null;
    const result = await api.loadProject();
    if (!result) return null; // user cancelled
    if (result.success) {
      set({ project: result.data, selectedFile: null, activeTab: 'editor' });
    }
    return result;
  },

  /** Save current project via IPC (may show file picker) */
  saveProject: async () => {
    if (!api) return null;
    const { project } = get();
    if (!project) return null;
    const result = await api.saveProject(project);
    if (result?.success && result.data?.projectFilePath) {
      get().updateProjectFields({ projectFilePath: result.data.projectFilePath });
    }
    return result;
  },

  /** Silent auto-save (no dialogs, no error popups) */
  autoSave: async () => {
    if (!api) return;
    const { project } = get();
    if (!project) return;
    if (!project.projectFilePath && !project.modPath) return;
    try {
      const result = await api.autoSaveProject(project);
      if (result?.success && result.data?.projectFilePath) {
        get().updateProjectFields({ projectFilePath: result.data.projectFilePath });
      }
    } catch {
      // silent failure for auto-save
    }
  },

  /** Export translated MOD via IPC */
  exportMod: async () => {
    if (!api) return null;
    const { project } = get();
    if (!project) return null;
    return await api.exportMod({ projectData: project });
  },

  // ---- Auto-save timer management ----
  _autoSaveTimer: null,

  startAutoSave: () => {
    const existing = get()._autoSaveTimer;
    if (existing) clearInterval(existing);
    const timer = setInterval(() => get().autoSave(), AUTO_SAVE_INTERVAL_MS);
    set({ _autoSaveTimer: timer });
  },

  stopAutoSave: () => {
    const timer = get()._autoSaveTimer;
    if (timer) {
      clearInterval(timer);
      set({ _autoSaveTimer: null });
    }
  },
}));

export default useProjectStore;
