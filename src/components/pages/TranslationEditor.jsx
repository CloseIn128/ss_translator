import React, { useState, useMemo, useCallback } from 'react';
import { Input, Select, Button, Tag, Tooltip, Space, Modal, Spin } from 'antd';
import {
  TranslationOutlined,
  HighlightOutlined,
  SearchOutlined,
  RobotOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTask } from '../context/TaskContext';

const api = window.electronAPI;

const STATUS_MAP = {
  untranslated: { label: '未翻译', color: 'default' },
  translated: { label: '已翻译', color: 'success' },
  polished: { label: '已润色', color: 'processing' },
  reviewed: { label: '已审核', color: 'warning' },
  error: { label: '错误', color: 'error' },
};

const PAGE_SIZE = 50;

export default function TranslationEditor({
  project,
  selectedFile,
  onUpdateEntry,
  onBatchUpdate,
  messageApi,
}) {
  const { addLog, startTask, updateTaskProgress, completeTask, failTask, isTaskRunning } = useTask();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [translatingIds, setTranslatingIds] = useState(new Set());
  const [batchTranslating, setBatchTranslating] = useState(false);

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
        e.original.toLowerCase().includes(lower) ||
        e.translated?.toLowerCase().includes(lower) ||
        e.context?.toLowerCase().includes(lower) ||
        e.id.toLowerCase().includes(lower)
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
  React.useEffect(() => { setCurrentPage(1); }, [selectedFile, categoryFilter, statusFilter, searchText]);

  // Stats for current filter
  const stats = useMemo(() => {
    const total = filteredEntries.length;
    const translated = filteredEntries.filter(
      e => e.status !== 'untranslated' && e.status !== 'error'
    ).length;
    return { total, translated };
  }, [filteredEntries]);

  // Translate single entry
  const handleTranslate = useCallback(async (entry) => {
    setTranslatingIds(prev => new Set(prev).add(entry.id));
    addLog('info', `翻译条目: ${entry.original.slice(0, 60)}...`, '翻译编辑');
    try {
      const result = await api.translate({
        entries: [{ id: entry.id, original: entry.original, context: entry.context }],
        glossary: project.glossary || [],
      });
      if (result?.success && result.data?.length > 0) {
        const t = result.data[0];
        onUpdateEntry(entry.id, { translated: t.translated, status: t.status });
        if (t.status === 'error') {
          addLog('error', `翻译失败: ${t.error || '未知错误'}`, '翻译编辑');
          messageApi.error(t.error || '翻译失败');
        } else {
          addLog('success', `翻译完成: "${entry.original.slice(0, 30)}" → "${(t.translated || '').slice(0, 30)}"`, '翻译编辑');
        }
      } else {
        addLog('error', `翻译请求失败: ${result?.error || '未知错误'}`, '翻译编辑');
        messageApi.error(result?.error || '翻译请求失败');
      }
    } catch (err) {
      addLog('error', `翻译出错: ${err.message}`, '翻译编辑');
      messageApi.error('翻译出错: ' + err.message);
    } finally {
      setTranslatingIds(prev => {
        const s = new Set(prev);
        s.delete(entry.id);
        return s;
      });
    }
  }, [project.glossary, onUpdateEntry, messageApi, addLog]);

  // Polish single entry
  const handlePolish = useCallback(async (entry) => {
    if (!entry.translated) {
      messageApi.warning('请先翻译该条目');
      return;
    }
    setTranslatingIds(prev => new Set(prev).add(entry.id));
    addLog('info', `润色条目: "${entry.original.slice(0, 40)}"`, '翻译编辑');
    try {
      const result = await api.polish({
        entry: { id: entry.id, original: entry.original, translated: entry.translated },
        glossary: project.glossary || [],
      });
      if (result?.success) {
        onUpdateEntry(entry.id, { translated: result.data.translated, status: 'polished' });
        addLog('success', `润色完成: "${(result.data.translated || '').slice(0, 40)}"`, '翻译编辑');
      } else {
        addLog('error', `润色失败: ${result?.error || '未知错误'}`, '翻译编辑');
        messageApi.error(result?.error || '润色失败');
      }
    } catch (err) {
      addLog('error', `润色出错: ${err.message}`, '翻译编辑');
      messageApi.error('润色出错: ' + err.message);
    } finally {
      setTranslatingIds(prev => {
        const s = new Set(prev);
        s.delete(entry.id);
        return s;
      });
    }
  }, [project.glossary, onUpdateEntry, messageApi, addLog]);

  // Batch translate all untranslated in current filter
  const handleBatchTranslate = useCallback(async () => {
    const untranslated = filteredEntries.filter(e => e.status === 'untranslated');
    if (untranslated.length === 0) {
      messageApi.info('当前筛选下没有未翻译的条目');
      return;
    }

    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }

    Modal.confirm({
      title: '批量翻译',
      content: `将翻译当前筛选范围内的 ${untranslated.length} 条未翻译文本，是否继续？`,
      okText: '开始翻译',
      cancelText: '取消',
      onOk() {
        // Do not return the promise so the dialog closes immediately.
        // Using a fire-and-forget async IIFE: if onOk were async, Ant Design's
        // Modal.confirm would keep the dialog open until the Promise resolves.
        const taskId = startTask(`批量翻译 ${untranslated.length} 条`);
        if (!taskId) {
          messageApi.warning('已有任务正在执行');
          return;
        }
        setBatchTranslating(true);
        addLog('info', `开始批量翻译 ${untranslated.length} 条未翻译文本`, '翻译编辑');
        (async () => {
          try {
            const batchInput = untranslated.map(e => ({
              id: e.id,
              original: e.original,
              context: e.context,
            }));
            updateTaskProgress(`0/${untranslated.length}`);
            const result = await api.translate({
              entries: batchInput,
              glossary: project.glossary || [],
            });
            if (result?.success) {
              onBatchUpdate(result.data);
              const successCount = result.data.filter(r => r.status === 'translated').length;
              const msg = `批量翻译完成：${successCount}/${untranslated.length} 成功`;
              addLog('success', msg, '翻译编辑');
              for (const r of result.data.slice(0, 5)) {
                if (r.status === 'translated') {
                  addLog('debug', `"${(r.original || '').slice(0, 30)}" → "${(r.translated || '').slice(0, 30)}"`, '翻译编辑');
                }
              }
              completeTask(msg);
              messageApi.success(msg);
            } else {
              const errMsg = result?.error || '批量翻译失败';
              addLog('error', errMsg, '翻译编辑');
              failTask(errMsg);
              messageApi.error(errMsg);
            }
          } catch (err) {
            addLog('error', `批量翻译出错: ${err.message}`, '翻译编辑');
            failTask(`批量翻译出错: ${err.message}`);
            messageApi.error('批量翻译出错: ' + err.message);
          } finally {
            setBatchTranslating(false);
          }
        })();
      },
    });
  }, [filteredEntries, project.glossary, onBatchUpdate, messageApi, isTaskRunning, startTask, updateTaskProgress, completeTask, failTask, addLog]);

  // Batch polish all translated
  const handleBatchPolish = useCallback(async () => {
    const translated = filteredEntries.filter(e => e.status === 'translated');
    if (translated.length === 0) {
      messageApi.info('当前筛选下没有可润色的条目');
      return;
    }

    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }

    Modal.confirm({
      title: '批量润色',
      content: `将润色当前筛选范围内的 ${translated.length} 条已翻译文本，是否继续？`,
      okText: '开始润色',
      cancelText: '取消',
      onOk() {
        // Do not return the promise so the dialog closes immediately.
        // Using a fire-and-forget async IIFE: if onOk were async, Ant Design's
        // Modal.confirm would keep the dialog open until the Promise resolves.
        const taskId = startTask(`批量润色 ${translated.length} 条`);
        if (!taskId) {
          messageApi.warning('已有任务正在执行');
          return;
        }
        setBatchTranslating(true);
        addLog('info', `开始批量润色 ${translated.length} 条已翻译文本`, '翻译编辑');
        (async () => {
          try {
            const updates = [];
            for (let i = 0; i < translated.length; i++) {
              const entry = translated[i];
              updateTaskProgress(`${i + 1}/${translated.length}`);
              addLog('debug', `润色 (${i + 1}/${translated.length}): "${entry.original.slice(0, 40)}"`, '翻译编辑');
              const result = await api.polish({
                entry: { id: entry.id, original: entry.original, translated: entry.translated },
                glossary: project.glossary || [],
              });
              if (result?.success) {
                updates.push(result.data);
                addLog('debug', `润色结果: "${(result.data.translated || '').slice(0, 40)}"`, '翻译编辑');
              }
            }
            if (updates.length > 0) {
              onBatchUpdate(updates);
            }
            const msg = `批量润色完成：${updates.length}/${translated.length} 成功`;
            addLog('success', msg, '翻译编辑');
            completeTask(msg);
            messageApi.success(msg);
          } catch (err) {
            addLog('error', `批量润色出错: ${err.message}`, '翻译编辑');
            failTask(`批量润色出错: ${err.message}`);
            messageApi.error('批量润色出错: ' + err.message);
          } finally {
            setBatchTranslating(false);
          }
        })();
      },
    });
  }, [filteredEntries, project.glossary, onBatchUpdate, messageApi, isTaskRunning, startTask, updateTaskProgress, completeTask, failTask, addLog]);

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">当前条目数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.translated}</div>
          <div className="stat-label">已翻译</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0}%
          </div>
          <div className="stat-label">翻译进度</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索原文、译文、上下文..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          allowClear
          style={{ width: 280 }}
          size="small"
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          style={{ width: 140 }}
          size="small"
          options={categories.map(c => ({
            value: c,
            label: c === 'all' ? '全部分类' : c,
          }))}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 120 }}
          size="small"
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'untranslated', label: '未翻译' },
            { value: 'translated', label: '已翻译' },
            { value: 'polished', label: '已润色' },
            { value: 'reviewed', label: '已审核' },
            { value: 'error', label: '错误' },
          ]}
        />
        <Button
          type="primary"
          size="small"
          icon={<RobotOutlined />}
          onClick={handleBatchTranslate}
          loading={batchTranslating}
          disabled={isTaskRunning && !batchTranslating}
        >
          批量翻译
        </Button>
        <Button
          size="small"
          icon={<HighlightOutlined />}
          onClick={handleBatchPolish}
          loading={batchTranslating}
          disabled={isTaskRunning && !batchTranslating}
        >
          批量润色
        </Button>
        <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>
          共 {filteredEntries.length} 条
        </span>
      </div>

      {/* Entries */}
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
  );
}

