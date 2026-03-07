import React, { useState, useEffect, useRef } from 'react';
import { Button, Table, Input, Tag, Space, Tooltip, Divider } from 'antd';
import {
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  RobotOutlined,
  TranslationOutlined,
} from '@ant-design/icons';

const api = window.electronAPI;

export default function KeywordExtractor({ project, onUpdateGlossary, messageApi }) {
  const [keywords, setKeywords] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [modPath, setModPath] = useState(project?.modPath || '');
  const [extractPhase, setExtractPhase] = useState(''); // 'structure' | 'ai' | ''
  const keyCounterRef = useRef(0);
  const batchHandlerRef = useRef(null);

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

  const handleSelectFolder = async () => {
    const path = await api.selectModFolder();
    if (path) setModPath(path);
  };

  // Unified extraction: structural first, then AI (incremental)
  const handleExtractAll = async () => {
    const targetPath = modPath || project?.modPath;
    if (!targetPath) {
      messageApi.warning('请先选择MOD文件夹');
      return;
    }
    setExtracting(true);
    setKeywords([]);
    setSelectedRowKeys([]);
    keyCounterRef.current = 0;
    setExtractPhase('structure');

    try {
      const result = await api.extractAllKeywords({
        modPath: targetPath,
        glossary: project?.glossary || [],
      });
      if (result?.success) {
        messageApi.success(
          `提取完成：结构提取 ${result.total.structure} 个，AI提取 ${result.total.ai} 个`
        );
      } else {
        messageApi.error(result?.error || '关键词提取失败');
      }
    } catch (err) {
      messageApi.error('提取出错: ' + err.message);
      // Only reset on error – normal completion is driven by the 'complete' event
      setExtracting(false);
      setExtractPhase('');
    }
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

    setTranslating(true);
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
        setKeywords(prev => prev.map(kw => {
          const translation = translationMap.get(kw.source.toLowerCase());
          if (translation) {
            return { ...kw, target: translation };
          }
          return kw;
        }));
        const translated = result.data.filter(d => d.target).length;
        messageApi.success(`已翻译 ${translated} 个关键词`);
      } else {
        messageApi.error(result?.error || '关键词翻译失败');
      }
    } catch (err) {
      messageApi.error('翻译出错: ' + err.message);
    } finally {
      setTranslating(false);
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
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button icon={<FolderOpenOutlined />} onClick={handleSelectFolder} size="small">
          {modPath ? modPath.split(/[\\/]/).pop() : '选择MOD文件夹'}
        </Button>
        <Button
          type="primary"
          size="small"
          icon={<SearchOutlined />}
          onClick={handleExtractAll}
          loading={extracting}
        >
          提取关键词
        </Button>
        {keywords.length > 0 && (
          <>
            <Button
              size="small"
              icon={<TranslationOutlined />}
              onClick={handleTranslate}
              loading={translating}
              disabled={selectedRowKeys.length === 0 || extracting}
            >
              翻译关键词 ({selectedRowKeys.length})
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
              onClick={handleAddToGlossary}
              disabled={selectedRowKeys.length === 0 || extracting}
            >
              添加到词库 ({selectedRowKeys.length})
            </Button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>
              共 {filteredKeywords.length} 个关键词
            </span>
          </>
        )}
      </div>

      {extracting && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <div style={{ marginBottom: 8 }}>选择MOD文件夹后提取关键词</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            点击"提取关键词"将同时执行<b>结构提取</b>和<b>AI智能提取</b>
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
        <Table
          dataSource={filteredKeywords}
          columns={columns}
          rowKey="key"
          size="small"
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
        />
      )}
    </div>
  );
}
