import React, { useState } from 'react';
import { Button, Table, Input, Tag, Space, message, Tooltip } from 'antd';
import {
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';

const api = window.electronAPI;

export default function KeywordExtractor({ project, onUpdateGlossary, messageApi }) {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [modPath, setModPath] = useState(project?.modPath || '');

  const handleSelectFolder = async () => {
    const path = await api.selectModFolder();
    if (path) setModPath(path);
  };

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
        setKeywords(result.data.map((kw, i) => ({ ...kw, key: i })));
        messageApi.success(`提取到 ${result.data.length} 个关键词`);
      } else {
        messageApi.error(result?.error || '关键词提取失败');
      }
    } catch (err) {
      messageApi.error('提取出错: ' + err.message);
    } finally {
      setLoading(false);
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
    const toAdd = selectedRowKeys
      .map(k => keywords[k])
      .filter(kw => kw && !existing.has(kw.original));

    if (toAdd.length === 0) {
      messageApi.info('所选关键词已全部存在于词库中');
      return;
    }

    let added = 0;
    const newEntries = [];
    for (const kw of toAdd) {
      const result = await api.addGlossaryEntry({
        projectId: project.id,
        source: kw.original,
        target: '',
        category: '通用',
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
        kw.original.toLowerCase().includes(searchText.toLowerCase()) ||
        kw.context.toLowerCase().includes(searchText.toLowerCase())
      )
    : keywords;

  const columns = [
    {
      title: '原文关键词',
      dataIndex: 'original',
      key: 'original',
      sorter: (a, b) => a.original.localeCompare(b.original),
    },
    {
      title: '来源上下文',
      dataIndex: 'context',
      key: 'context',
      render: (text) => <span style={{ color: '#8c8c8c', fontSize: 12 }}>{text}</span>,
    },
    {
      title: '文件',
      dataIndex: 'file',
      key: 'file',
      render: (text) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{text.split('/').pop()}</span>
        </Tooltip>
      ),
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
          提取关键词
        </Button>
        {keywords.length > 0 && (
          <>
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

      {keywords.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          <SearchOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <p>选择MOD文件夹后点击"提取关键词"，自动识别舰船名、武器名、势力名等专有名词</p>
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
