import React, { useState, useEffect, useRef } from 'react';
import { Button, Table, Input, Tag, Space, Tooltip, Divider, Modal, Switch, Pagination, Select } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  RobotOutlined,
  TranslationOutlined,
  HighlightOutlined,
  CheckOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useTask } from '../context/TaskContext';

const api = window.electronAPI;

export default function KeywordExtractor({ project, onUpdateKeywords, onUpdateGlossary, messageApi }) {
  const { addLog, startTask, updateTaskProgress, completeTask, failTask, isTaskRunning } = useTask();
  const [keywords, setKeywords] = useState(() => project?.keywords || []);
  const [extracting, setExtracting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const handleSearchChange = (e) => { setSearchText(e.target.value); setCurrentPage(1); };
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [extractPhase, setExtractPhase] = useState(''); // 'structure' | 'ai' | ''
  const [enableAI, setEnableAI] = useState(true);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingKey, setEditingKey] = useState(null); // key of row being edited
  const [editingField, setEditingField] = useState(null); // 'target' or 'category'
  const [editingValue, setEditingValue] = useState('');
  const keyCounterRef = useRef(project?.keywords?.length || 0);
  const batchHandlerRef = useRef(null);
  const logHandlerRef = useRef(null);

  // Sync keywords back to project whenever they change
  useEffect(() => {
    if (onUpdateKeywords) {
      onUpdateKeywords(keywords);
    }
  }, [keywords, onUpdateKeywords]);

  // Reset keywords when a different project is loaded
  useEffect(() => {
    const loaded = project?.keywords || [];
    setKeywords(loaded);
    keyCounterRef.current = loaded.length;
    setSelectedRowKeys([]);
  }, [project?.id]);

  // Sync from project.keywords when translations arrive while on this tab
  // (e.g. translations update project.keywords via onUpdateKeywords in doTranslate,
  //  but this also handles external updates)
  useEffect(() => {
    const projKw = project?.keywords;
    if (!projKw) return;
    // Only update if project keywords differ (avoid infinite loop with our own updates)
    setKeywords(prev => {
      if (prev === projKw) return prev;
      // Check if they actually differ (simple length + first/last target check)
      if (prev.length === projKw.length) {
        let same = true;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].target !== projKw[i].target || prev[i].source !== projKw[i].source) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      keyCounterRef.current = projKw.length;
      return projKw;
    });
  }, [project?.keywords]);

  // Register / cleanup the keywords:batch event listener
  useEffect(() => {
    const handler = api.onKeywordBatch((data) => {
      if (data.phase === 'complete') {
        setExtracting(false);
        setExtractPhase('');
        return;
      }

      setExtractPhase(data.phase);

      if (data.keywords && data.keywords.length > 0) {
        const counter = keyCounterRef.current;
        const newItems = data.keywords.map((kw, i) => ({
          ...kw,
          key: `${kw.extractType}_${counter + i}`,
          target: kw.target || '',
          category: kw.category || '通用',
        }));
        keyCounterRef.current = counter + newItems.length;
        setKeywords(prev => [...prev, ...newItems]);
        addLog('debug', `[${data.phase}] 发现 ${newItems.length} 个关键词`, '关键词提取');
      }
    });
    batchHandlerRef.current = handler;

    return () => {
      if (batchHandlerRef.current) {
        api.removeKeywordBatchListener(batchHandlerRef.current);
        batchHandlerRef.current = null;
      }
    };
  }, []);

  // Register / cleanup the keywords:log event listener
  useEffect(() => {
    const handler = api.onKeywordLog((data) => {
      addLog(data.level, data.message, '关键词提取');
    });
    logHandlerRef.current = handler;

    return () => {
      if (logHandlerRef.current) {
        api.removeKeywordLogListener(logHandlerRef.current);
        logHandlerRef.current = null;
      }
    };
  }, []);

  // ─── Inline editing helpers ────────────────────────────────────────
  const CATEGORY_OPTIONS = ['通用', '势力名称', '舰船名称', '武器名称', '人名', '星球/星系名', '游戏术语', '物品名称', '其他'];

  const startEdit = (record, field) => {
    setEditingKey(record.key);
    setEditingField(field);
    setEditingValue(field === 'target' ? (record.target || '') : (record.category || '通用'));
  };

  const saveEdit = () => {
    if (editingKey == null || !editingField) return;
    setKeywords(prev => {
      const updated = prev.map(kw =>
        kw.key === editingKey ? { ...kw, [editingField]: editingValue } : kw
      );
      if (onUpdateKeywords) onUpdateKeywords(updated);
      return updated;
    });
    setEditingKey(null);
    setEditingField(null);
    setEditingValue('');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingField(null);
    setEditingValue('');
  };

  // ─── Confirmed status toggle ──────────────────────────────────────
  const toggleConfirmed = (key) => {
    setKeywords(prev => {
      const updated = prev.map(kw =>
        kw.key === key ? { ...kw, confirmed: !kw.confirmed } : kw
      );
      if (onUpdateKeywords) onUpdateKeywords(updated);
      return updated;
    });
  };

  const handleConfirmSelected = () => {
    if (selectedRowKeys.length === 0) return;
    const selectedSet = new Set(selectedRowKeys);
    setKeywords(prev => {
      const updated = prev.map(kw =>
        selectedSet.has(kw.key) ? { ...kw, confirmed: true } : kw
      );
      if (onUpdateKeywords) onUpdateKeywords(updated);
      return updated;
    });
    messageApi.success(`已确认 ${selectedRowKeys.length} 个关键词`);
  };

  // Unified extraction: structural first, then AI (incremental)
  const doExtract = async () => {
    const targetPath = project?.modPath;

    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }

    const taskId = startTask('关键词提取');
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }

    setExtracting(true);
    setKeywords([]);
    setSelectedRowKeys([]);
    keyCounterRef.current = 0;
    setExtractPhase('structure');
    addLog('info', `开始提取关键词: ${targetPath}`, '关键词提取');
    updateTaskProgress('结构提取中...');

    try {
      const result = await api.extractAllKeywords({
        modPath: targetPath,
        glossary: project?.glossary || [],
        skipAI: !enableAI,
      });
      if (result?.success) {
        const msg = `提取完成：结构提取 ${result.total.structure} 个，AI提取 ${result.total.ai} 个`;
        addLog('success', msg, '关键词提取');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '关键词提取失败';
        addLog('error', errMsg, '关键词提取');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `提取出错: ${err.message}`, '关键词提取');
      failTask(`提取出错: ${err.message}`);
      messageApi.error('提取出错: ' + err.message);
      // Only reset on error – normal completion is driven by the 'complete' event
      setExtracting(false);
      setExtractPhase('');
    }
  };

  const handleExtractAll = async () => {
    const targetPath = project?.modPath;
    if (!targetPath) {
      messageApi.warning('请先在基本信息页设置MOD文件夹路径');
      return;
    }

    // Confirm overwrite when keywords already exist
    if (keywords.length > 0) {
      Modal.confirm({
        title: '重新提取关键词',
        content: `当前已有 ${keywords.length} 个关键词，重新提取将覆盖现有结果。是否继续？`,
        okText: '确认提取',
        cancelText: '取消',
        onOk() {
          ;(async () => { await doExtract(); })();
        },
      });
      return;
    }

    await doExtract();
  };

  // Translate selected keywords
  const handleTranslate = async () => {
    if (selectedRowKeys.length === 0) {
      messageApi.warning('请先勾选要翻译的关键词');
      return;
    }

    const keywordMap = new Map(keywords.map(kw => [kw.key, kw]));
    const toTranslate = selectedRowKeys
      .map(k => keywordMap.get(k))
      .filter(Boolean);

    if (toTranslate.length === 0) return;
    await doTranslate(toTranslate);
  };

  // Translate all keywords (exclude confirmed, use confirmed as glossary)
  const handleTranslateAll = async () => {
    if (keywords.length === 0) return;
    const unconfirmed = keywords.filter(kw => !kw.confirmed);
    if (unconfirmed.length === 0) {
      messageApi.info('所有关键词已确认，无需翻译');
      return;
    }
    // Confirmed keywords with translations serve as glossary context
    const confirmedGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim())
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category }));
    await doTranslate(unconfirmed, confirmedGlossary);
  };

  // Shared translate implementation
  const doTranslate = async (toTranslate, extraGlossary = []) => {
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }

    const taskId = startTask(`翻译 ${toTranslate.length} 个关键词`);
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }

    setTranslating(true);
    addLog('info', `开始翻译 ${toTranslate.length} 个关键词`, '关键词提取');
    try {
      const result = await api.translateKeywords({
        keywords: toTranslate.map(kw => ({ source: kw.source, category: kw.category })),
        extraGlossary: extraGlossary,
      });
      if (result?.success) {
        // Build translation lookup
        const translationMap = new Map();
        for (const item of result.data) {
          if (item.source && item.target) {
            translationMap.set(item.source.toLowerCase(), item.target);
          }
        }
        // Update keywords with translations
        const updatedKeywords = toTranslate.map(kw => {
          const translation = translationMap.get(kw.source.toLowerCase());
          return translation ? { ...kw, target: translation } : kw;
        });
        // Build a full updated list (merge translations into all keywords)
        const fullMap = new Map(updatedKeywords.map(kw => [kw.key, kw]));
        setKeywords(prev => {
          const merged = prev.map(kw => fullMap.get(kw.key) || kw);
          // Directly persist to parent so translations survive tab switches
          if (onUpdateKeywords) onUpdateKeywords(merged);
          return merged;
        });
        const translated = result.data.filter(d => d.target).length;
        const msg = `已翻译 ${translated} 个关键词`;
        addLog('success', msg, '关键词提取');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '关键词翻译失败';
        addLog('error', errMsg, '关键词提取');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `翻译出错: ${err.message}`, '关键词提取');
      failTask(`翻译出错: ${err.message}`);
      messageApi.error('翻译出错: ' + err.message);
    } finally {
      setTranslating(false);
    }
  };

  // Polish all keywords for consistency (exclude confirmed, use confirmed as glossary)
  const handlePolishAll = async () => {
    const unconfirmed = keywords.filter(kw => !kw.confirmed);
    const translated = unconfirmed.filter(kw => kw.target && kw.target.trim());
    if (translated.length === 0) {
      messageApi.warning('没有未确认的已翻译术语可润色');
      return;
    }
    // Confirmed keywords with translations serve as glossary context
    const confirmedGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim())
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category }));
    await doPolish(unconfirmed, confirmedGlossary);
  };

  // Shared polish implementation
  const doPolish = async (toPolish, extraGlossary = []) => {
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }

    const taskId = startTask(`润色 ${toPolish.length} 个关键词`);
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }

    setPolishing(true);
    addLog('info', `开始润色 ${toPolish.length} 个关键词`, '关键词提取');
    try {
      const result = await api.polishKeywords({
        keywords: toPolish.map(kw => ({ source: kw.source, target: kw.target || '', category: kw.category })),
        extraGlossary: extraGlossary,
      });
      if (result?.success) {
        const polishMap = new Map();
        for (const item of result.data) {
          if (item.source && item.target) {
            polishMap.set(item.source.toLowerCase(), item.target);
          }
        }
        setKeywords(prev => {
          const merged = prev.map(kw => {
            const polished = polishMap.get(kw.source.toLowerCase());
            return polished ? { ...kw, target: polished } : kw;
          });
          if (onUpdateKeywords) onUpdateKeywords(merged);
          return merged;
        });
        // Count changes using source-based matching instead of index
        const origMap = new Map(toPolish.map(kw => [kw.source.toLowerCase(), kw.target || '']));
        const changed = result.data.filter(d => {
          const origTarget = origMap.get(d.source?.toLowerCase());
          return origTarget !== undefined && d.target !== origTarget;
        }).length;
        const msg = `润色完成，${changed} 个术语有变更`;
        addLog('success', msg, '关键词提取');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '关键词润色失败';
        addLog('error', errMsg, '关键词提取');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `润色出错: ${err.message}`, '关键词提取');
      failTask(`润色出错: ${err.message}`);
      messageApi.error('润色出错: ' + err.message);
    } finally {
      setPolishing(false);
    }
  };

  // Shared logic for adding keywords to glossary with overwrite support
  const doAddToGlossary = async (kwList) => {
    const glossary = project.glossary || [];
    const existingMap = new Map(glossary.map(g => [g.source, g]));

    const newKws = kwList.filter(kw => kw && !existingMap.has(kw.source));
    const overlapKws = kwList.filter(kw => kw && existingMap.has(kw.source));

    const doAdd = async () => {
      let added = 0;
      let updated = 0;
      const newEntries = [];
      const updatedGlossary = [...glossary];

      // Add new entries
      for (const kw of newKws) {
        const result = await api.addGlossaryEntry({
          projectId: project.id,
          source: kw.source,
          target: kw.target || '',
          category: kw.category || '通用',
        });
        if (result) {
          newEntries.push(result);
          added++;
        }
      }

      // Update existing entries (overwrite)
      for (const kw of overlapKws) {
        const existing = existingMap.get(kw.source);
        if (existing) {
          const result = await api.updateGlossaryEntry({
            projectId: project.id,
            id: existing.id,
            source: kw.source,
            target: kw.target || '',
            category: kw.category || '通用',
          });
          if (result) {
            const idx = updatedGlossary.findIndex(g => g.id === existing.id);
            if (idx >= 0) {
              updatedGlossary[idx] = { ...updatedGlossary[idx], target: kw.target || '', category: kw.category || '通用' };
            }
            updated++;
          }
        }
      }

      if ((added > 0 || updated > 0) && onUpdateGlossary) {
        onUpdateGlossary([...updatedGlossary, ...newEntries]);
      }
      const parts = [];
      if (added > 0) parts.push(`新增 ${added} 个`);
      if (updated > 0) parts.push(`覆盖 ${updated} 个`);
      messageApi.success(`已${parts.join('，')}术语到词库`);
    };

    if (overlapKws.length > 0) {
      Modal.confirm({
        title: '覆盖确认',
        content: `${newKws.length > 0 ? `将新增 ${newKws.length} 个术语。` : ''}术语库中已存在 ${overlapKws.length} 个同名条目，覆盖将更新它们的译文和分类。是否继续？`,
        okText: '确认覆盖',
        cancelText: '取消',
        onOk() {
          ;(async () => { await doAdd(); })();
        },
      });
    } else {
      await doAdd();
    }
  };

  const handleAddToGlossary = async () => {
    if (!project) {
      messageApi.warning('请先加载翻译项目，再添加到词库');
      return;
    }
    if (selectedRowKeys.length === 0) {
      messageApi.warning('请先勾选要添加的关键词');
      return;
    }

    const keywordMap = new Map(keywords.map(kw => [kw.key, kw]));
    const kwList = selectedRowKeys.map(k => keywordMap.get(k)).filter(Boolean);

    if (kwList.length === 0) return;
    await doAddToGlossary(kwList);
    setSelectedRowKeys([]);
  };

  const handleAddAllToGlossary = async () => {
    if (!project) {
      messageApi.warning('请先加载翻译项目，再添加到词库');
      return;
    }
    if (keywords.length === 0) {
      messageApi.warning('没有可添加的关键词');
      return;
    }

    await doAddToGlossary(keywords);
  };

  const filteredKeywords = searchText.trim()
    ? keywords.filter(kw =>
        kw.source.toLowerCase().includes(searchText.toLowerCase()) ||
        (kw.target || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (kw.context || '').toLowerCase().includes(searchText.toLowerCase())
      )
    : keywords;

  const columns = [
    {
      title: '原文关键词',
      dataIndex: 'source',
      key: 'source',
      sorter: (a, b) => a.source.localeCompare(b.source),
      render: (text, record) => (
        <span style={{ fontSize: 12 }}>
          {record.confirmed && <CheckOutlined style={{ color: '#52c41a', marginRight: 4, fontSize: 10 }} />}
          {text}
        </span>
      ),
    },
    {
      title: '译文',
      dataIndex: 'target',
      key: 'target',
      render: (text, record) => {
        if (editingKey === record.key && editingField === 'target') {
          return (
            <Input
              size="small"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onPressEnter={saveEdit}
              onBlur={saveEdit}
              autoFocus
              style={{ fontSize: 12, width: '100%' }}
            />
          );
        }
        return (
          <span
            style={{ color: text ? '#52c41a' : '#555', fontSize: 12, cursor: 'pointer' }}
            onClick={() => startEdit(record, 'target')}
          >
            {text || '—'}
            <EditOutlined style={{ marginLeft: 4, fontSize: 10, color: '#8c8c8c', opacity: 0.6 }} />
          </span>
        );
      },
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      filters: [
        { text: '通用', value: '通用' },
        { text: '势力名称', value: '势力名称' },
        { text: '舰船名称', value: '舰船名称' },
        { text: '武器名称', value: '武器名称' },
        { text: '人名', value: '人名' },
        { text: '星球/星系名', value: '星球/星系名' },
        { text: '游戏术语', value: '游戏术语' },
        { text: '物品名称', value: '物品名称' },
        { text: '其他', value: '其他' },
      ],
      onFilter: (value, record) => record.category === value,
      render: (text, record) => {
        if (editingKey === record.key && editingField === 'category') {
          return (
            <Select
              size="small"
              value={editingValue}
              onChange={(val) => { setEditingValue(val); }}
              onBlur={saveEdit}
              autoFocus
              open
              style={{ width: '100%', fontSize: 11 }}
              options={CATEGORY_OPTIONS.map(c => ({ value: c, label: c }))}
              onSelect={(val) => {
                setEditingValue(val);
                // Use timeout to let state update before saving
                setTimeout(() => {
                  setKeywords(prev => {
                    const updated = prev.map(kw =>
                      kw.key === record.key ? { ...kw, category: val } : kw
                    );
                    if (onUpdateKeywords) onUpdateKeywords(updated);
                    return updated;
                  });
                  setEditingKey(null);
                  setEditingField(null);
                  setEditingValue('');
                }, 0);
              }}
            />
          );
        }
        return (
          <Tag
            style={{ fontSize: 11, cursor: 'pointer' }}
            onClick={() => startEdit(record, 'category')}
          >
            {text || '通用'}
          </Tag>
        );
      },
    },
    {
      title: '状态',
      key: 'confirmed',
      width: 70,
      filters: [
        { text: '已确认', value: true },
        { text: '未确认', value: false },
      ],
      onFilter: (value, record) => !!record.confirmed === value,
      render: (_, record) => (
        <Tooltip title={record.confirmed ? '点击取消确认' : '点击标记为已确认'}>
          <Tag
            color={record.confirmed ? 'success' : 'default'}
            style={{ fontSize: 11, cursor: 'pointer' }}
            onClick={() => toggleConfirmed(record.key)}
          >
            {record.confirmed ? '已确认' : '未确认'}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: '来源',
      key: 'extractType',
      width: 80,
      filters: [
        { text: '结构', value: 'structure' },
        { text: 'AI', value: 'ai' },
      ],
      onFilter: (value, record) => record.extractType === value,
      render: (_, record) => (
        <Tag color={record.extractType === 'ai' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
          {record.extractType === 'ai' ? 'AI' : '结构'}
        </Tag>
      ),
    },
    {
      title: '上下文/文件',
      key: 'info',
      render: (_, record) => {
        if (record.file) {
          return (
            <Tooltip title={record.file}>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.file.split('/').pop()}</span>
            </Tooltip>
          );
        }
        if (record.context) {
          return <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.context}</span>;
        }
        // Fallback for AI-extracted rows or any record without file/context
        const placeholder = record.extractType === 'ai' ? 'AI提取' : '—';
        return <span style={{ fontSize: 12, color: '#8c8c8c' }}>{placeholder}</span>;
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <Tooltip title="开启后提取关键词时同时使用AI智能提取">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8c8c8c' }}>
            <RobotOutlined />
            AI提取
            <Switch size="small" checked={enableAI} onChange={setEnableAI} disabled={extracting} />
          </span>
        </Tooltip>
        <Button
          type="primary"
          size="small"
          icon={<SearchOutlined />}
          onClick={handleExtractAll}
          loading={extracting}
          disabled={isTaskRunning && !extracting}
        >
          提取关键词
        </Button>
        {keywords.length > 0 && (
          <>
            <Button
              size="small"
              icon={<TranslationOutlined />}
              onClick={handleTranslateAll}
              loading={translating}
              disabled={extracting || (isTaskRunning && !translating)}
            >
              翻译全部
            </Button>
            <Button
              size="small"
              icon={<TranslationOutlined />}
              onClick={handleTranslate}
              loading={translating}
              disabled={selectedRowKeys.length === 0 || extracting || (isTaskRunning && !translating)}
            >
              翻译选中 ({selectedRowKeys.length})
            </Button>
            <Button
              size="small"
              icon={<HighlightOutlined />}
              onClick={handlePolishAll}
              loading={polishing}
              disabled={extracting || (isTaskRunning && !polishing)}
            >
              润色全部
            </Button>
            <Button
              size="small"
              icon={<CheckOutlined />}
              onClick={handleConfirmSelected}
              disabled={selectedRowKeys.length === 0 || extracting}
            >
              确认选中 ({selectedRowKeys.length})
            </Button>
            <Divider type="vertical" />
            <Input
              placeholder="搜索关键词..."
              value={searchText}
              onChange={handleSearchChange}
              allowClear
              size="small"
              style={{ width: 200 }}
            />
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddAllToGlossary}
              disabled={extracting || isTaskRunning}
            >
              全部加入术语库
            </Button>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddToGlossary}
              disabled={selectedRowKeys.length === 0 || extracting || isTaskRunning}
            >
              选中加入术语库 ({selectedRowKeys.length})
            </Button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>
              共 {filteredKeywords.length} 个关键词
              {keywords.some(kw => kw.confirmed) && ` | 已确认 ${keywords.filter(kw => kw.confirmed).length}`}
            </span>
          </>
        )}
      </div>

      {extracting && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <RobotOutlined spin style={{ color: '#1677ff' }} />
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>
            {extractPhase === 'structure' && '正在进行结构化提取...'}
            {extractPhase === 'ai' && `AI智能提取中... 已发现 ${keywords.filter(k => k.extractType === 'ai').length} 个关键词`}
          </span>
        </div>
      )}

      {keywords.length === 0 && !extracting && (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          <SearchOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div style={{ marginBottom: 8 }}>在基本信息页设置MOD文件夹后提取关键词</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            点击"提取关键词"将执行<b>结构提取</b>，开启AI提取开关时同时执行<b>AI智能提取</b>
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            结构提取基于MOD文件结构快速识别舰船名、武器名、势力名等字段
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            AI智能提取通过AI分析文本内容，识别隐藏在描述和对话中的专有名词
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
            提取完成后，可选择关键词进行<b>翻译</b>，再添加到词库
          </div>
        </div>
      )}

      {(keywords.length > 0 || extracting) && (
        <div className="keyword-table-wrapper">
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Table
              dataSource={filteredKeywords.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
              columns={columns}
              rowKey="key"
              size="small"
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                preserveSelectedRowKeys: true,
              }}
              pagination={false}
            />
          </div>
          <div style={{ flexShrink: 0, padding: '8px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredKeywords.length}
              onChange={(page, size) => { setCurrentPage(page); setPageSize(size); }}
              onShowSizeChange={(_, size) => { setPageSize(size); setCurrentPage(1); }}
              showSizeChanger
              pageSizeOptions={['10', '20', '50', '100']}
              showTotal={t => `共 ${t} 条`}
              size="small"
            />
          </div>
        </div>
      )}
    </div>
  );
}
