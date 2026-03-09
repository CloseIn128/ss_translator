import { create } from 'zustand';

/**
 * Zustand store for project-level state.
 * Replaces heavy prop-drilling of project, selectedFile, and update callbacks
 * from App → TranslationEditor → EditorHeader / FileSidebar / EntryRow etc.
 */
const useProjectStore = create((set, get) => ({
  // ---- Core project state ----
  project: null,
  selectedFile: null,

  setProject: (project) => set({ project }),
  setSelectedFile: (file) => set({ selectedFile: file }),

  // ---- Entry updates ----
  updateEntry: (entryId, updates) => {
    set(state => {
      if (!state.project) return state;
      const newEntries = state.project.entries.map(e =>
        e.id === entryId ? { ...e, ...updates } : e
      );
      return { project: { ...state.project, entries: newEntries } };
    });
  },

  batchUpdate: (updates) => {
    set(state => {
      if (!state.project) return state;
      const updateMap = new Map(updates.map(u => [u.id, u]));
      const newEntries = state.project.entries.map(e => {
        const upd = updateMap.get(e.id);
        return upd ? { ...e, ...upd } : e;
      });
      return { project: { ...state.project, entries: newEntries } };
    });
  },

  // ---- Glossary / Keywords updates ----
  updateGlossary: (glossary) => {
    set(state => state.project ? { project: { ...state.project, glossary } } : state);
  },

  updateKeywords: (keywords) => {
    set(state => state.project ? { project: { ...state.project, keywords } } : state);
  },

  updateProjectFields: (fields) => {
    set(state => state.project ? { project: { ...state.project, ...fields } } : state);
  },
}));

export default useProjectStore;
