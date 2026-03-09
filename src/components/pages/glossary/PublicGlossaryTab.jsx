import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Select, Space, Modal, Form, Popconfirm, Pagination } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ImportOutlined,
  ExportOutlined,
  EditOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

const api = window.electronAPI;
const CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '战舰系统', '游戏术语', '人名/地名', '其他'];

export default function PublicGlossaryTab({ messageApi }) {
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
