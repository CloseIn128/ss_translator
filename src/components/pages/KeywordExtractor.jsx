import React, { useState, useEffect, useRef } from 'react';
import { Button, Table, Input, Tag, Space, Tooltip, Divider, Modal, Switch } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  RobotOutlined,
  TranslationOutlined,
  HighlightOutlined,
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
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [extractPhase, setExtractPhase] = useState(''); // 'structure' | 'ai' | ''
  const [enableAI, setEnableAI] = useState(true);
  const [pageSize, setPageSize] = useState(20);
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

  // Translate all keywords
  const handleTranslateAll = async () => {
    if (keywords.length === 0) return;
    await doTranslate(keywords);
  };

  // Shared translate implementation
  const doTranslate = async (toTranslate) => {
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

  // Polish all keywords for consistency
  const handlePolishAll = async () => {
    const translated = keywords.filter(kw => kw.target && kw.target.trim());
    if (translated.length === 0) {
      messageApi.warning('没有已翻译的术语可润色，请先翻译');
      return;
    }
    await doPolish(keywords);
  };

  // Shared polish implementation
  const doPolish = async (toPolish) => {
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

  const handleAddToGlossary = async () => {
    if (!project) {
      messageApi.warning('请先加载翻译项目，再添加到词库');
      return;
    }
    if (selectedRowKeys.length === 0) {
      messageApi.warning('请先勾选要添加的关键词');
      return;
    }

    const existing = new Set((project.glossary || []).map(g => g.source));
    const keywordMap = new Map(keywords.map(kw => [kw.key, kw]));
    const toAdd = selectedRowKeys
      .map(k => keywordMap.get(k))
      .filter(kw => kw && !existing.has(kw.source));

    if (toAdd.length === 0) {
      messageApi.info('所选关键词已全部存在于词库中');
      return;
    }

    let added = 0;
    const newEntries = [];
    for (const kw of toAdd) {
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

    if (added > 0 && onUpdateGlossary) {
      onUpdateGlossary([...(project.glossary || []), ...newEntries]);
    }
    messageApi.success(`已添加 ${added} 个关键词到词库`);
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

    const existing = new Set((project.glossary || []).map(g => g.source));
    const toAdd = keywords.filter(kw => kw && !existing.has(kw.source));

    if (toAdd.length === 0) {
      messageApi.info('所有关键词已全部存在于词库中');
      return;
    }

    let added = 0;
    const newEntries = [];
    for (const kw of toAdd) {
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

    if (added > 0 && onUpdateGlossary) {
      onUpdateGlossary([...(project.glossary || []), ...newEntries]);
    }
    messageApi.success(`已添加 ${added} 个关键词到词库`);
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
    },
    {
      title: '译文',
      dataIndex: 'target',
      key: 'target',
      render: (text) => text ? (
        <span style={{ color: '#52c41a', fontSize: 12 }}>{text}</span>
      ) : (
        <span style={{ color: '#555', fontSize: 12 }}>—</span>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
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
      render: (text) => <Tag style={{ fontSize: 11 }}>{text || '通用'}</Tag>,
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
            <Divider type="vertical" />
            <Input
              placeholder="搜索关键词..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
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
          <Table
            dataSource={filteredKeywords}
            columns={columns}
            rowKey="key"
            size="small"
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
              preserveSelectedRowKeys: true,
            }}
            pagination={{
              pageSize,
              onShowSizeChange: (_, size) => setPageSize(size),
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: t => `共 ${t} 条`,
            }}
          />
        </div>
      )}
    </div>
  );
}
