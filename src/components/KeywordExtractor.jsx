import React, { useState } from 'react';
import { Button, Table, Input, Tag, Space, Tooltip, Divider } from 'antd';
import {
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  RobotOutlined,
} from '@ant-design/icons';

const api = window.electronAPI;

export default function KeywordExtractor({ project, onUpdateGlossary, messageApi }) {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [modPath, setModPath] = useState(project?.modPath || '');

  const handleSelectFolder = async () => {
    const path = await api.selectModFolder();
    if (path) setModPath(path);
  };

  // Structure-based extraction (existing)
  const handleExtract = async () => {
    const targetPath = modPath || project?.modPath;
    if (!targetPath) {
      messageApi.warning('请先选择MOD文件夹');
      return;
    }
    setLoading(true);
    setKeywords([]);
    setSelectedRowKeys([]);
    try {
      const result = await api.extractKeywords(targetPath);
      if (result?.success) {
        const mapped = result.data.map((kw, i) => ({
          ...kw,
          key: `struct_${i}`,
          source: kw.original,
          target: '',
          category: '通用',
          extractType: 'structure',
        }));
        setKeywords(mapped);
        messageApi.success(`结构提取到 ${result.data.length} 个关键词`);
      } else {
        messageApi.error(result?.error || '关键词提取失败');
      }
    } catch (err) {
      messageApi.error('提取出错: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // AI-enhanced extraction (new)
  const handleAIExtract = async () => {
    const targetPath = modPath || project?.modPath;
    if (!targetPath) {
      messageApi.warning('请先选择MOD文件夹');
      return;
    }
    setAiLoading(true);
    try {
      const result = await api.aiExtractKeywords({
        modPath: targetPath,
        glossary: project?.glossary || [],
      });
      if (result?.success) {
        // Merge with existing keywords, avoiding duplicates
        const existingSources = new Set(keywords.map(k => k.source.toLowerCase()));
        const newKeywords = result.data
          .filter(kw => !existingSources.has(kw.source.toLowerCase()))
          .map((kw, i) => ({
            ...kw,
            key: `ai_${Date.now()}_${i}`,
            original: kw.source,
            context: kw.category,
            file: '',
            extractType: 'ai',
          }));
        setKeywords(prev => [...prev, ...newKeywords]);
        messageApi.success(`AI提取到 ${newKeywords.length} 个新关键词`);
      } else {
        messageApi.error(result?.error || 'AI关键词提取失败');
      }
    } catch (err) {
      messageApi.error('AI提取出错: ' + err.message);
    } finally {
      setAiLoading(false);
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
      title: '参考译文',
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
        { text: '人名/地名', value: '人名/地名' },
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
        return <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.context}</span>;
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
          onClick={handleExtract}
          loading={loading}
        >
          结构提取
        </Button>
        <Button
          size="small"
          icon={<RobotOutlined />}
          onClick={handleAIExtract}
          loading={aiLoading}
        >
          AI智能提取
        </Button>
        {keywords.length > 0 && (
          <>
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
              disabled={selectedRowKeys.length === 0}
            >
              添加到词库 ({selectedRowKeys.length})
            </Button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>
              共 {filteredKeywords.length} 个关键词
            </span>
          </>
        )}
      </div>

      {keywords.length === 0 && !loading && !aiLoading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          <SearchOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div style={{ marginBottom: 8 }}>选择MOD文件夹后提取关键词</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            <b>结构提取</b>：基于MOD文件结构快速识别舰船名、武器名、势力名等字段
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            <b>AI智能提取</b>：通过AI分析文本内容，识别隐藏在描述和对话中的专有名词（需先在"设置"中配置AI服务）
          </div>
        </div>
      )}

      {keywords.length > 0 && (
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
