import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button, Input, Tag, Card, Select, Empty, Tooltip, Divider, Spin } from 'antd';
import {
  CheckOutlined,
  LeftOutlined,
  RightOutlined,
  TranslationOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { MessageInstance } from 'antd/es/message/interface';
import type { TranslationEntry } from '../../../types/project';
import DiffViewer from '../../components/diff/DiffViewer';
import useProjectStore from '../../store/useProjectStore';

const api = window.electronAPI;

const CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '战舰系统', '游戏术语', '人名/地名', '其他'];
const KEYWORD_CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '人名', '星球/星系名', '游戏术语', '物品名称', '其他'];
const allCategories = [...new Set([...CATEGORIES, ...KEYWORD_CATEGORIES])];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  untranslated: { label: '未翻译', color: 'default' },
  translated: { label: '已翻译', color: 'success' },
  polished: { label: '已润色', color: 'processing' },
  reviewed: { label: '已审核', color: 'warning' },
  error: { label: '错误', color: 'error' },
};

interface ReviewTermItem {
  _type: 'glossary' | 'extracted';
  _rowKey: string;
  id?: string;
  source: string;
  target: string;
  category: string;
  confirmed?: boolean;
  key?: string;
  extractType?: string;
  context?: string;
  file?: string;
}

/**
 * Detect file type from relative path.
 */
function detectFileType(relFile: string) {
  if (!relFile) return 'text';
  const lower = relFile.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (
    lower.endsWith('.json') ||
    lower.endsWith('.faction') ||
    lower.endsWith('.ship') ||
    lower.endsWith('.skin') ||
    lower.endsWith('.variant') ||
    lower.endsWith('.skill')
  ) return 'json';
  return 'text';
}

interface ReviewPanelProps {
  messageApi: MessageInstance;
}

