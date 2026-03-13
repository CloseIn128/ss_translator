import React from 'react';
import { Button } from 'antd';
import { PlusOutlined, FolderOpenOutlined } from '@ant-design/icons';

export default function WelcomePage({ onNewProject, onLoadProject }) {
  return (
    <div className="welcome-page">
      <h1>🚀 远行星号 MOD 翻译工具</h1>
      <div className="welcome-actions">
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={onNewProject}>
          新建项目
        </Button>
        <Button size="large" icon={<FolderOpenOutlined />} onClick={onLoadProject}>
          打开项目
        </Button>
      </div>
    </div>
  );
}

