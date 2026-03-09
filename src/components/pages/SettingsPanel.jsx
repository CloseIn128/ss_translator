import React from 'react';
import { Tabs } from 'antd';
import { ApiOutlined, MessageOutlined } from '@ant-design/icons';
import ModelConfigTab from './settings/ModelConfigTab';
import PromptConfigTab from './settings/PromptConfigTab';

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
  ];

  return (
    <div className="centered-page-container">
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Tabs items={tabItems} size="small" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} />
      </div>
    </div>
  );
}

