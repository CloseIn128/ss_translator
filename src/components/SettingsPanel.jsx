import React, { useState, useEffect } from 'react';
import {
  Form, Input, Select, Button, InputNumber, Divider, Card, Alert,
  Tabs, Table, Space, Modal, Popconfirm,
} from 'antd';
import {
  SaveOutlined, ApiOutlined, ReloadOutlined,
  PlusOutlined, DeleteOutlined, ImportOutlined, ExportOutlined, EditOutlined,
  BookOutlined, MessageOutlined,
} from '@ant-design/icons';

const api = window.electronAPI;

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'custom', label: '自定义 (OpenAI兼容)' },
];

const DEFAULT_URLS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  custom: '',
};

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  custom: '',
};

const CATEGORIES = ['通用', '势力名称', '舰船名称', '武器名称', '战舰系统', '游戏术语', '人名/地名', '其他'];

// ─── Model Config Tab ─────────────────────────────────────────────────

function ModelConfigTab({ messageApi }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    (async () => {
      const config = await api.getAIConfig();
      if (config) {
        setHasApiKey(!!config.hasApiKey);
        form.setFieldsValue({
          provider: config.provider || 'openai',
          apiKey: '',
          apiUrl: config.apiUrl || '',
          model: config.model || '',
          maxTokens: config.maxTokens || 4096,
          temperature: config.temperature || 0.3,
          batchSize: config.batchSize || 5,
          rateLimitMs: config.rateLimitMs || 500,
        });
      }
    })();
  }, [form]);

  const handleProviderChange = (provider) => {
    form.setFieldsValue({
      apiUrl: DEFAULT_URLS[provider] || '',
      model: DEFAULT_MODELS[provider] || '',
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const result = await api.configureAI(values);
      if (result?.success) {
        if (values.apiKey) setHasApiKey(true);
        messageApi.success('AI配置已保存');
      } else {
        messageApi.error('配置保存失败');
      }
    } catch (err) {
      // validation error
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTestResult(null);
      setLoading(true);
      await api.configureAI(values);
      const result = await api.translate({
        entries: [{ id: 'test', original: 'The ship accelerated into the nebula.', context: '测试翻译' }],
        glossary: [],
      });
      if (result?.success && result.data?.[0]?.translated) {
        setTestResult({ type: 'success', message: `连接成功！测试翻译结果：${result.data[0].translated}` });
      } else {
        setTestResult({ type: 'error', message: result?.error || result?.data?.[0]?.error || '测试失败' });
      }
    } catch (err) {
      setTestResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    Modal.confirm({
      title: '重置AI配置',
      content: '将恢复所有AI配置为默认值，已保存的API Key也会被清除，是否继续？',
      okText: '确认重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const result = await api.resetAIConfig();
        if (result?.success) {
          setHasApiKey(false);
          form.setFieldsValue({
            ...result.data,
            apiKey: '',
          });
          messageApi.success('AI配置已重置为默认值');
        }
      },
    });
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-form-grid">
        <Form form={form} layout="vertical">
          <div className="settings-row-2">
            <Form.Item label="AI 服务商" name="provider">
              <Select options={PROVIDERS} onChange={handleProviderChange} />
            </Form.Item>
            <Form.Item label="模型" name="model">
              <Input placeholder="gpt-4o-mini" />
            </Form.Item>
          </div>

          <Form.Item
            label="API Key"
            name="apiKey"
            rules={[{ required: !hasApiKey, message: '请输入API Key' }]}
            extra={hasApiKey ? '已保存 API Key，留空则保留原有密钥' : null}
          >
            <Input.Password placeholder={hasApiKey ? '（保留不变）' : 'sk-...'} />
          </Form.Item>

          <Form.Item label="API 地址" name="apiUrl">
            <Input placeholder="https://api.openai.com/v1/chat/completions" />
          </Form.Item>

          <Divider orientation="left" plain style={{ fontSize: 12 }}>高级参数</Divider>

          <div className="settings-row-2">
            <Form.Item label="最大Token数" name="maxTokens">
              <InputNumber min={256} max={32768} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Temperature（越低越精确）" name="temperature">
              <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="settings-row-2">
            <Form.Item label="批量翻译条数（每批）" name="batchSize">
              <InputNumber min={1} max={20} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="请求间隔（毫秒）" name="rateLimitMs">
              <InputNumber min={0} max={10000} step={100} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
              保存配置
            </Button>
            <Button onClick={handleTest} loading={loading}>
              测试连接
            </Button>
            <Button danger icon={<ReloadOutlined />} onClick={handleReset}>
              重置默认
            </Button>
          </div>
        </Form>
      </div>

      {testResult && (
        <Alert
          type={testResult.type}
          message={testResult.type === 'success' ? '连接成功' : '连接失败'}
          description={testResult.message}
          showIcon
          closable
          style={{ marginTop: 16 }}
          onClose={() => setTestResult(null)}
        />
      )}

      <Card size="small" title="使用说明" style={{ marginTop: 16 }}>
        <ul style={{ fontSize: 13, color: '#8c8c8c', paddingLeft: 16, margin: 0 }}>
          <li>支持所有 OpenAI 兼容的 API（OpenAI、DeepSeek、本地 LLM 等）</li>
          <li>推荐使用 DeepSeek-chat 模型，性价比最高</li>
          <li>批量翻译时每批条数建议 3-5 条，避免输出截断</li>
          <li>名词库中的术语会自动注入到 AI 翻译提示词中</li>
          <li>润色功能会基于原文和现有翻译进行二次优化</li>
          <li>配置文件保存在程序目录下的 config/ 文件夹中</li>
        </ul>
      </Card>
    </div>
  );
}

