import React from 'react';
import { Form, InputNumber, Card } from 'antd';
import { ControlOutlined } from '@ant-design/icons';

export default function AppSettingsPanel({ appFontSize, onAppFontSizeChange, logFontSize, onLogFontSizeChange }) {
  return (
    <div className="settings-panel-full">
      <div className="settings-tab-content">
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ControlOutlined /> 程序设置
        </div>
        <div className="settings-form-grid">
          <Form layout="vertical">
            <div className="settings-row-2">
              <Form.Item label="程序字体大小">
                <InputNumber
                  min={10}
                  max={24}
                  value={appFontSize}
                  onChange={v => onAppFontSizeChange(v ?? 13)}
                  style={{ width: '100%' }}
                  addonAfter="px"
                />
              </Form.Item>
              <Form.Item label="日志字体大小">
                <InputNumber
                  min={8}
                  max={20}
                  value={logFontSize}
                  onChange={v => onLogFontSizeChange(v ?? 12)}
                  style={{ width: '100%' }}
                  addonAfter="px"
                />
              </Form.Item>
            </div>
          </Form>
        </div>

        <Card size="small" title="说明" style={{ marginTop: 16 }}>
          <ul style={{ fontSize: 13, color: '#8c8c8c', paddingLeft: 16, margin: 0 }}>
            <li><b>程序字体大小</b>：控制主界面（翻译编辑、词库管理等）的基础字体大小</li>
            <li><b>日志字体大小</b>：控制底部日志面板的字体大小，独立于程序字体</li>
            <li>字体大小修改立即生效并自动保存</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