/**
 * Single entry row component
 */
function EntryRow({ entry, isTranslating, onUpdateEntry, onTranslate, onPolish }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(entry.translated || '');

  const handleSave = () => {
    onUpdateEntry(entry.id, {
      translated: editText,
      status: editText.trim() ? 'translated' : 'untranslated',
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditText(entry.translated || '');
    setEditing(false);
  };

  const statusInfo = STATUS_MAP[entry.status] || STATUS_MAP.untranslated;

  return (
    <div className="entry-row">
      {/* Original text */}
      <div className="entry-original">
        <div className="entry-meta">
          <Tag color={statusInfo.color} style={{ fontSize: 10 }}>{statusInfo.label}</Tag>
          <span>{entry.context}</span>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.original}</div>
      </div>

      {/* Translated text */}
      <div className="entry-translated">
        {editing ? (
          <div>
            <textarea
              className="translation-textarea"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={3}
              autoFocus
            />
            <Space size={4} style={{ marginTop: 4 }}>
              <Button size="small" type="primary" onClick={handleSave}>保存</Button>
              <Button size="small" onClick={handleCancel}>取消</Button>
            </Space>
          </div>
        ) : (
          <div
            onClick={() => { setEditText(entry.translated || ''); setEditing(true); }}
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              cursor: 'pointer',
              minHeight: 40,
              padding: 4,
              borderRadius: 4,
              border: '1px dashed transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#303030'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
          >
            {entry.translated || <span style={{ color: '#555' }}>点击输入翻译...</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="entry-actions">
        {isTranslating ? (
          <Spin size="small" />
        ) : (
          <>
            <Tooltip title="AI翻译">
              <Button
                size="small"
                type="text"
                icon={<TranslationOutlined />}
                onClick={() => onTranslate(entry)}
              />
            </Tooltip>
            <Tooltip title="AI润色">
              <Button
                size="small"
                type="text"
                icon={<HighlightOutlined />}
                onClick={() => onPolish(entry)}
                disabled={!entry.translated}
              />
            </Tooltip>
            <Tooltip title="标记为已审核">
              <Button
                size="small"
                type="text"
                icon={<CheckCircleOutlined />}
                onClick={() => onUpdateEntry(entry.id, { status: 'reviewed' })}
                disabled={!entry.translated}
              />
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}


