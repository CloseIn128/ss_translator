import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Form, Input, Select, Button, InputNumber, Divider, Card, Alert,
  Modal,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

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

export default function ModelConfigTab({ messageApi }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const saveTimerRef = useRef(null);
  const initializedRef = useRef(false);

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
          concurrentRequests: config.concurrentRequests || 1,
          rateLimitMs: config.rateLimitMs || 500,
        });
      }
      initializedRef.current = true;
    })();
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [form]);

  const debouncedSave = useCallback(() => {
    if (!initializedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const values = await form.validateFields();
        const result = await api.configureAI(values);
        if (result?.success && values.apiKey) setHasApiKey(true);
      } catch { /* validation error */ }
    }, 800);
  }, [form]);

  const handleProviderChange = (provider) => {
    form.setFieldsValue({
      apiUrl: DEFAULT_URLS[provider] || '',
      model: DEFAULT_MODELS[provider] || '',
    });
    debouncedSave();
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
        <Form form={form} layout="vertical" onValuesChange={debouncedSave}>
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
            <Form.Item label="并发请求数" name="concurrentRequests">
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="settings-row-2">
            <Form.Item label="请求间隔（毫秒）" name="rateLimitMs">
              <InputNumber min={0} max={10000} step={100} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <li>所有配置修改后自动保存，无需手动点击保存</li>
        </ul>
      </Card>
    </div>
  );
}