export default function ReviewPanel({ messageApi }: ReviewPanelProps) {
  const project = useProjectStore(s => s.project);
  const onUpdateGlossary = useProjectStore(s => s.updateGlossary);
  const onUpdateKeywords = useProjectStore(s => s.updateKeywords);
  const onUpdateEntry = useProjectStore(s => s.updateEntry);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editTarget, setEditTarget] = useState('');
  const [editCategory, setEditCategory] = useState('通用');
  const [translating, setTranslating] = useState(false);
  const [reviewMode, setReviewMode] = useState('terms'); // 'terms' | 'entries'

  // Diff preview state for entry review
  const [diffOriginal, setDiffOriginal] = useState('');
  const [diffTranslated, setDiffTranslated] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);

  const glossary = project?.glossary || [];
  const keywords = project?.keywords || [];
  const entries = project?.entries || [];

  // Build merged glossary for translation context (only confirmed terms)
  const confirmedGlossary = useMemo(() => {
    const g = glossary.filter(item => item.confirmed && item.target && item.target.trim());
    const kw = keywords.filter(item => item.confirmed && item.target && item.target.trim());
    const existingSources = new Set(g.map(item => item.source.toLowerCase()));
    const kwGlossary = kw
      .filter(item => !existingSources.has(item.source.toLowerCase()))
      .map(item => ({ source: item.source, target: item.target, category: item.category || '通用' }));
    return [...g.map(item => ({ source: item.source, target: item.target, category: item.category || '通用' })), ...kwGlossary];
  }, [glossary, keywords]);

  // Unreviewed terms (both glossary entries and keywords without confirmed)
  const unreviewedTerms = useMemo<ReviewTermItem[]>(() => {
    const items: ReviewTermItem[] = [];
    for (const g of glossary) {
      if (!g.confirmed) {
        items.push({ ...g, _type: 'glossary', _rowKey: `g_${g.id}` });
      }
    }
    for (const kw of keywords) {
      if (!kw.confirmed) {
        items.push({ ...kw, _type: 'extracted', _rowKey: kw.key || `k_${kw.source}` });
      }
    }
    return items;
  }, [glossary, keywords]);

  // Unreviewed entries (entries with status !== 'reviewed')
  const unreviewedEntries = useMemo(() => {
    return entries.filter(e => e.status !== 'reviewed' && e.translated && e.translated.trim());
  }, [entries]);

  const currentItems: (ReviewTermItem | TranslationEntry)[] = reviewMode === 'terms' ? unreviewedTerms : unreviewedEntries;
  const currentItem = currentItems[currentIndex] || null;

  // Stable keys for diff preview dependency tracking
  const currentFileKey = reviewMode === 'entries' && currentItem && 'file' in currentItem ? currentItem.file : '';
  const currentItemId = currentItem && 'id' in currentItem ? currentItem.id : currentIndex;

  // Load diff preview for current entry
  useEffect(() => {
    if (reviewMode !== 'entries' || !currentItem || !('file' in currentItem) || !currentItem.file || !project?.modPath) {
      setDiffOriginal('');
      setDiffTranslated('');
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    const currentFile = currentItem.file;
    const fileEntries = entries.filter(e => e.file === currentFile);
    api.getFilePreview({ modPath: project.modPath, relFile: currentFile, entries: fileEntries })
      .then(result => {
        if (cancelled) return;
        if (result?.success && result.data) {
          setDiffOriginal(result.data.original);
          setDiffTranslated(result.data.translated);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDiffLoading(false); });
    return () => { cancelled = true; };
  }, [currentFileKey, currentItemId, reviewMode, project?.modPath, entries]);

  // Sync edit values when current item changes
  useEffect(() => {
    if (!currentItem) {
      setEditTarget('');
      setEditCategory('通用');
      return;
    }
    if (reviewMode === 'terms') {
      const termItem = currentItem as ReviewTermItem;
      setEditTarget(termItem.target || '');
      setEditCategory(termItem.category || '通用');
    } else {
      const entryItem = currentItem as TranslationEntry;
      setEditTarget(entryItem.translated || '');
      setEditCategory(entryItem.category || '通用');
    }
  }, [currentItem, currentIndex, reviewMode]);

  // Reset index when mode changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [reviewMode]);

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < currentItems.length - 1) setCurrentIndex(currentIndex + 1);
  };

  // Approve current item
  const handleApprove = useCallback(() => {
    if (!currentItem) return;
    if (reviewMode === 'terms') {
      const termItem = currentItem as ReviewTermItem;
      if (termItem._type === 'glossary') {
        onUpdateGlossary(glossary.map(g =>
          g.id === termItem.id ? { ...g, confirmed: true, target: editTarget, category: editCategory } : g
        ));
      } else {
        onUpdateKeywords(keywords.map(kw =>
          (kw.key || `k_${kw.source}`) === termItem._rowKey
            ? { ...kw, confirmed: true, target: editTarget, category: editCategory }
            : kw
        ));
      }
      messageApi.success('术语已审核');
    } else {
      const entryItem = currentItem as TranslationEntry;
      onUpdateEntry(entryItem.id, { translated: editTarget, status: 'reviewed' });
      messageApi.success('条目已审核');
    }
    if (currentIndex >= currentItems.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentItem, currentIndex, currentItems, reviewMode, editTarget, editCategory, glossary, keywords, onUpdateGlossary, onUpdateKeywords, onUpdateEntry, messageApi]);

  // Translate current item via API
  const handleTranslate = useCallback(async () => {
    if (!currentItem) return;
    setTranslating(true);
    try {
      const sourceText = reviewMode === 'terms'
        ? (currentItem as ReviewTermItem).source
        : (currentItem as TranslationEntry).original;
      const result = await api.translate({
        entries: [{ id: 'review_single', source: sourceText, context: ('context' in currentItem ? currentItem.context : '') || '' }],
        glossary: confirmedGlossary,
        modPrompt: project?.modPrompt || '',
      });
      if (result?.success && result.data?.[0]?.translated) {
        setEditTarget(result.data[0].translated);
        messageApi.success('翻译完成');
      } else {
        messageApi.error(result?.error || '翻译失败');
      }
    } catch (err: unknown) {
      messageApi.error('翻译出错: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTranslating(false);
    }
  }, [currentItem, reviewMode, confirmedGlossary, project?.modPrompt, messageApi]);

  if (!project) {
    return <Empty description="请先加载项目" />;
  }

  return (
    <div className="centered-page-container">
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 16 }}>
        {/* Mode selector and stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Select
            value={reviewMode}
            onChange={setReviewMode}
            style={{ width: 160 }}
            size="small"
            options={[
              { value: 'terms', label: `术语审核 (${unreviewedTerms.length})` },
              { value: 'entries', label: `条目审核 (${unreviewedEntries.length})` },
            ]}
          />
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>
            {reviewMode === 'terms'
              ? `${unreviewedTerms.length} 个术语待审核`
              : `${unreviewedEntries.length} 个条目待审核`
            }
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#8c8c8c' }}>
            {currentItems.length > 0 ? `${currentIndex + 1} / ${currentItems.length}` : '无待审核项'}
          </span>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <Button
            size="small"
            icon={<LeftOutlined />}
            onClick={handlePrev}
            disabled={currentIndex <= 0 || currentItems.length === 0}
          >
            上一个
          </Button>
          <Button
            size="small"
            icon={<RightOutlined />}
            onClick={handleNext}
            disabled={currentIndex >= currentItems.length - 1 || currentItems.length === 0}
          >
            下一个
          </Button>
          <Divider type="vertical" />
          <Tooltip title="使用AI翻译当前项">
            <Button
              size="small"
              icon={<TranslationOutlined />}
              onClick={handleTranslate}
              loading={translating}
              disabled={!currentItem}
            >
              AI翻译
            </Button>
          </Tooltip>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleApprove}
            disabled={!currentItem || !editTarget.trim()}
          >
            审核通过
          </Button>
        </div>

        {/* Diff preview for entry review */}
        {reviewMode === 'entries' && currentItem && 'file' in currentItem && currentItem.file && (
          <div style={{ flexShrink: 0, border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ padding: '4px 12px', fontSize: 12, color: '#8c8c8c', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
              <FileTextOutlined style={{ marginRight: 4 }} />
              文件差异预览 — {currentItem.file}
            </div>
            {diffLoading ? (
              <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
            ) : (
              <DiffViewer
                original={diffOriginal}
                translated={diffTranslated}
                fileType={detectFileType(currentItem.file)}
                height="200px"
              />
            )}
          </div>
        )}

        {/* Current item display */}
        {currentItem ? (
          <Card size="small" style={{ flexShrink: 0 }}>
            {/* Source info */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Tag color={reviewMode === 'terms'
                  ? ((currentItem as ReviewTermItem)._type === 'glossary' ? 'green' : 'blue')
                  : STATUS_MAP[(currentItem as TranslationEntry).status]?.color || 'default'
                }>
                  {reviewMode === 'terms'
                    ? ((currentItem as ReviewTermItem)._type === 'glossary' ? '手动术语' : '提取术语')
                    : STATUS_MAP[(currentItem as TranslationEntry).status]?.label || (currentItem as TranslationEntry).status
                  }
                </Tag>
                {currentItem.category && (
                  <Tag>{currentItem.category}</Tag>
                )}
                {reviewMode === 'entries' && 'file' in currentItem && currentItem.file && (
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                    <FileTextOutlined style={{ marginRight: 4 }} />
                    {currentItem.file}
                  </span>
                )}
                {reviewMode === 'terms' && 'extractType' in currentItem && currentItem.extractType && (
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                    提取方式: {currentItem.extractType === 'structure' ? '结构化' : 'AI'}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>原文</div>
              <div style={{
                padding: '8px 12px',
                background: 'var(--bg-card, #1f1f1f)',
                borderRadius: 4,
                fontSize: 13,
                lineHeight: 1.6,
                wordBreak: 'break-all',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {reviewMode === 'terms' ? (currentItem as ReviewTermItem).source : (currentItem as TranslationEntry).original}
              </div>
            </div>

            {/* Context info for entries */}
            {reviewMode === 'entries' && 'context' in currentItem && currentItem.context && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4, color: '#8c8c8c' }}>上下文</div>
                <div style={{
                  padding: '6px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  fontSize: 12,
                  color: '#8c8c8c',
                  lineHeight: 1.5,
                  wordBreak: 'break-all',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {currentItem.context}
                </div>
              </div>
            )}

            {/* Editable translation */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>译文</div>
              <Input.TextArea
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                rows={reviewMode === 'entries' ? 3 : 1}
                placeholder="输入或编辑译文..."
                style={{ fontSize: 13 }}
              />
            </div>

            {/* Category editor for terms */}
            {reviewMode === 'terms' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>分类</div>
                <Select
                  value={editCategory}
                  onChange={setEditCategory}
                  style={{ width: 200 }}
                  size="small"
                  options={allCategories.map(c => ({ value: c, label: c }))}
                />
              </div>
            )}
          </Card>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty
              description={
                reviewMode === 'terms'
                  ? '所有术语已审核完毕'
                  : '没有待审核的已翻译条目'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
