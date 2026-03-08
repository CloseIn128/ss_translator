import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Select, Space, Modal, Form, Popconfirm, Tabs, Tag } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ImportOutlined,
  ExportOutlined,
  EditOutlined,
  BookOutlined,
} from '@ant-design/icons';
const api = window.electronAPI;
const CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '战舰系统', '游戏术语', '人名/地名', '其他'];

// ─── Project Glossary ─────────────────────────────────────────────────

function ProjectGlossaryTab({ project, onUpdateGlossary, messageApi }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const glossary = project.glossary || [];
  const filteredGlossary = searchText.trim()
    ? glossary.filter(g =>
        g.source.toLowerCase().includes(searchText.toLowerCase()) ||
        g.target.toLowerCase().includes(searchText.toLowerCase()))
    : glossary;
  const handleAdd = () => {
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({ category: '通用' });
    setIsModalOpen(true);
  };
  const handleEdit = (record) => {
    setEditingEntry(record);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };
  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingEntry) {
        const result = await api.updateGlossaryEntry({ projectId: project.id, id: editingEntry.id, ...values });
        if (result) {
          onUpdateGlossary(glossary.map(g => g.id === editingEntry.id ? { ...g, ...values } : g));
        }
      } else {
        const result = await api.addGlossaryEntry({ projectId: project.id, ...values });
        if (result) { onUpdateGlossary([...glossary, result]); }
      }
      setIsModalOpen(false);
      messageApi.success(editingEntry ? '术语更新成功' : '术语添加成功');
    } catch (err) { /* form validation */ }
  };
  const handleDelete = async (id) => {
    await api.removeGlossaryEntry(id);
    onUpdateGlossary(glossary.filter(g => g.id !== id));
    messageApi.success('术语已删除');
  };
  const handleImport = async () => {
    const result = await api.importGlossary(project.id);
    if (result) { onUpdateGlossary([...glossary, ...result.entries]); messageApi.success('导入 ' + result.imported + ' 条术语'); }
  };
  const handleExport = async () => {
    const result = await api.exportGlossary(project.id);
    if (result) { messageApi.success('导出 ' + result.exported + ' 条术语'); }
  };
  const columns = [
    { title: '原文', dataIndex: 'source', key: 'source', width: '30%', sorter: (a, b) => a.source.localeCompare(b.source) },
    { title: '译文', dataIndex: 'target', key: 'target', width: '30%' },
    { title: '分类', dataIndex: 'category', key: 'category', width: '15%',
      filters: CATEGORIES.map(c => ({ text: c, value: c })),
      onFilter: (value, record) => record.category === value },
    { title: '操作', key: 'actions', width: '15%',
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record.id)} okText="确认" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <Input placeholder="搜索术语..." value={searchText} onChange={e => setSearchText(e.target.value)} allowClear style={{ width: 250 }} size="small" />
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>添加术语</Button>
        <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>导入CSV</Button>
        <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出CSV</Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>共 {glossary.length} 条术语</span>
      </div>
      <div className="keyword-table-wrapper">
        <Table dataSource={filteredGlossary} columns={columns} rowKey="id" size="small"
          pagination={{
            pageSize,
            onShowSizeChange: (_, size) => setPageSize(size),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => '共 ' + t + ' 条',
          }} />
      </div>
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
            <Select options={CATEGORIES.map(c => ({ value: c, label: c }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ─── Built-in Glossary Reference Tab ─────────────────────────────────

function BuiltinGlossaryTab({ messageApi }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setLoading(true);
    api.getBuiltinGlossary().then(data => {
      setEntries(data || []);
      setLoading(false);
    });
  }, []);

  const filtered = searchText.trim()
    ? entries
        .map((e, i) => ({ ...e, _origIdx: i }))
        .filter(e =>
          e.source.toLowerCase().includes(searchText.toLowerCase()) ||
          e.target.toLowerCase().includes(searchText.toLowerCase()))
    : entries.map((e, i) => ({ ...e, _origIdx: i }));

  const columns = [
    { title: '原文', dataIndex: 'source', key: 'source', width: '35%', sorter: (a, b) => a.source.localeCompare(b.source) },
    { title: '译文', dataIndex: 'target', key: 'target', width: '35%' },
    { title: '分类', dataIndex: 'category', key: 'category', width: '30%',
      filters: CATEGORIES.map(c => ({ text: c, value: c })),
      onFilter: (value, record) => record.category === value,
      render: (cat) => <Tag color="blue">{cat}</Tag> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <Input placeholder="搜索术语..." value={searchText} onChange={e => setSearchText(e.target.value)}
          allowClear style={{ width: 250 }} size="small" />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>共 {entries.length} 条（可在"模型配置→公共词库"中管理）</span>
      </div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8, flexShrink: 0 }}>
        公共词库在 AI 翻译时自动注入到所有项目，可在"模型配置 → 公共词库"中添加/编辑。
      </div>
      <div className="keyword-table-wrapper">
        <Table dataSource={filtered} columns={columns} rowKey={(r) => r._origIdx} size="small"
          loading={loading}
          pagination={{
            pageSize,
            onShowSizeChange: (_, size) => setPageSize(size),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => `共 ${t} 条`,
          }} />
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────

export default function GlossaryPanel({ project, onUpdateGlossary, messageApi }) {
  const tabItems = [
    {
      key: 'project',
      label: '项目词库',
      children: <ProjectGlossaryTab project={project} onUpdateGlossary={onUpdateGlossary} messageApi={messageApi} />,
    },
    {
      key: 'builtin',
      label: <><BookOutlined /> 公共词库（参考）</>,
      children: <BuiltinGlossaryTab messageApi={messageApi} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Tabs items={tabItems} size="small" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} />
    </div>
  );
}