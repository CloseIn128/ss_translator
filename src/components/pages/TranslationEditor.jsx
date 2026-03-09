import React, { useState, useMemo, useEffect } from 'react';
import { Button } from 'antd';
import FileSidebar from './editor/FileSidebar';
import EditorHeader from './editor/EditorHeader';
import EntryRow from './editor/EntryRow';
import FileDiffView from './editor/FileDiffView';
import useTranslationActions from './editor/useTranslationActions';

const PAGE_SIZE = 50;

export default function TranslationEditor({
  project,
  selectedFile,
  onSelectFile,
  onUpdateEntry,
  onBatchUpdate,
  messageApi,
}) {
  // Merge project glossary with keywords — only confirmed (reviewed) terms are included
  const mergedGlossary = useMemo(() => {
    const glossary = project.glossary || [];
    const keywords = project.keywords || [];
    const confirmedGlossary = glossary
      .filter(g => g.confirmed && g.target && g.target.trim())
      .map(g => ({ source: g.source, target: g.target, category: g.category || '通用' }));
    const existingSources = new Set(confirmedGlossary.map(g => g.source.toLowerCase()));
    const keywordGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim() && !existingSources.has(kw.source.toLowerCase()))
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category || '通用' }));
    return [...confirmedGlossary, ...keywordGlossary];
  }, [project.glossary, project.keywords]);

  // Count unreviewed terms
  const unreviewedTermCount = useMemo(() => {
    const glossary = project.glossary || [];
    const keywords = project.keywords || [];
    return glossary.filter(g => !g.confirmed).length + keywords.filter(kw => !kw.confirmed).length;
  }, [project.glossary, project.keywords]);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Build available category list
  const categories = useMemo(() => {
    const cats = new Set(project.entries.map(e => e.category).filter(Boolean));
    return ['all', ...[...cats].sort()];
  }, [project.entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let entries = project.entries;

    if (selectedFile) {
      entries = entries.filter(e => e.file === selectedFile);
    }
    if (categoryFilter !== 'all') {
      entries = entries.filter(e => e.category === categoryFilter);
    }
    if (statusFilter !== 'all') {
      entries = entries.filter(e => e.status === statusFilter);
    }
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      entries = entries.filter(e =>
        e.original?.toLowerCase().includes(lower) ||
        e.translated?.toLowerCase().includes(lower) ||
        e.context?.toLowerCase().includes(lower) ||
        e.id?.toLowerCase().includes(lower)
      );
    }

    return entries;
  }, [project.entries, selectedFile, categoryFilter, statusFilter, searchText]);

  // Paginate
  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const pageEntries = filteredEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [selectedFile, categoryFilter, statusFilter, searchText]);

  // Stats for current filter
  const stats = useMemo(() => {
    const total = filteredEntries.length;
    const translated = filteredEntries.filter(
      e => e.status !== 'untranslated' && e.status !== 'error'
    ).length;
    return { total, translated };
  }, [filteredEntries]);

  // Translation action hooks
  const {
    translatingIds,
    batchTranslating,
    isTaskRunning,
    handleTranslate,
    handlePolish,
    handleClearTranslations,
    handleBatchTranslate,
    handleBatchPolish,
  } = useTranslationActions({
    project,
    filteredEntries,
    mergedGlossary,
    onUpdateEntry,
    onBatchUpdate,
    messageApi,
  });

  return (
    <div className="editor-layout">
      <FileSidebar
        entries={project.entries}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
      />

      <div className="editor-main">
        <EditorHeader
          stats={stats}
          unreviewedTermCount={unreviewedTermCount}
          filteredCount={filteredEntries.length}
          searchText={searchText}
          onSearchChange={setSearchText}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          categories={categories}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          batchTranslating={batchTranslating}
          isTaskRunning={isTaskRunning}
          onBatchTranslate={handleBatchTranslate}
          onBatchPolish={handleBatchPolish}
          onClearTranslations={handleClearTranslations}
        />

        {/* File diff view (when a specific file is selected) */}
        <FileDiffView
          modPath={project.modPath}
          selectedFile={selectedFile}
          entries={project.entries}
        />

        {/* Scrollable entries area */}
        <div className="editor-entries">
          <div className="translation-table">
            {pageEntries.map(entry => (
              <EntryRow
                key={entry.id}
                entry={entry}
                isTranslating={translatingIds.has(entry.id)}
                onUpdateEntry={onUpdateEntry}
                onTranslate={handleTranslate}
                onPolish={handlePolish}
              />
            ))}

            {pageEntries.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
                没有匹配的条目
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 16 }}>
              <Button size="small" disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}>上一页</Button>
              <span style={{ fontSize: 13, lineHeight: '24px', color: '#8c8c8c' }}>
                {currentPage} / {totalPages}
              </span>
              <Button size="small" disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}>下一页</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