// ─── Public Glossary Tab ──────────────────────────────────────────────

function PublicGlossaryTab({ messageApi }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await api.getBuiltinGlossary();
      setEntries(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = searchText.trim()
    ? entries.filter(e =>
        e.source.toLowerCase().includes(searchText.toLowerCase()) ||
        e.target.toLowerCase().includes(searchText.toLowerCase())
      )
    : entries;

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
      let newEntries;
      if (editingEntry !== null) {
        newEntries = entries.map((e, i) => i === editingEntry._idx ? { ...e, ...values } : e);
      } else {
        newEntries = [...entries, values];
      }
      await api.saveBuiltinGlossary(newEntries);
      setEntries(newEntries);
      setIsModalOpen(false);
      messageApi.success(editingEntry !== null ? '术语更新成功' : '术语添加成功');
    } catch {}
  };

  const handleDelete = async (idx) => {
    const newEntries = entries.filter((_, i) => i !== idx);
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
      title: '重置公共词库',
      content: '将恢复公共词库为内置默认词表，是否继续？',
      okText: '确认重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const result = await api.resetBuiltinGlossary();
        if (result?.success) {
          setEntries(result.data || []);
          messageApi.success('公共词库已重置为默认值');
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
      render: (_, record, idx) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />}
            onClick={() => handleEdit({ ...record, _idx: idx })} />
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(idx)} okText="确认" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input placeholder="搜索术语..." value={searchText} onChange={e => setSearchText(e.target.value)}
          allowClear style={{ width: 220 }} size="small" />
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>添加</Button>
        <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>导入</Button>
        <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
        <Button size="small" danger icon={<ReloadOutlined />} onClick={handleReset}>重置默认</Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8c8c8c' }}>共 {entries.length} 条</span>
      </div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
        公共词库中的术语在 AI 翻译时会自动注入到所有项目的提示词中。
        用户可自行维护，并通过 JSON 或 CSV 格式导入/导出。
      </div>
      <Table dataSource={filtered} columns={columns} rowKey={(_, i) => i} size="small"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }} />
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

// ─── Prompt Config Tab ────────────────────────────────────────────────

