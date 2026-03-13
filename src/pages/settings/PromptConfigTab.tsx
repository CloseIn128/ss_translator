import { useState, useEffect, useCallback, useRef } from 'react';
import { Form, Input, Button, Card, Modal } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { MessageInstance } from 'antd/es/message/interface';

const api = window.electronAPI;

interface PromptConfigTabProps {
  messageApi: MessageInstance;
}

export default function PromptConfigTab({ messageApi }: PromptConfigTabProps) {
  const [form] = Form.useForm();
  const [defaults, setDefaults] = useState({ systemPrompt: '', polishPrompt: '', keywordPrompt: '' });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const [config, defaultPrompts] = await Promise.all([
        api.getConfig(),
        api.getDefaultPrompts(),
      ]);
      setDefaults(defaultPrompts || { systemPrompt: '', polishPrompt: '', keywordPrompt: '' });
      form.setFieldsValue({
        systemPrompt: config?.systemPrompt || '',
        polishPrompt: config?.polishPrompt || '',
        keywordPrompt: config?.keywordPrompt || '',
      });
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
        await api.configure(values);
      } catch { /* validation error */ }
    }, 1000);
  }, [form]);

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
        <Form form={form} layout="vertical" onValuesChange={debouncedSave}>
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
            <Button danger icon={<ReloadOutlined />} onClick={() => {
              Modal.confirm({
                title: '重置提示词',
                content: '将恢复所有提示词为默认值，是否继续？',
                okText: '确认重置',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: async () => {
                  handleResetSystem();
                  handleResetPolish();
                  handleResetKeyword();
                  setTimeout(async () => {
                    try {
                      const values = await form.validateFields();
                      await api.configure(values);
                      messageApi.success('提示词已重置并保存');
                    } catch { /* ignore */ }
                  }, 100);
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
          <li>提示词修改后自动保存，无需手动点击保存</li>
        </ul>
      </Card>
    </div>
  );
}
