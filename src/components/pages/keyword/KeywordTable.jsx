import React, { useState } from 'react';
import { Table, Input, Tag, Tooltip, Pagination, Select } from 'antd';
import { CheckOutlined, EditOutlined } from '@ant-design/icons';

const CATEGORY_OPTIONS = ['通用', '势力名称', '舰船名称', '武器名称', '人名', '星球/星系名', '游戏术语', '物品名称', '其他'];

export default function KeywordTable({
  keywords,
  selectedRowKeys,
  onSelectedRowKeysChange,
  toggleConfirmed,
  updateKeyword,
}) {
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const handleSearchChange = (e) => {
    setSearchText(e.target.value);
    setCurrentPage(1);
  };

  const startEdit = (record, field) => {
    setEditingKey(record.key);
    setEditingField(field);
    setEditingValue(field === 'target' ? (record.target || '') : (record.category || '通用'));
  };

  const saveEdit = () => {
    if (editingKey == null || !editingField) return;
    updateKeyword(editingKey, editingField, editingValue);
    cancelEdit();
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingField(null);
    setEditingValue('');
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
              onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
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
      filters: CATEGORY_OPTIONS.map(c => ({ text: c, value: c })),
      onFilter: (value, record) => record.category === value,
      render: (text, record) => {
        if (editingKey === record.key && editingField === 'category') {
          return (
            <Select
              size="small"
              value={editingValue}
              onChange={(val) => { setEditingValue(val); }}
              onBlur={saveEdit}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
              autoFocus
              open
              style={{ width: '100%', fontSize: 11 }}
              options={CATEGORY_OPTIONS.map(c => ({ value: c, label: c }))}
              onSelect={(val) => { setEditingValue(val); }}
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
        const placeholder = record.extractType === 'ai' ? 'AI提取' : '—';
        return <span style={{ fontSize: 12, color: '#8c8c8c' }}>{placeholder}</span>;
      },
    },
  ];

  return (
    <>
      {/* Search bar */}
      {keywords.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Input
            placeholder="搜索关键词..."
            value={searchText}
            onChange={handleSearchChange}
            allowClear
            size="small"
            style={{ width: 200 }}
          />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>
            共 {filteredKeywords.length} 个关键词
            {keywords.some(kw => kw.confirmed) && ` | 已确认 ${keywords.filter(kw => kw.confirmed).length}`}
          </span>
        </div>
      )}

      <div className="keyword-table-wrapper">
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table
            dataSource={filteredKeywords.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
            columns={columns}
            rowKey="key"
            size="small"
            rowSelection={{
              selectedRowKeys,
              onChange: onSelectedRowKeysChange,
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
    </>
  );
}
