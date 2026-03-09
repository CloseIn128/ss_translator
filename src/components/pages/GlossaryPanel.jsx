import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Input, Select, Space, Modal, Form, Popconfirm, Tabs, Tag, Pagination, Tooltip, Switch, Divider } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ImportOutlined,
  ExportOutlined,
  EditOutlined,
  BookOutlined,
  SearchOutlined,
  RobotOutlined,
  TranslationOutlined,
  HighlightOutlined,
  CheckOutlined,
  ReloadOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useTask } from '../context/TaskContext';

const api = window.electronAPI;
const CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '战舰系统', '游戏术语', '人名/地名', '其他'];
const KEYWORD_CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '人名', '星球/星系名', '游戏术语', '物品名称', '其他'];

// ─── Unified Project Glossary + Keywords Tab ──────────────────────────

function ProjectGlossaryTab({ project, onUpdateGlossary, onUpdateKeywords, messageApi }) {
  const { addLog, startTask, updateTaskProgress, completeTask, failTask, isTaskRunning, isTaskCancelled } = useTask();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const handleSearchChange = (e) => { setSearchText(e.target.value); setCurrentPage(1); };
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // Inline editing state
  const [inlineEditKey, setInlineEditKey] = useState(null);
  const [inlineEditField, setInlineEditField] = useState(null);
  const [inlineEditValue, setInlineEditValue] = useState('');

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [enableAI, setEnableAI] = useState(true);
  const [extractPhase, setExtractPhase] = useState('');
  const keyCounterRef = useRef(project?.keywords?.length || 0);
  const batchHandlerRef = useRef(null);
  const logHandlerRef = useRef(null);

  // View filter: 'all' | 'glossary' | 'extracted'
  const [viewFilter, setViewFilter] = useState('all');

  const glossary = project.glossary || [];
  const keywords = project.keywords || [];
  const keywordsRef = useRef(keywords);
  useEffect(() => { keywordsRef.current = keywords; }, [keywords]);

  // Build unified table data
  const unifiedData = React.useMemo(() => {
    const items = [];
    // Glossary entries
    for (const g of glossary) {
      items.push({
        ...g,
        _type: 'glossary',
        _rowKey: `g_${g.id}`,
      });
    }
    // Keywords
    for (const kw of keywords) {
      items.push({
        ...kw,
        _type: 'extracted',
        _rowKey: kw.key || `k_${kw.source}`,
      });
    }
    return items;
  }, [glossary, keywords]);

  // Filtered data
  const filteredData = React.useMemo(() => {
    let data = unifiedData;
    if (viewFilter === 'glossary') {
      data = data.filter(d => d._type === 'glossary');
    } else if (viewFilter === 'extracted') {
      data = data.filter(d => d._type === 'extracted');
    }
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      data = data.filter(d =>
        (d.source || '').toLowerCase().includes(lower) ||
        (d.target || '').toLowerCase().includes(lower)
      );
    }
    return data;
  }, [unifiedData, viewFilter, searchText]);

  // ─── Keyword batch/log event listeners ─────────────────────────────
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
        onUpdateKeywords([...keywordsRef.current, ...newItems]);
        addLog('debug', `[${data.phase}] 发现 ${newItems.length} 个术语`, '术语管理');
      }
    });
    batchHandlerRef.current = handler;
    return () => {
      if (batchHandlerRef.current) {
        api.removeKeywordBatchListener(batchHandlerRef.current);
        batchHandlerRef.current = null;
      }
    };
  }, [onUpdateKeywords, addLog]);

  useEffect(() => {
    const handler = api.onKeywordLog((data) => {
      addLog(data.level, data.message, '术语管理');
    });
    logHandlerRef.current = handler;
    return () => {
      if (logHandlerRef.current) {
        api.removeKeywordLogListener(logHandlerRef.current);
        logHandlerRef.current = null;
      }
    };
  }, [addLog]);

  // Reset keyword counter when project changes
  useEffect(() => {
    keyCounterRef.current = (project?.keywords || []).length;
    setSelectedRowKeys([]);
  }, [project?.id]);

  // ─── Glossary CRUD ─────────────────────────────────────────────────
  const handleAdd = () => {
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({ category: '通用' });
    setIsModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditingEntry(record);
    form.setFieldsValue({ source: record.source, target: record.target, category: record.category });
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingEntry) {
        if (editingEntry._type === 'glossary') {
          const result = await api.updateGlossaryEntry({ projectId: project.id, id: editingEntry.id, ...values });
          if (result) {
            onUpdateGlossary(glossary.map(g => g.id === editingEntry.id ? { ...g, ...values } : g));
          }
        } else {
          // Edit extracted keyword
          const updated = keywords.map(kw =>
            kw.key === editingEntry.key ? { ...kw, ...values } : kw
          );
          onUpdateKeywords(updated);
        }
      } else {
        const result = await api.addGlossaryEntry({ projectId: project.id, ...values });
        if (result) { onUpdateGlossary([...glossary, result]); }
      }
      setIsModalOpen(false);
      messageApi.success(editingEntry ? '术语更新成功' : '术语添加成功');
    } catch (err) { /* form validation */ }
  };

  const handleDelete = async (record) => {
    if (record._type === 'glossary') {
      await api.removeGlossaryEntry(record.id);
      onUpdateGlossary(glossary.filter(g => g.id !== record.id));
    } else {
      onUpdateKeywords(keywords.filter(kw => kw.key !== record.key));
    }
    messageApi.success('术语已删除');
  };

  const handleDeleteSelected = () => {
    if (selectedRowKeys.length === 0) return;
    const selectedSet = new Set(selectedRowKeys);
    Modal.confirm({
      title: '批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个术语吗？`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        // Separate glossary and keyword deletions
        const glossaryToDelete = [];
        const keywordKeysToDelete = new Set();
        for (const item of unifiedData) {
          if (selectedSet.has(item._rowKey)) {
            if (item._type === 'glossary') {
              glossaryToDelete.push(item.id);
            } else {
              keywordKeysToDelete.add(item.key);
            }
          }
        }
        // Delete glossary entries
        for (const id of glossaryToDelete) {
          await api.removeGlossaryEntry(id);
        }
        if (glossaryToDelete.length > 0) {
          const deleteSet = new Set(glossaryToDelete);
          onUpdateGlossary(glossary.filter(g => !deleteSet.has(g.id)));
        }
        // Delete keywords
        if (keywordKeysToDelete.size > 0) {
          onUpdateKeywords(keywords.filter(kw => !keywordKeysToDelete.has(kw.key)));
        }
        setSelectedRowKeys([]);
        messageApi.success(`已删除 ${selectedRowKeys.length} 个术语`);
      },
    });
  };

  const handleImport = async () => {
    const result = await api.importGlossary(project.id);
    if (result) { onUpdateGlossary([...glossary, ...result.entries]); messageApi.success('导入 ' + result.imported + ' 条术语'); }
  };

  const handleExport = async () => {
    const result = await api.exportGlossary(project.id);
    if (result) { messageApi.success('导出 ' + result.exported + ' 条术语'); }
  };

  // ─── Inline editing helpers ────────────────────────────────────────
  const startInlineEdit = (record, field) => {
    setInlineEditKey(record._rowKey);
    setInlineEditField(field);
    setInlineEditValue(field === 'target' ? (record.target || '') : (record.category || '通用'));
  };

  const saveInlineEdit = () => {
    if (inlineEditKey == null || !inlineEditField) return;
    // Find the record
    const record = unifiedData.find(d => d._rowKey === inlineEditKey);
    if (!record) { cancelInlineEdit(); return; }
    if (record._type === 'glossary') {
      onUpdateGlossary(glossary.map(g =>
        g.id === record.id ? { ...g, [inlineEditField]: inlineEditValue } : g
      ));
    } else {
      onUpdateKeywords(keywords.map(kw =>
        kw.key === record.key ? { ...kw, [inlineEditField]: inlineEditValue } : kw
      ));
    }
    cancelInlineEdit();
  };

  const cancelInlineEdit = () => {
    setInlineEditKey(null);
    setInlineEditField(null);
    setInlineEditValue('');
  };

  // ─── Confirmed status toggle ──────────────────────────────────────
  const toggleConfirmed = (record) => {
    if (record._type === 'glossary') {
      onUpdateGlossary(glossary.map(g =>
        g.id === record.id ? { ...g, confirmed: !g.confirmed } : g
      ));
    } else {
      onUpdateKeywords(keywords.map(kw =>
        kw.key === record.key ? { ...kw, confirmed: !kw.confirmed } : kw
      ));
    }
  };

  // ─── Keyword extraction ───────────────────────────────────────────
  const doExtract = async () => {
    const targetPath = project?.modPath;
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }
    const taskId = startTask('术语提取');
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }
    setExtracting(true);
    onUpdateKeywords([]);
    setSelectedRowKeys([]);
    keyCounterRef.current = 0;
    setExtractPhase('structure');
    addLog('info', `开始提取术语: ${targetPath}`, '术语管理');
    updateTaskProgress('结构提取中...');
    try {
      const result = await api.extractAllKeywords({
        modPath: targetPath,
        glossary: project?.glossary || [],
        skipAI: !enableAI,
      });
      if (result?.success) {
        const msg = `提取完成：结构提取 ${result.total.structure} 个，AI提取 ${result.total.ai} 个`;
        addLog('success', msg, '术语管理');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '术语提取失败';
        addLog('error', errMsg, '术语管理');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `提取出错: ${err.message}`, '术语管理');
      failTask(`提取出错: ${err.message}`);
      messageApi.error('提取出错: ' + err.message);
      setExtracting(false);
      setExtractPhase('');
    }
  };

  const handleExtract = async () => {
    const targetPath = project?.modPath;
    if (!targetPath) {
      messageApi.warning('请先在基本信息页设置MOD文件夹路径');
      return;
    }
    if (keywords.length > 0) {
      Modal.confirm({
        title: '重新提取术语',
        content: `当前已有 ${keywords.length} 个提取的术语，重新提取将覆盖现有结果。是否继续？`,
        okText: '确认提取',
        cancelText: '取消',
        onOk() { (async () => { await doExtract(); })(); },
      });
      return;
    }
    await doExtract();
  };

  // ─── Keyword translation ──────────────────────────────────────────
  const handleTranslateKeywords = async () => {
    const untranslated = keywords.filter(kw => !kw.confirmed && (!kw.target || !kw.target.trim()));
    if (untranslated.length === 0) {
      messageApi.info('没有需要翻译的术语');
      return;
    }
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }
    const taskId = startTask(`翻译 ${untranslated.length} 个术语`);
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }
    setTranslating(true);
    addLog('info', `开始翻译 ${untranslated.length} 个术语`, '术语管理');
    const confirmedGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim())
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category }));
    try {
      const result = await api.translateKeywords({
        keywords: untranslated.map(kw => ({ source: kw.source, category: kw.category })),
        extraGlossary: confirmedGlossary,
      });
      if (result?.success) {
        const translationMap = new Map();
        for (const item of result.data) {
          if (item.source && item.target) {
            translationMap.set(item.source.toLowerCase(), item.target);
          }
        }
        const updatedKws = keywords.map(kw => {
          const translation = translationMap.get(kw.source.toLowerCase());
          return translation ? { ...kw, target: translation } : kw;
        });
        onUpdateKeywords(updatedKws);
        const translated = result.data.filter(d => d.target).length;
        const msg = `已翻译 ${translated} 个术语`;
        addLog('success', msg, '术语管理');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '术语翻译失败';
        addLog('error', errMsg, '术语管理');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `翻译出错: ${err.message}`, '术语管理');
      failTask(`翻译出错: ${err.message}`);
      messageApi.error('翻译出错: ' + err.message);
    } finally {
      setTranslating(false);
    }
  };

  // ─── Keyword polishing ────────────────────────────────────────────
  const handlePolishKeywords = async () => {
    const unconfirmedTranslated = keywords.filter(kw => !kw.confirmed && kw.target && kw.target.trim());
    if (unconfirmedTranslated.length === 0) {
      messageApi.warning('没有可润色的术语');
      return;
    }
    if (isTaskRunning) {
      messageApi.warning('已有任务正在执行，请等待完成后再操作');
      return;
    }
    const taskId = startTask(`润色 ${unconfirmedTranslated.length} 个术语`);
    if (!taskId) {
      messageApi.warning('已有任务正在执行');
      return;
    }
    setPolishing(true);
    addLog('info', `开始润色 ${unconfirmedTranslated.length} 个术语`, '术语管理');
    const confirmedGlossary = keywords
      .filter(kw => kw.confirmed && kw.target && kw.target.trim())
      .map(kw => ({ source: kw.source, target: kw.target, category: kw.category }));
    try {
      const result = await api.polishKeywords({
        keywords: unconfirmedTranslated.map(kw => ({ source: kw.source, target: kw.target || '', category: kw.category })),
        extraGlossary: confirmedGlossary,
      });
      if (result?.success) {
        const polishMap = new Map();
        for (const item of result.data) {
          if (item.source && item.target) {
            polishMap.set(item.source.toLowerCase(), item.target);
          }
        }
        const updatedKws = keywords.map(kw => {
          const polished = polishMap.get(kw.source.toLowerCase());
          return polished ? { ...kw, target: polished } : kw;
        });
        onUpdateKeywords(updatedKws);
        const origMap = new Map(unconfirmedTranslated.map(kw => [kw.source.toLowerCase(), kw.target || '']));
        const changed = result.data.filter(d => {
          const origTarget = origMap.get(d.source?.toLowerCase());
          return origTarget !== undefined && d.target !== origTarget;
        }).length;
        const msg = `润色完成，${changed} 个术语有变更`;
        addLog('success', msg, '术语管理');
        completeTask(msg);
        messageApi.success(msg);
      } else {
        const errMsg = result?.error || '术语润色失败';
        addLog('error', errMsg, '术语管理');
        failTask(errMsg);
        messageApi.error(errMsg);
      }
    } catch (err) {
      addLog('error', `润色出错: ${err.message}`, '术语管理');
      failTask(`润色出错: ${err.message}`);
      messageApi.error('润色出错: ' + err.message);
    } finally {
      setPolishing(false);
    }
  };

  // ─── Confirm selected ─────────────────────────────────────────────
  const handleConfirmSelected = () => {
    if (selectedRowKeys.length === 0) return;
    const selectedSet = new Set(selectedRowKeys);
    // Update glossary entries
    const updatedGlossary = glossary.map(g => {
      const rowKey = `g_${g.id}`;
      return selectedSet.has(rowKey) ? { ...g, confirmed: true } : g;
    });
    onUpdateGlossary(updatedGlossary);
    // Update keywords
    const updatedKw = keywords.map(kw => {
      const rowKey = kw.key || `k_${kw.source}`;
      return selectedSet.has(rowKey) ? { ...kw, confirmed: true } : kw;
    });
    onUpdateKeywords(updatedKw);
    messageApi.success(`已审核 ${selectedRowKeys.length} 个术语`);
  };

  // ─── Delete all ──────────────────────────────────────────────────
  const handleDeleteAll = () => {
    if (unifiedData.length === 0) return;
    Modal.confirm({
      title: '删除全部术语',
      content: `确定要删除全部 ${unifiedData.length} 个术语吗？此操作不可撤销。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        // Delete all glossary entries in parallel
        await Promise.all(glossary.map(g => api.removeGlossaryEntry(g.id)));
        onUpdateGlossary([]);
        onUpdateKeywords([]);
        setSelectedRowKeys([]);
        messageApi.success('已删除全部术语');
      },
    });
  };

  // ─── Table columns ────────────────────────────────────────────────
  const allCategories = [...new Set([...CATEGORIES, ...KEYWORD_CATEGORIES])];

  const columns = [
    {
      title: '原文',
      dataIndex: 'source',
      key: 'source',
      width: '25%',
      sorter: (a, b) => a.source.localeCompare(b.source),
      render: (text, record) => (
        <span style={{ fontSize: 12 }}>
          {record.confirmed && (
            <CheckOutlined style={{ color: '#52c41a', marginRight: 4, fontSize: 10 }} />
          )}
          {text}
        </span>
      ),
    },
    {
      title: '译文',
      dataIndex: 'target',
      key: 'target',
      width: '25%',
      render: (text, record) => {
        if (inlineEditKey === record._rowKey && inlineEditField === 'target') {
          return (
            <Input
              size="small"
              value={inlineEditValue}
              onChange={(e) => setInlineEditValue(e.target.value)}
              onPressEnter={saveInlineEdit}
              onBlur={saveInlineEdit}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelInlineEdit(); }}
              autoFocus
              style={{ fontSize: 12, width: '100%' }}
            />
          );
        }
        return (
          <span
            style={{ color: text ? '#52c41a' : '#555', fontSize: 12, cursor: 'pointer' }}
            onClick={() => startInlineEdit(record, 'target')}
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
      width: '12%',
      filters: allCategories.map(c => ({ text: c, value: c })),
      onFilter: (value, record) => record.category === value,
      render: (text, record) => {
        if (inlineEditKey === record._rowKey && inlineEditField === 'category') {
          return (
            <Select
              size="small"
              value={inlineEditValue}
              onChange={(val) => setInlineEditValue(val)}
              onBlur={saveInlineEdit}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelInlineEdit(); }}
              autoFocus
              open
              style={{ width: '100%', fontSize: 11 }}
              options={allCategories.map(c => ({ value: c, label: c }))}
            />
          );
        }
        return (
          <Tag
            style={{ fontSize: 11, cursor: 'pointer' }}
            onClick={() => startInlineEdit(record, 'category')}
          >
            {text || '通用'}
          </Tag>
        );
      },
    },
    {
      title: '来源',
      key: '_type',
      width: '8%',
      filters: [
        { text: '手动', value: 'glossary' },
        { text: '提取', value: 'extracted' },
      ],
      onFilter: (value, record) => record._type === value,
      render: (_, record) => (
        <Tag
          color={record._type === 'glossary' ? 'green' : 'blue'}
          style={{ fontSize: 11 }}
        >
          {record._type === 'glossary' ? '手动' : '提取'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: '10%',
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Tooltip title={record.confirmed ? '取消审核' : '标记已审核'}>
            <Button
              size="small"
              type="text"
              icon={<CheckOutlined style={{ color: record.confirmed ? '#52c41a' : undefined }} />}
              onClick={() => toggleConfirmed(record)}
            />
          </Tooltip>
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record)} okText="确认" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar: compact grouped layout */}
      <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        {/* Row 1: Search + Glossary actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input placeholder="搜索术语..." value={searchText} onChange={handleSearchChange} allowClear style={{ width: 200 }} size="small" />
          <Select
            value={viewFilter}
            onChange={(v) => { setViewFilter(v); setCurrentPage(1); }}
            size="small"
            style={{ width: 100 }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'glossary', label: '手动添加' },
              { value: 'extracted', label: '提取的' },
            ]}
          />
          <Divider type="vertical" style={{ margin: '0 2px' }} />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>添加</Button>
          <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>导入CSV</Button>
          <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出CSV</Button>
          <Divider type="vertical" style={{ margin: '0 2px' }} />
          <Tooltip title="从MOD文件中提取术语">
            <Button
              size="small"
              icon={<SearchOutlined />}
              onClick={handleExtract}
              loading={extracting}
              disabled={isTaskRunning && !extracting}
            >
              提取术语
            </Button>
          </Tooltip>
          <Tooltip title="开启后提取时同时使用AI智能提取">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#8c8c8c' }}>
              <RobotOutlined /> AI
              <Switch size="small" checked={enableAI} onChange={setEnableAI} disabled={extracting} />
            </span>
          </Tooltip>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>
            共 {filteredData.length} 条
            {glossary.length > 0 && ` (手动 ${glossary.length})`}
            {keywords.length > 0 && ` (提取 ${keywords.length})`}
            {(() => {
              const confirmedCount = unifiedData.filter(d => d.confirmed).length;
              const unconfirmedCount = unifiedData.length - confirmedCount;
              return unconfirmedCount > 0 ? ` | 未审核 ${unconfirmedCount}` : '';
            })()}
          </span>
        </div>
        {/* Row 2: Batch actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {keywords.length > 0 && (
            <>
              <Button
                size="small"
                icon={<TranslationOutlined />}
                onClick={handleTranslateKeywords}
                loading={translating}
                disabled={extracting || (isTaskRunning && !translating)}
              >
                翻译提取术语
              </Button>
              <Button
                size="small"
                icon={<HighlightOutlined />}
                onClick={handlePolishKeywords}
                loading={polishing}
                disabled={extracting || (isTaskRunning && !polishing)}
              >
                润色提取术语
              </Button>
              <Divider type="vertical" style={{ margin: '0 2px' }} />
            </>
          )}
          <Button
            size="small"
            icon={<CheckOutlined />}
            onClick={handleConfirmSelected}
            disabled={selectedRowKeys.length === 0 || extracting}
          >
            审核选中 ({selectedRowKeys.length})
          </Button>
          {selectedRowKeys.length > 0 && (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeleteSelected}
            >
              删除选中 ({selectedRowKeys.length})
            </Button>
          )}
          <Divider type="vertical" style={{ margin: '0 2px' }} />
          <Tooltip title="删除项目术语表中的全部术语">
            <Button
              size="small"
              danger
              icon={<ClearOutlined />}
              onClick={handleDeleteAll}
              disabled={unifiedData.length === 0 || extracting}
            >
              删除全部
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Extraction progress indicator */}
      {extracting && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <RobotOutlined spin style={{ color: '#1677ff' }} />
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>
            {extractPhase === 'structure' && '正在进行结构化提取...'}
            {extractPhase === 'ai' && `AI智能提取中... 已发现 ${keywords.filter(k => k.extractType === 'ai').length} 个术语`}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="keyword-table-wrapper">
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table
            dataSource={filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
            columns={columns}
            rowKey="_rowKey"
            size="small"
            pagination={false}
            tableLayout="fixed"
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
              preserveSelectedRowKeys: true,
            }}
          />
        </div>
        <div style={{ flexShrink: 0, padding: '8px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={filteredData.length}
            onChange={(page, size) => { setCurrentPage(page); setPageSize(size); }}
            onShowSizeChange={(_, size) => { setPageSize(size); setCurrentPage(1); }}
            showSizeChanger
            pageSizeOptions={['10', '20', '50', '100']}
            showTotal={t => '共 ' + t + ' 条'}
            size="small"
          />
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal title={editingEntry ? '编辑术语' : '添加术语'} open={isModalOpen} onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)} okText="确认" cancelText="取消" width={480}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="原文（英文）" name="source" rules={[{ required: true, message: '请输入原文' }]}>
            <Input placeholder="如: Volantian Reclamation Initiative" />
          </Form.Item>
          <Form.Item label="译文（中文）" name="target" rules={[{ required: true, message: '请输入译文' }]}>
            <Input placeholder="如: 沃兰提安复兴倡议" />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Select options={allCategories.map(c => ({ value: c, label: c }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ─── Public Glossary Tab (full management) ───────────────────────────

function PublicGlossaryTab({ messageApi }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const handleSearchChange = (e) => { setSearchText(e.target.value); setCurrentPage(1); };
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await api.getBuiltinGlossary();
      setEntries(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = (() => {
    const base = searchText.trim()
      ? entries
          .map((e, i) => ({ ...e, _origIdx: i }))
          .filter(e =>
            e.source.toLowerCase().includes(searchText.toLowerCase()) ||
            e.target.toLowerCase().includes(searchText.toLowerCase())
          )
      : entries.map((e, i) => ({ ...e, _origIdx: i }));
    return base;
  })();

  const handleAdd = () => {
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({ category: '通用' });
    setIsModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditingEntry(record);
    form.setFieldsValue({ source: record.source, target: record.target, category: record.category });
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      let newEntries;
      if (editingEntry !== null) {
        newEntries = entries.map((e, i) => i === editingEntry._origIdx ? { ...e, ...values } : e);
      } else {
        newEntries = [...entries, values];
      }
      await api.saveBuiltinGlossary(newEntries);
      setEntries(newEntries);
      setIsModalOpen(false);
      messageApi.success(editingEntry !== null ? '术语更新成功' : '术语添加成功');
    } catch {}
  };

  const handleDelete = async (origIdx) => {
    const newEntries = entries.filter((_, i) => i !== origIdx);
    await api.saveBuiltinGlossary(newEntries);
    setEntries(newEntries);
    messageApi.success('术语已删除');
  };

  const handleImport = async () => {
    const result = await api.importBuiltinGlossary();
    if (result?.success) {
      setEntries(result.data);
      messageApi.success(`导入成功，共 ${result.data.length} 条`);
    }
  };

  const handleExport = async () => {
    const result = await api.exportBuiltinGlossary();
    if (result?.success) messageApi.success(`已导出 ${result.exported} 条术语`);
  };

  const handleReset = () => {
    Modal.confirm({
      title: '重置公共术语表',
      content: '将恢复公共术语表为内置默认值，是否继续？',
      okText: '确认重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const result = await api.resetBuiltinGlossary();
        if (result?.success) {
          setEntries(result.data || []);
          messageApi.success('公共术语表已重置为默认值');
        }
      },
    });
  };

  const columns = [
    { title: '原文', dataIndex: 'source', key: 'source', width: '30%', sorter: (a, b) => a.source.localeCompare(b.source) },
    { title: '译文', dataIndex: 'target', key: 'target', width: '30%', sorter: (a, b) => a.target.localeCompare(b.target) },
    { title: '分类', dataIndex: 'category', key: 'category', width: '20%',
      filters: CATEGORIES.map(c => ({ text: c, value: c })),
      onFilter: (value, record) => record.category === value },
    { title: '操作', key: 'actions', width: '20%',
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />}
            onClick={() => handleEdit(record)} />
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record._origIdx)} okText="确认" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <Input placeholder="搜索术语..." value={searchText} onChange={handleSearchChange}
          allowClear style={{ width: 220 }} size="small" />
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>添加</Button>
        <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>导入</Button>
        <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
        <Button size="small" danger icon={<ReloadOutlined />} onClick={handleReset}>重置默认</Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>共 {entries.length} 条</span>
      </div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8, flexShrink: 0 }}>
        公共术语表中的术语在 AI 翻译时会自动注入到所有项目的提示词中。
      </div>
      <div className="keyword-table-wrapper">
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table dataSource={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
            columns={columns} rowKey={(r) => r._origIdx} size="small"
            loading={loading} pagination={false} tableLayout="fixed" />
        </div>
        <div style={{ flexShrink: 0, padding: '8px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            onChange={(page, size) => { setCurrentPage(page); setPageSize(size); }}
            onShowSizeChange={(_, size) => { setPageSize(size); setCurrentPage(1); }}
            showSizeChanger
            pageSizeOptions={['10', '20', '50', '100']}
            showTotal={t => `共 ${t} 条`}
            size="small"
          />
        </div>
      </div>
      <Modal title={editingEntry !== null ? '编辑术语' : '添加术语'} open={isModalOpen}
        onOk={handleModalOk} onCancel={() => setIsModalOpen(false)} okText="确认" cancelText="取消" width={480}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="原文（英文）" name="source" rules={[{ required: true, message: '请输入原文' }]}>
            <Input placeholder="如: Hegemony" />
          </Form.Item>
          <Form.Item label="译文（中文）" name="target" rules={[{ required: true, message: '请输入译文' }]}>
            <Input placeholder="如: 霸主" />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Select options={CATEGORIES.map(c => ({ value: c, label: c }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────

export default function GlossaryPanel({ project, onUpdateGlossary, onUpdateKeywords, messageApi }) {
  const tabItems = [
    {
      key: 'project',
      label: '项目术语表',
      children: (
        <ProjectGlossaryTab
          project={project}
          onUpdateGlossary={onUpdateGlossary}
          onUpdateKeywords={onUpdateKeywords}
          messageApi={messageApi}
        />
      ),
    },
    {
      key: 'builtin',
      label: <><BookOutlined /> 公共术语表</>,
      children: <PublicGlossaryTab messageApi={messageApi} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Tabs items={tabItems} size="small" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} />
    </div>
  );
}
