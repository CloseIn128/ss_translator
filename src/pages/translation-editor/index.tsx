import { useState, useMemo, useEffect } from 'react';
import { Alert, Button } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { MessageInstance } from 'antd/es/message/interface';
import FileSidebar from './FileSidebar';
import EditorHeader from './EditorHeader';
import EntryRow from './EntryRow';
import FileDiffView from './FileDiffView';
import useTranslationActions from './useTranslationActions';
import useProjectStore from '../../store/useProjectStore';

const PAGE_SIZE = 50;

interface TranslationEditorProps {
  messageApi: MessageInstance;
}

export default function TranslationEditor({ messageApi }: TranslationEditorProps) {
  const project = useProjectStore(s => s.project);
  const selectedFile = useProjectStore(s => s.selectedFile);
  const setSelectedFile = useProjectStore(s => s.setSelectedFile);
  const updateEntry = useProjectStore(s => s.updateEntry);
  const batchUpdate = useProjectStore(s => s.batchUpdate);

  // Toggle between entry editing and diff comparison mode
  const [diffMode, setDiffMode] = useState(false);

  // Merge project glossary with keywords — only confirmed (reviewed) terms are included
  const mergedGlossary = useMemo(() => {
    const glossary = project?.glossary || [];
    const keywords = project?.keywords || [];
    const confirmedGlossary = glossary
      .filter(g => g.confirmed && g.target && g.target.trim())
      .map(g => ({ source: g.source, target: g.target, category: g.category || '通用' }));
    const existingSources = new Set(confirmedGlossary.map(g => g.source.toLowerCase()));
    const keywordGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim() && !existingSources.has(kw.source.toLowerCase()))
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category || '通用' }));
    return [...confirmedGlossary, ...keywordGlossary];
  }, [project?.glossary, project?.keywords]);

  // Count untranslated terms (terms missing translation)
  const untranslatedTermCount = useMemo(() => {
    const glossary = project?.glossary || [];
    const keywords = project?.keywords || [];
    return glossary.filter(g => !g.target || !g.target.trim()).length +
      keywords.filter(kw => !kw.target || !kw.target.trim()).length;
  }, [project?.glossary, project?.keywords]);

  // Dismissible banner state
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Reset banner when untranslated count changes (e.g., after translating terms)
  useEffect(() => { setBannerDismissed(false); }, [untranslatedTermCount]);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showIgnored, setShowIgnored] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Active entries = non-ignored entries (used for sidebar stats and category building)
  const activeEntries = useMemo(() => {
    return (project?.entries || []).filter(e => !e.ignored);
  }, [project?.entries]);

  // Build available category list (only from active entries)
  const categories = useMemo(() => {
    const cats = new Set(activeEntries.map(e => e.category).filter(Boolean));
    return ['all', ...[...cats].sort()];
  }, [activeEntries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let entries = project?.entries || [];

    // Hide ignored entries by default
    if (!showIgnored) {
      entries = entries.filter(e => !e.ignored);
    }

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
  }, [project?.entries, selectedFile, categoryFilter, statusFilter, searchText, showIgnored]);

  // Paginate
  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const pageEntries = filteredEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [selectedFile, categoryFilter, statusFilter, searchText, showIgnored]);

  // Stats for current filter (exclude ignored from stats)
  const stats = useMemo(() => {
    const nonIgnored = filteredEntries.filter(e => !e.ignored);
    const total = nonIgnored.length;
    const translated = nonIgnored.filter(
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
    onUpdateEntry: updateEntry,
    onBatchUpdate: batchUpdate,
    messageApi,
  });

  return (
    <div className="editor-layout">
      <FileSidebar
        entries={activeEntries}
        selectedFile={selectedFile}
        onSelectFile={setSelectedFile}
      />

      <div className="editor-main">
        {/* Untranslated terms banner */}
        {untranslatedTermCount > 0 && !bannerDismissed && (
          <Alert
            message={
              <span>
                <WarningOutlined style={{ marginRight: 8 }} />
                还有 <strong>{untranslatedTermCount}</strong> 个术语尚未翻译，建议先在术语管理中完成翻译
              </span>
            }
            type="warning"
            closable
            onClose={() => setBannerDismissed(true)}
            style={{ borderRadius: 0, flexShrink: 0 }}
            banner
          />
        )}

        <EditorHeader
          stats={stats}
          filteredCount={filteredEntries.length}
          searchText={searchText}
          onSearchChange={setSearchText}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          categories={categories}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          showIgnored={showIgnored}
          onShowIgnoredChange={setShowIgnored}
          batchTranslating={batchTranslating}
          isTaskRunning={isTaskRunning}
          onBatchTranslate={handleBatchTranslate}
          onBatchPolish={handleBatchPolish}
          onClearTranslations={handleClearTranslations}
          diffMode={diffMode}
          onDiffModeChange={setDiffMode}
        />

        {diffMode ? (
          /* Full diff comparison mode — replaces entry list */
          <FileDiffView
            modPath={project?.modPath || ''}
            selectedFile={selectedFile}
            entries={project?.entries || []}
            fullPage
          />
        ) : (
          <>
            {/* Compact file diff view (when a specific file is selected) */}
            <FileDiffView
              modPath={project?.modPath || ''}
              selectedFile={selectedFile}
              entries={project?.entries || []}
            />

            {/* Scrollable entries area */}
            <div className="editor-entries">
              <div className="translation-table">
                {pageEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    isTranslating={translatingIds.has(entry.id)}
                    onUpdateEntry={updateEntry}
                    onTranslate={handleTranslate}
                    onPolish={handlePolish}
                  />
                ))}

                {pageEntries.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#8c8c8c' }}>
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
          </>
        )}
      </div>
    </div>
  );
}
