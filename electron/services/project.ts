/**
 * Project Manager
 *
 * Manages translation project files (.sst format)
 * A project bundles: mod info, all translatable entries with translations,
 * glossary, and AI configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseModFolder } from './modParser';
import { v4 as uuidv4 } from './uuid';
import type { Project, ProjectStats, TranslationEntry, ParsedModData } from '../../types/project';

class ProjectManager {
  private currentProject: Project | null;

  constructor() {
    this.currentProject = null;
  }

  /**
   * Create a new empty project (no mod folder yet).
   * The user can later set modPath via the project info page.
   */
  createEmptyProject(): Project {
    const project: Project = {
      id: uuidv4(),
      version: '1.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modInfo: {},
      modPath: '',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      entries: [],
      glossary: [],
      keywords: [],
      aiConfig: {},
      stats: { total: 0, translated: 0, polished: 0, byFile: {}, byType: {} },
      projectFilePath: null,
      legacyModPath: '',
      outputDir: '',
      modPrompt: '',
    };

    this.currentProject = project;
    return project;
  }

  /**
   * Create a new project from a mod folder
   */
  async createProject(modPath: string): Promise<Project> {
    const parsed = await parseModFolder(modPath) as ParsedModData;

    const project: Project = {
      id: uuidv4(),
      version: '1.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modInfo: parsed.modInfo,
      modPath: parsed.modPath,
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      entries: parsed.entries,
      glossary: [],
      keywords: [],
      aiConfig: {},
      stats: parsed.stats,
      projectFilePath: null,
      legacyModPath: '',
      outputDir: '',
      modPrompt: '',
    };

    this.currentProject = project;
    return project;
  }

  /**
   * Save project to file
   */
  async saveProject(projectData: Project): Promise<Project> {
    if (!projectData.projectFilePath) {
      // Generate default save path next to mod folder
      const modDir = path.dirname(projectData.modPath);
      const modName = projectData.modInfo.name || projectData.modInfo.id || 'mod';
      const safeName = modName.replace(/[^a-zA-Z0-9_\-]/g, '_');
      projectData.projectFilePath = path.join(modDir, `${safeName}_translation.sst`);
    }

    projectData.updatedAt = Date.now();
    projectData.stats = this._computeStats(projectData.entries);

    const json = JSON.stringify(projectData, null, 2);
    fs.writeFileSync(projectData.projectFilePath, json, 'utf-8');

    this.currentProject = projectData;
    return projectData;
  }

  /**
   * Load project from file
   */
  async loadProject(filePath: string): Promise<Project> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const project: Project = JSON.parse(content);
    project.projectFilePath = filePath;
    project.stats = this._computeStats(project.entries);

    this.currentProject = project;
    return project;
  }

  private _computeStats(entries: TranslationEntry[]): ProjectStats {
    const byFile: Record<string, { total: number; translated: number }> = {};
    const byType: Record<string, { total: number; translated: number }> = {};
    let total = 0;
    let translated = 0;
    let polished = 0;

    for (const entry of entries) {
      if (entry.ignored) continue;

      total++;
      const file = entry.file;
      if (!byFile[file]) byFile[file] = { total: 0, translated: 0 };
      byFile[file].total++;

      const type = entry.csvFileName || entry.fileType;
      if (!byType[type]) byType[type] = { total: 0, translated: 0 };
      byType[type].total++;

      if (entry.status !== 'untranslated' && entry.status !== 'error') {
        translated++;
        byFile[file].translated++;
        byType[type].translated++;
      }
      if (entry.status === 'polished' || entry.status === 'reviewed') {
        polished++;
      }
    }

    return { total, translated, polished, byFile, byType };
  }
}

module.exports = { ProjectManager };
