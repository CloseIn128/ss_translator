/**
 * Glossary Manager - 名词库管理
 *
 * Manages translation glossary/terminology pairs stored in JSON files.
 * Each project has its own glossary.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from './uuid';
import type { GlossaryEntry, GlossaryImportEntry } from '../../types/glossary';

interface AddEntryInput {
  projectId: string;
  source: string;
  target: string;
  category?: string;
}

interface UpdateEntryInput {
  projectId: string;
  id: string;
  source: string;
  target: string;
  category: string;
}

export class GlossaryManager {
  private glossaries: Map<string, GlossaryEntry[]>;

  constructor() {
    this.glossaries = new Map(); // projectId -> entries[]
  }

  /**
   * Get all glossary entries for a project
   */
  getAll(projectId: string): GlossaryEntry[] {
    return this.glossaries.get(projectId) || [];
  }

  /**
   * Add a new glossary entry
   */
  add(entry: AddEntryInput): GlossaryEntry {
    const { projectId, source, target, category = '通用' } = entry;
    if (!this.glossaries.has(projectId)) {
      this.glossaries.set(projectId, []);
    }
    const newEntry: GlossaryEntry = {
      id: uuidv4(),
      source,
      target,
      category,
      createdAt: Date.now(),
    };
    this.glossaries.get(projectId)!.push(newEntry);
    return newEntry;
  }

  /**
   * Update an existing glossary entry
   */
  update(entry: UpdateEntryInput): GlossaryEntry | null {
    const { projectId, id, source, target, category } = entry;
    const entries = this.glossaries.get(projectId);
    if (!entries) return null;

    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;

    entries[idx] = { ...entries[idx], source, target, category };
    return entries[idx];
  }

  /**
   * Remove a glossary entry
   */
  remove(id: string): boolean {
    for (const [projectId, entries] of this.glossaries) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx !== -1) {
        entries.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Import glossary from CSV file
   * Expected format: source,target,category
   */
  async importFromCSV(csvPath: string, projectId: string): Promise<{ imported: number; entries: GlossaryEntry[] }> {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const imported: GlossaryEntry[] = [];

    // Skip header if it looks like one
    const start = lines[0] && lines[0].includes('source') ? 1 : 0;

    if (!this.glossaries.has(projectId)) {
      this.glossaries.set(projectId, []);
    }

    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const newEntry: GlossaryEntry = {
          id: uuidv4(),
          source: parts[0],
          target: parts[1],
          category: parts[2] || '通用',
          createdAt: Date.now(),
        };
        this.glossaries.get(projectId)!.push(newEntry);
        imported.push(newEntry);
      }
    }

    return { imported: imported.length, entries: imported };
  }

  /**
   * Export glossary to CSV file
   */
  async exportToCSV(csvPath: string, projectId: string): Promise<{ exported: number }> {
    const entries = this.glossaries.get(projectId) || [];
    const lines = ['source,target,category'];
    for (const entry of entries) {
      const s = entry.source.includes(',') ? `"${entry.source}"` : entry.source;
      const t = entry.target.includes(',') ? `"${entry.target}"` : entry.target;
      lines.push(`${s},${t},${entry.category}`);
    }
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf-8');
    return { exported: entries.length };
  }

  /**
   * Load glossary data (used when loading a project)
   */
  loadForProject(projectId: string, entries: GlossaryEntry[]): void {
    this.glossaries.set(projectId, entries || []);
  }

  /**
   * Get glossary as prompt-ready text for AI translation
   */
  getAsPromptText(projectId: string): string {
    const entries = this.glossaries.get(projectId) || [];
    if (entries.length === 0) return '';

    const grouped: Record<string, GlossaryEntry[]> = {};
    for (const e of entries) {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    }

    let text = '【名词对照表/术语库】\n';
    for (const [cat, items] of Object.entries(grouped)) {
      text += `[${cat}]\n`;
      for (const item of items) {
        text += `  "${item.source}" → "${item.target}"\n`;
      }
    }
    return text;
  }
}

// CommonJS compatibility
module.exports = { GlossaryManager };
