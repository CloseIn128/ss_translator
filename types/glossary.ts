/**
 * Glossary service types
 */

export interface GlossaryEntry {
  id?: string;
  source: string;
  target: string;
  category: string;
  createdAt?: number;
  confirmed?: boolean;
}

export interface GlossaryImportEntry {
  source: string;
  target: string;
  category?: string;
}
