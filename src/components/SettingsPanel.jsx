import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, InputNumber, Divider, Card, Alert } from 'antd';
import { SaveOutlined, ApiOutlined } from '@ant-design/icons';

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

export default function SettingsPanel({ messageApi }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    (async () => {
      const config = await api.getAIConfig();
      if (config) {
        form.setFieldsValue({
          provider: config.provider || 'openai',
          apiKey: '',
          apiUrl: config.apiUrl || '',
          model: config.model || '',
          maxTokens: config.maxTokens || 2048,
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

      // Save config first
      await api.configureAI(values);

      // Test with a simple translation
      const result = await api.translate({
        entries: [{
          id: 'test',
          original: 'The ship accelerated into the nebula.',
          context: '测试翻译',
        }],
        glossary: [],
      });

      if (result?.success && result.data?.[0]?.translated) {
        setTestResult({
          type: 'success',
          message: `连接成功！测试翻译结果：${result.data[0].translated}`,
        });
      } else {
        setTestResult({
          type: 'error',
          message: result?.error || result?.data?.[0]?.error || '测试失败',
        });
      }
    } catch (err) {
      setTestResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-form">
      <h3 style={{ marginBottom: 16 }}>
        <ApiOutlined /> AI 翻译配置
      </h3>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item label="AI 服务商" name="provider">
            <Select options={PROVIDERS} onChange={handleProviderChange} />
          </Form.Item>

          <Form.Item
            label="API Key"
            name="apiKey"
            rules={[{ required: true, message: '请输入API Key' }]}
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>

          <Form.Item label="API 地址" name="apiUrl">
            <Input placeholder="https://api.openai.com/v1/chat/completions" />
          </Form.Item>

          <Form.Item label="模型" name="model">
            <Input placeholder="gpt-4o-mini" />
          </Form.Item>

          <Divider orientation="left" plain style={{ fontSize: 12 }}>高级参数</Divider>

          <Form.Item label="最大Token数" name="maxTokens">
            <InputNumber min={256} max={8192} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Temperature（越低越精确）" name="temperature">
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="批量翻译条数（每批）" name="batchSize">
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="请求间隔（毫秒）" name="rateLimitMs">
            <InputNumber min={0} max={10000} step={100} style={{ width: '100%' }} />
          </Form.Item>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
              保存配置
            </Button>
            <Button onClick={handleTest} loading={loading}>
              测试连接
            </Button>
          </div>
        </Form>
      </Card>

      {testResult && (
        <Alert
          type={testResult.type}
          message={testResult.type === 'success' ? '连接成功' : '连接失败'}
          description={testResult.message}
          showIcon
          closable
          onClose={() => setTestResult(null)}
        />
      )}

      <Card size="small" title="使用说明" style={{ marginTop: 16 }}>
        <ul style={{ fontSize: 13, color: '#8c8c8c', paddingLeft: 16 }}>
          <li>支持所有 OpenAI 兼容的 API（OpenAI、DeepSeek、本地 LLM 等）</li>
          <li>推荐使用 DeepSeek-chat 模型，性价比最高</li>
          <li>批量翻译时每批条数建议 3-5 条，避免输出截断</li>
          <li>名词库中的术语会自动注入到 AI 翻译提示词中</li>
          <li>润色功能会基于原文和现有翻译进行二次优化</li>
        </ul>
      </Card>
    </div>
  );
}