function PromptConfigTab({ messageApi }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [defaults, setDefaults] = useState({ systemPrompt: '', polishPrompt: '', keywordPrompt: '' });

  useEffect(() => {
    (async () => {
      const [config, defaultPrompts] = await Promise.all([
        api.getAIConfig(),
        api.getDefaultPrompts(),
      ]);
      setDefaults(defaultPrompts || { systemPrompt: '', polishPrompt: '', keywordPrompt: '' });
      form.setFieldsValue({
        systemPrompt: config?.systemPrompt || '',
        polishPrompt: config?.polishPrompt || '',
        keywordPrompt: config?.keywordPrompt || '',
      });
    })();
  }, [form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const result = await api.configureAI(values);
      if (result?.success) {
        messageApi.success('提示词配置已保存');
      } else {
        messageApi.error('提示词保存失败');
      }
    } catch (err) {
      // validation error
    } finally {
      setLoading(false);
    }
  };

  const handleResetSystem = () => {
    form.setFieldsValue({ systemPrompt: defaults.systemPrompt });
  };

  const handleResetPolish = () => {
    form.setFieldsValue({ polishPrompt: defaults.polishPrompt });
  };

  const handleResetKeyword = () => {
    form.setFieldsValue({ keywordPrompt: defaults.keywordPrompt });
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-form-grid">
        <Form form={form} layout="vertical">
          <Form.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                翻译提示词
                <Button size="small" type="link" onClick={handleResetSystem} style={{ padding: 0, height: 'auto' }}>
                  恢复默认
                </Button>
              </span>
            }
            name="systemPrompt"
            extra="自定义提示词会在AI翻译时作为系统消息发送。可直接在此编辑修改。"
          >
            <Input.TextArea
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                润色/校验提示词
                <Button size="small" type="link" onClick={handleResetPolish} style={{ padding: 0, height: 'auto' }}>
                  恢复默认
                </Button>
              </span>
            }
            name="polishPrompt"
            extra="自定义提示词会在AI润色/校验时作为系统消息发送。可直接在此编辑修改。"
          >
            <Input.TextArea
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                关键词提取提示词
                <Button size="small" type="link" onClick={handleResetKeyword} style={{ padding: 0, height: 'auto' }}>
                  恢复默认
                </Button>
              </span>
            }
            name="keywordPrompt"
            extra="自定义提示词会在AI智能提取关键词时作为系统消息发送。可直接在此编辑修改。"
          >
            <Input.TextArea
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
              保存提示词
            </Button>
            <Button danger icon={<ReloadOutlined />} onClick={() => {
              Modal.confirm({
                title: '重置提示词',
                content: '将恢复所有提示词为默认值，是否继续？',
                okText: '确认重置',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => {
                  handleResetSystem();
                  handleResetPolish();
                  handleResetKeyword();
                  messageApi.info('已重置为默认提示词，请点击保存以生效');
                },
              });
            }}>
              全部重置
            </Button>
          </div>
        </Form>
      </div>

      <Card size="small" title="使用说明" style={{ marginTop: 16 }}>
        <ul style={{ fontSize: 13, color: '#8c8c8c', paddingLeft: 16, margin: 0 }}>
          <li><b>翻译提示词</b>：用于AI翻译时的系统级指令，控制翻译的风格、术语和格式要求</li>
          <li><b>润色/校验提示词</b>：用于AI润色/校验时的系统级指令，控制润色的方向和要求</li>
          <li><b>关键词提取提示词</b>：用于AI智能关键词提取时的系统级指令，控制提取的范围和格式</li>
          <li>所有提示词在初始化时已自动填入默认模板，可直接在此基础上修改</li>
          <li>名词对照表会自动注入到用户消息中，无需在提示词中手动添加</li>
          <li>提示词修改后需点击"保存提示词"按钮才能生效</li>
        </ul>
      </Card>
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────

export default function SettingsPanel({ messageApi }) {
  const tabItems = [
    {
      key: 'model',
      label: <><ApiOutlined /> AI模型配置</>,
      children: <ModelConfigTab messageApi={messageApi} />,
    },
    {
      key: 'prompt',
      label: <><MessageOutlined /> 提示词配置</>,
      children: <PromptConfigTab messageApi={messageApi} />,
    },
    {
      key: 'glossary',
      label: <><BookOutlined /> 公共词库</>,
      children: <PublicGlossaryTab messageApi={messageApi} />,
    },
  ];

  return (
    <div className="settings-panel-full">
      <Tabs items={tabItems} size="small" />
    </div>
  );
}

