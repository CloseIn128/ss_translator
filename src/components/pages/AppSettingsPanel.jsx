import React from 'react';
import { Form, InputNumber, Card, Slider } from 'antd';
import { ControlOutlined } from '@ant-design/icons';

const DEFAULT_ZOOM = 100;

export default function AppSettingsPanel({ zoomLevel, onZoomLevelChange }) {
  return (
    <div className="settings-panel-full">
      <div className="settings-tab-content">
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ControlOutlined /> 程序设置
        </div>
        <div className="settings-form-grid">
          <Form layout="vertical">
            <Form.Item label={`界面缩放 (${zoomLevel}%)`}>
              <Slider
                min={50}
                max={200}
                step={10}
                value={zoomLevel}
                onChange={v => onZoomLevelChange(v ?? DEFAULT_ZOOM)}
                marks={{ 50: '50%', 100: '100%', 150: '150%', 200: '200%' }}
              />
            </Form.Item>
          </Form>
        </div>

        <Card size="small" title="说明" style={{ marginTop: 16 }}>
          <ul style={{ fontSize: 13, color: '#8c8c8c', paddingLeft: 16, margin: 0 }}>
            <li><b>界面缩放</b>：按百分比缩放整个界面，包括所有文字、按钮和组件</li>
            <li>默认值为 100%，修改后立即生效并自动保存</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
