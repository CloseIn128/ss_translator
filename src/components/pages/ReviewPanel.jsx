import React, { useState, useMemo, useCallback } from 'react';
import { Button, Input, Tag, Space, Card, Select, Empty, Tooltip, Divider } from 'antd';
import {
  CheckOutlined,
  LeftOutlined,
  RightOutlined,
  TranslationOutlined,
  EditOutlined,
  FileTextOutlined,
  BookOutlined,
} from '@ant-design/icons';
import useProjectStore from '../../store/useProjectStore';

const api = window.electronAPI;

const CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '战舰系统', '游戏术语', '人名/地名', '其他'];
const KEYWORD_CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '人名', '星球/星系名', '游戏术语', '物品名称', '其他'];
const allCategories = [...new Set([...CATEGORIES, ...KEYWORD_CATEGORIES])];

const STATUS_MAP = {
  untranslated: { label: '未翻译', color: 'default' },
  translated: { label: '已翻译', color: 'success' },
  polished: { label: '已润色', color: 'processing' },
  reviewed: { label: '已审核', color: 'warning' },
  error: { label: '错误', color: 'error' },
};

export default function ReviewPanel({ messageApi }) {
  const project = useProjectStore(s => s.project);
  const onUpdateGlossary = useProjectStore(s => s.updateGlossary);
  const onUpdateKeywords = useProjectStore(s => s.updateKeywords);
  const onUpdateEntry = useProjectStore(s => s.updateEntry);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editTarget, setEditTarget] = useState('');
  const [editCategory, setEditCategory] = useState('通用');
  const [translating, setTranslating] = useState(false);
  const [reviewMode, setReviewMode] = useState('terms'); // 'terms' | 'entries'

  const glossary = project.glossary || [];
  const keywords = project.keywords || [];
  const entries = project.entries || [];

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
  const unreviewedTerms = useMemo(() => {
    const items = [];
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

  const currentItems = reviewMode === 'terms' ? unreviewedTerms : unreviewedEntries;
  const currentItem = currentItems[currentIndex] || null;

  // Sync edit values when current item changes
  React.useEffect(() => {
    if (!currentItem) {
      setEditTarget('');
      setEditCategory('通用');
      return;
    }
    if (reviewMode === 'terms') {
      setEditTarget(currentItem.target || '');
      setEditCategory(currentItem.category || '通用');
    } else {
      setEditTarget(currentItem.translated || '');
      setEditCategory(currentItem.category || '通用');
    }
  }, [currentItem, currentIndex, reviewMode]);

  // Reset index when mode changes
  React.useEffect(() => {
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
      // Mark term as confirmed, also save the edited target/category
      if (currentItem._type === 'glossary') {
        onUpdateGlossary(glossary.map(g =>
          g.id === currentItem.id ? { ...g, confirmed: true, target: editTarget, category: editCategory } : g
        ));
      } else {
        onUpdateKeywords(keywords.map(kw =>
          (kw.key || `k_${kw.source}`) === currentItem._rowKey
            ? { ...kw, confirmed: true, target: editTarget, category: editCategory }
            : kw
        ));
      }
      messageApi.success('术语已审核');
    } else {
      // Mark entry as reviewed
      onUpdateEntry(currentItem.id, { translated: editTarget, status: 'reviewed' });
      messageApi.success('条目已审核');
    }
    // Move to next item, or stay at same index (which will now show the next unreviewed)
    // Since the item was removed from unreviewedItems, same index now points to next
    if (currentIndex >= currentItems.length - 1 && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentItem, currentIndex, currentItems, reviewMode, editTarget, editCategory, glossary, keywords, onUpdateGlossary, onUpdateKeywords, onUpdateEntry, messageApi]);

  // Translate current item via API
  const handleTranslate = useCallback(async () => {
    if (!currentItem) return;
    setTranslating(true);
    try {
      const original = reviewMode === 'terms' ? currentItem.source : currentItem.original;
      const result = await api.translate({
        entries: [{ id: 'review_single', original, context: currentItem.context || '' }],
        glossary: confirmedGlossary,
        modPrompt: project.modPrompt || '',
      });
      if (result?.success && result.data?.[0]?.translated) {
        setEditTarget(result.data[0].translated);
        messageApi.success('翻译完成');
      } else {
        messageApi.error(result?.error || '翻译失败');
      }
    } catch (err) {
      messageApi.error('翻译出错: ' + err.message);
    } finally {
      setTranslating(false);
    }
  }, [currentItem, reviewMode, confirmedGlossary, project.modPrompt, messageApi]);

  if (!project) {
    return <Empty description="请先加载项目" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto', gap: 16 }}>
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

      {/* Current item display */}
      {currentItem ? (
        <Card size="small" style={{ flexShrink: 0 }}>
          {/* Source info */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Tag color={reviewMode === 'terms'
                ? (currentItem._type === 'glossary' ? 'green' : 'blue')
                : STATUS_MAP[currentItem.status]?.color || 'default'
              }>
                {reviewMode === 'terms'
                  ? (currentItem._type === 'glossary' ? '手动术语' : '提取术语')
                  : STATUS_MAP[currentItem.status]?.label || currentItem.status
                }
              </Tag>
              {currentItem.category && (
                <Tag>{currentItem.category}</Tag>
              )}
              {reviewMode === 'entries' && currentItem.file && (
                <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                  <FileTextOutlined style={{ marginRight: 4 }} />
                  {currentItem.file}
                </span>
              )}
              {reviewMode === 'terms' && currentItem.extractType && (
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
              {reviewMode === 'terms' ? currentItem.source : currentItem.original}
            </div>
          </div>

          {/* Context info for entries */}
          {reviewMode === 'entries' && currentItem.context && (
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
        <Empty
          description={
            reviewMode === 'terms'
              ? '所有术语已审核完毕'
              : '没有待审核的已翻译条目'
          }
          style={{ marginTop: 48 }}
        />
      )}
    </div>
  );
}
